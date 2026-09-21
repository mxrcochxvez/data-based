/* Authed periodic sync. localStorage (databased.v1) stays the offline source of truth.
   v1 merge is last-write-wins on numeric updatedAt: a newer local draft is never
   replaced by an older server copy. Concurrent edits can drop the older write.
   Open-board poll GETs /api/sync every INTERVAL_MS (backoff on errors). Idle
   pan/zoom does not bump updatedAt, so it cannot clobber the other device. */
(function (global) {
  const KEY = "databased.v1";
  const LEGACY = "data-based.v1";
  const ENDPOINT = "/api/sync";
  const INTERVAL_MS = 4000;
  const MAX_INTERVAL_MS = 32000;
  const KICK_MS = 400;

  let lastPayload = "";
  let lastPutAt = 0;
  let timer = 0;
  let kickTimer = 0;
  let delay = INTERVAL_MS;
  let fails = 0;
  let busy = false;
  let booted = false;
  let applying = false;

  function isAuthed() {
    try {
      if (global.Clerk) {
        return Boolean(
          (global.Clerk.user && global.Clerk.user.id) ||
          (global.Clerk.session && global.Clerk.session.id)
        );
      }
    } catch (_) {}
    const access = global.DataBasedAccess;
    if (access && access.session && access.session.clerk) return false;
    return Boolean(access && access.hasAppAccess && access.hasAppAccess());
  }

  function authHeaders() {
    if (global.DataBasedAccess && typeof global.DataBasedAccess.headers === "function") {
      return Promise.resolve(global.DataBasedAccess.headers());
    }
    return Promise.resolve({ "Content-Type": "application/json" });
  }

  function parse(raw) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : null;
    } catch (_) {
      return null;
    }
  }

  function docUpdatedAt(doc) {
    if (!doc) return 0;
    let max = Number(doc.updatedAt) || 0;
    const boards = Array.isArray(doc.boards) ? doc.boards : [];
    for (let i = 0; i < boards.length; i++) {
      const t = Number(boards[i] && boards[i].updatedAt) || 0;
      if (t > max) max = t;
    }
    return max;
  }

  function liveStore() {
    if (global.DB && global.DB.store) return global.DB.store;
    if (global.Boards && global.Boards.store) return global.Boards.store;
    return null;
  }

  function fn(name) {
    if (global.DB && typeof global.DB[name] === "function") return global.DB[name];
    if (typeof global[name] === "function") return global[name];
    if (global.Boards && typeof global.Boards[name] === "function") return global.Boards[name];
    return null;
  }

  function boardOpen() {
    const store = liveStore();
    if (!store || !store.currentId || !Array.isArray(store.boards) || !store.boards.length) return false;
    return Boolean(document.getElementById("scroller"));
  }

  function typing() {
    const t = document.activeElement;
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || Boolean(t && t.isContentEditable);
  }

  function pendingPersist() {
    return Boolean(global.Persist && typeof global.Persist.pending === "function" && global.Persist.pending());
  }

  function pointerDragging() {
    const select = global.DataBasedSelect;
    if (select && typeof select.isDragging === "function" && select.isDragging()) return true;
    const state = (global.DB && global.DB.state) || (global.Boards && global.Boards.api && global.Boards.api.state);
    if (!state) return false;
    return Boolean(state.dragged || state.drag);
  }

  function boardBody(b) {
    if (global.Persist && typeof global.Persist.boardContent === "function") return global.Persist.boardContent(b);
    if (!b) return "";
    return JSON.stringify({
      id: b.id,
      name: b.name,
      cards: b.cards,
      edges: b.edges,
      nextId: b.nextId,
      placeAt: b.placeAt,
      grants: b.grants,
    });
  }

  function contentKey(doc) {
    if (!doc || !Array.isArray(doc.boards)) return "";
    return JSON.stringify(doc.boards.map((b) => boardBody(b)).sort());
  }

  function readDoc(flush) {
    if (flush) {
      const flushFn = fn("flushBoard");
      if (flushFn) {
        try { flushFn(); } catch (_) {}
      }
    }
    if (global.Persist && typeof global.Persist.readSync === "function") {
      const fromPersist = global.Persist.readSync();
      if (fromPersist) return fromPersist;
    }
    const store = liveStore();
    if (store && Array.isArray(store.boards)) return store;
    try {
      return parse(localStorage.getItem(KEY) || localStorage.getItem(LEGACY) || "");
    } catch (_) {
      return null;
    }
  }

  function writeLocal(doc) {
    if (global.Persist && typeof global.Persist.writeSync === "function") {
      return global.Persist.writeSync(doc);
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(doc));
    } catch (_) {}
    return doc;
  }

  function flushPending() {
    const store = liveStore();
    if (global.Persist && typeof global.Persist.flush === "function" && pendingPersist()) {
      global.Persist.flush();
      return;
    }
    const flushFn = fn("flushBoard");
    if (flushFn) {
      try { flushFn(); } catch (_) {}
    }
    if (global.Persist && typeof global.Persist.flush === "function" && store) {
      global.Persist.flush({
        boards: store.boards,
        currentId: store.currentId,
        updatedAt: store.updatedAt || Date.now(),
      });
    }
  }

  function keepCamera(board) {
    if (!board) return;
    if (global.Camera && typeof global.Camera.flush === "function") {
      try { global.Camera.flush(board); } catch (_) {}
      return;
    }
    const db = global.DB && global.DB.state;
    if (db && db.camera) {
      board.camera = {
        pan: { x: db.camera.pan.x, y: db.camera.pan.y },
        zoom: db.camera.zoom,
      };
    }
  }

  function applyRemote(doc) {
    if (pointerDragging()) return;
    if (!doc.boards.length) {
      const id = Math.random().toString(36).slice(2, 10);
      const who = (global.DataBasedAccess && global.DataBasedAccess.handle && global.DataBasedAccess.handle()) || "you";
      doc = {
        boards: [{
          id,
          name: "Board",
          cards: [],
          edges: [],
          nextId: 1,
          placeAt: { x: 88, y: 200 },
          camera: { pan: { x: 0, y: 0 }, zoom: 1 },
          grants: [{ id: "owner", handle: who, role: "owner" }],
          updatedAt: Date.now(),
        }],
        currentId: id,
        updatedAt: Date.now(),
      };
    }
    const store = liveStore();
    const keepId = store && store.currentId;
    const localBoard = store && Array.isArray(store.boards)
      ? store.boards.find((b) => b.id === keepId)
      : null;
    const remoteBoard = (doc.boards || []).find((b) => b.id === keepId);
    const sameView = Boolean(localBoard && remoteBoard && boardBody(localBoard) === boardBody(remoteBoard));
    if (store && Array.isArray(doc.boards)) {
      store.boards.length = 0;
      for (let i = 0; i < doc.boards.length; i++) store.boards.push(doc.boards[i]);
      if (keepId && store.boards.some((b) => b.id === keepId)) store.currentId = keepId;
      else store.currentId = doc.currentId;
      store.updatedAt = doc.updatedAt;
      const board = store.boards.find((b) => b.id === store.currentId) || store.boards[0];
      if (!sameView) {
        keepCamera(board);
        const hydrate = fn("hydrateBoard") || fn("hydrate");
        if (board && hydrate) {
          try { hydrate(board); } catch (_) {}
        }
        const render = fn("renderCards");
        try { if (render) render(); } catch (_) {}
      }
      const chrome = fn("renderBoardChrome") || fn("chrome");
      try { if (chrome) chrome(); } catch (_) {}
      doc.currentId = store.currentId;
      doc.updatedAt = store.updatedAt;
    }
    applying = true;
    try {
      writeLocal(doc);
    } finally {
      applying = false;
    }
    lastPayload = JSON.stringify(doc);
  }

  function quietFetch(url, opts) {
    return fetch(url, opts).then((res) => {
      if (res && res.status === 403) {
        return res.json().then((data) => {
          const access = global.DataBasedAccess;
          if (access && typeof access.deniedFromResponse === "function") {
            access.deniedFromResponse(res, data);
          }
          return null;
        }).catch(() => null);
      }
      return res && res.ok ? res : null;
    }).catch(() => null);
  }

  function localDirty(local) {
    if (pendingPersist()) return true;
    if (!lastPayload) return Boolean(local && Array.isArray(local.boards) && local.boards.length);
    const prev = parse(lastPayload);
    return contentKey(local) !== contentKey(prev);
  }

  function push(reason) {
    if (!isAuthed()) return Promise.resolve(false);
    if (reason === "interval" || reason === "kick") {
      if (pendingPersist()) flushPending();
    } else {
      flushPending();
    }
    const doc = readDoc(false);
    if (!doc || !Array.isArray(doc.boards)) return Promise.resolve(false);
    const body = JSON.stringify(doc);
    if (reason !== "unload" && body === lastPayload) return Promise.resolve(true);
    if (reason !== "unload" && lastPayload && contentKey(doc) === contentKey(parse(lastPayload))) {
      lastPayload = body;
      return Promise.resolve(true);
    }

    if (reason === "unload") {
      return authHeaders().then((headers) => fetch(ENDPOINT, {
        method: "PUT",
        headers,
        credentials: "same-origin",
        body,
        keepalive: true,
      })).then((res) => {
        if (res && res.ok) {
          lastPayload = body;
          lastPutAt = Math.max(lastPutAt, docUpdatedAt(doc));
        }
        return Boolean(res && res.ok);
      }).catch(() => false);
    }

    return authHeaders().then((headers) => quietFetch(ENDPOINT, {
      method: "PUT",
      headers,
      credentials: "same-origin",
      body,
      keepalive: reason === "hide" || reason === "unload",
    })).then((res) => {
      if (res) {
        lastPayload = body;
        lastPutAt = Math.max(lastPutAt, docUpdatedAt(doc));
      }
      return Boolean(res);
    });
  }

  function pull() {
    if (!isAuthed()) return Promise.resolve(false);
    if (typing()) return Promise.resolve(false);
    if (pointerDragging()) return Promise.resolve(false);
    return authHeaders().then((headers) => quietFetch(ENDPOINT, { headers, credentials: "same-origin" })).then((res) => {
      if (!res) return false;
      return res.json().then((remote) => {
        if (!remote || !Array.isArray(remote.boards)) return false;
        if (pointerDragging()) return false;
        const local = readDoc(false);
        const access = global.DataBasedAccess;
        const serverTruth = access && access.session && access.session.acl;
        const remoteAt = docUpdatedAt(remote);
        const localAt = Math.max(docUpdatedAt(local), lastPutAt);
        if (localAt > remoteAt) return false;
        if (localDirty(local) && localAt >= remoteAt && !serverTruth) return false;
        if (serverTruth || remoteAt > localAt || (remote.boards.length && !(local && local.boards && local.boards.length))) {
          applyRemote(remote);
          return true;
        }
        return false;
      }).catch(() => false);
    });
  }

  function arm(ms) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      cycle("interval");
    }, ms);
  }

  function ok() {
    fails = 0;
    delay = INTERVAL_MS;
  }

  function backoff() {
    fails += 1;
    delay = Math.min(INTERVAL_MS * Math.pow(2, Math.min(fails, 4)), MAX_INTERVAL_MS);
  }

  function cycle(reason) {
    if (!isAuthed() || busy) {
      if (reason === "interval") arm(delay);
      return Promise.resolve(false);
    }
    if (reason === "interval" && (document.hidden || !boardOpen() || pointerDragging())) {
      arm(delay);
      return Promise.resolve(false);
    }
    busy = true;
    const run = (reason === "hide" || reason === "unload")
      ? push(reason)
      : (localDirty(readDoc(false)) && !typing()
        ? push(reason === "kick" ? "kick" : "interval").then(() => pull())
        : pull());
    return run.then((did) => {
      ok();
      return did;
    }).catch(() => {
      backoff();
      return false;
    }).then((did) => {
      busy = false;
      if (reason !== "unload") arm(delay);
      return did;
    });
  }

  function kick() {
    if (!isAuthed() || applying || pointerDragging()) return;
    if (kickTimer) clearTimeout(kickTimer);
    kickTimer = setTimeout(() => {
      kickTimer = 0;
      if (busy) {
        kick();
        return;
      }
      cycle("kick");
    }, KICK_MS);
  }

  function onHidden() {
    if (!isAuthed()) return;
    cycle("hide");
  }

  function onUnload() {
    if (!isAuthed()) return;
    flushPending();
    push("unload");
  }

  function boot() {
    if (!isAuthed()) return;
    pull().then((applied) => {
      if (!applied) push("boot");
    }).then(() => {
      arm(INTERVAL_MS);
    });
    if (booted) return;
    booted = true;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHidden();
      else if (isAuthed() && boardOpen()) cycle("interval");
    });
    window.addEventListener("beforeunload", onUnload);
  }

  function noteLocal(doc) {
    lastPutAt = Math.max(lastPutAt, docUpdatedAt(doc || readDoc(false)));
  }

  global.DataBasedSync = {
    INTERVAL_MS,
    MAX_INTERVAL_MS,
    endpoint: ENDPOINT,
    isAuthed,
    kick,
    noteLocal,
    pointerDragging,
    push,
    pull,
  };

  function start() {
    const access = global.DataBasedAccess;
    const go = () => setTimeout(boot, 0);
    if (access && typeof access.ready === "function") {
      access.ready().then((okNow) => { if (okNow) go(); });
    } else {
      go();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
