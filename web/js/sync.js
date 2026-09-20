/* Authed periodic sync. localStorage (databased.v1) stays the offline source of truth.
   v1 merge is last-write-wins on numeric updatedAt: a newer local draft is never
   replaced by an older server copy. Concurrent edits can drop the older write. */
(function (global) {
  const KEY = "databased.v1";
  const LEGACY = "data-based.v1";
  const USER_KEY = "databased.user";
  const TOKEN_KEY = "databased.token";
  const ENDPOINT = "/api/sync";
  const INTERVAL_MS = 20000;

  let lastPayload = "";
  let timer = 0;

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

  function readDoc() {
    const flush = fn("flushBoard");
    if (flush) {
      try { flush(); } catch (_) {}
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

  function flushLocal() {
    const flush = fn("flushBoard");
    if (flush) {
      try { flush(); } catch (_) {}
    }
    const store = liveStore();
    if (global.Persist && typeof global.Persist.flush === "function" && store) {
      global.Persist.flush({
        boards: store.boards,
        currentId: store.currentId,
        updatedAt: store.updatedAt || Date.now(),
      });
      return;
    }
    const doc = readDoc();
    if (doc) writeLocal(doc);
  }

  function applyRemote(doc) {
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
    if (store && Array.isArray(doc.boards)) {
      store.boards.length = 0;
      for (let i = 0; i < doc.boards.length; i++) store.boards.push(doc.boards[i]);
      store.currentId = doc.currentId;
      store.updatedAt = doc.updatedAt;
      const board = store.boards.find((b) => b.id === store.currentId) || store.boards[0];
      const hydrate = fn("hydrateBoard") || fn("hydrate");
      if (board && hydrate) {
        try { hydrate(board); } catch (_) {}
      }
      const render = fn("renderCards");
      const chrome = fn("renderBoardChrome") || fn("chrome");
      try { if (render) render(); } catch (_) {}
      try { if (chrome) chrome(); } catch (_) {}
    }
    writeLocal(doc);
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

  function push(reason) {
    if (!isAuthed()) return Promise.resolve(false);
    const doc = readDoc();
    if (!doc || !Array.isArray(doc.boards)) return Promise.resolve(false);
    const body = JSON.stringify(doc);
    if (reason !== "unload" && body === lastPayload) return Promise.resolve(true);

    if (reason === "unload") {
      return authHeaders().then((headers) => fetch(ENDPOINT, {
        method: "PUT",
        headers,
        body,
        keepalive: true,
      })).then((res) => {
        if (res && res.ok) lastPayload = body;
        return Boolean(res && res.ok);
      }).catch(() => false);
    }

    return authHeaders().then((headers) => quietFetch(ENDPOINT, {
      method: "PUT",
      headers,
      body,
      keepalive: reason === "hide" || reason === "unload",
    })).then((res) => {
      if (res) lastPayload = body;
      return Boolean(res);
    });
  }

  function pull() {
    if (!isAuthed()) return Promise.resolve(false);
    return authHeaders().then((headers) => quietFetch(ENDPOINT, { headers })).then((res) => {
      if (!res) return false;
      return res.json().then((remote) => {
        if (!remote || !Array.isArray(remote.boards)) return false;
        flushLocal();
        const local = readDoc();
        const access = global.DataBasedAccess;
        const serverTruth = access && access.session && access.session.acl;
        if (serverTruth || docUpdatedAt(remote) > docUpdatedAt(local) || (remote.boards.length && !(local && local.boards && local.boards.length))) {
          applyRemote(remote);
          return true;
        }
        return false;
      }).catch(() => false);
    });
  }

  function kick() {
    // persist.js calls this after a local write. Interval / hide / unload do the POST.
  }

  function tick() {
    if (!isAuthed()) return;
    flushLocal();
    push("interval");
  }

  function onHidden() {
    if (!isAuthed()) return;
    flushLocal();
    push("hide");
  }

  function onUnload() {
    if (!isAuthed()) return;
    flushLocal();
    push("unload");
  }

  function boot() {
    if (!isAuthed()) return;
    pull().then((applied) => {
      if (!applied) push("boot");
    });
    if (timer) clearInterval(timer);
    timer = setInterval(tick, INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) onHidden();
    });
    window.addEventListener("beforeunload", onUnload);
  }

  global.DataBasedSync = {
    INTERVAL_MS,
    endpoint: ENDPOINT,
    isAuthed,
    kick,
    push,
    pull,
  };

  function start() {
    const access = global.DataBasedAccess;
    const go = () => setTimeout(boot, 0);
    if (access && typeof access.ready === "function") {
      access.ready().then((ok) => { if (ok) go(); });
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
