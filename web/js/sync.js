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

    try {
      const token = (global.DB && global.DB.authToken) || localStorage.getItem(TOKEN_KEY);
      if (token) return true;
    } catch (_) {}

    try {
      if (global.DB && Object.prototype.hasOwnProperty.call(global.DB, "user") && global.DB.user == null) {
        return false;
      }
      const flag = localStorage.getItem(USER_KEY);
      if (flag === "" || flag === "signed-out" || flag === "0") return false;
      if (flag) return true;
    } catch (_) {}

    // Stub: the local “signed in as you” invite chrome counts as authed.
    return true;
  }

  function authHeaders() {
    const headers = { "Content-Type": "application/json" };
    try {
      const token = (global.DB && global.DB.authToken) || localStorage.getItem(TOKEN_KEY);
      if (token) headers.Authorization = "Bearer " + token;
    } catch (_) {}
    return headers;
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

  function readDoc() {
    if (global.DB && typeof global.DB.flushBoard === "function") {
      try { global.DB.flushBoard(); } catch (_) {}
    }
    if (global.Persist && typeof global.Persist.readSync === "function") {
      const fromPersist = global.Persist.readSync();
      if (fromPersist) return fromPersist;
    }
    if (global.DB && global.DB.store && Array.isArray(global.DB.store.boards)) return global.DB.store;
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
    if (global.DB && typeof global.DB.flushBoard === "function") {
      try { global.DB.flushBoard(); } catch (_) {}
    }
    const store = global.DB && global.DB.store;
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
    const db = global.DB;
    if (db && db.store && Array.isArray(doc.boards)) {
      db.store.boards.length = 0;
      for (let i = 0; i < doc.boards.length; i++) db.store.boards.push(doc.boards[i]);
      db.store.currentId = doc.currentId;
      db.store.updatedAt = doc.updatedAt;
      const board = db.store.boards.find((b) => b.id === db.store.currentId) || db.store.boards[0];
      if (board && typeof db.hydrateBoard === "function") db.hydrateBoard(board);
      if (typeof db.renderCards === "function") db.renderCards();
      if (typeof db.renderBoardChrome === "function") db.renderBoardChrome();
    }
    writeLocal(doc);
    lastPayload = JSON.stringify(doc);
  }

  function quietFetch(url, opts) {
    return fetch(url, opts).then((res) => (res && res.ok ? res : null)).catch(() => null);
  }

  function push(reason) {
    if (!isAuthed()) return Promise.resolve(false);
    const doc = readDoc();
    if (!doc || !Array.isArray(doc.boards)) return Promise.resolve(false);
    const body = JSON.stringify(doc);
    if (reason !== "unload" && body === lastPayload) return Promise.resolve(true);

    if (reason === "unload") {
      try {
        if (navigator.sendBeacon) {
          const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
          if (ok) lastPayload = body;
          return Promise.resolve(ok);
        }
      } catch (_) {}
    }

    return quietFetch(ENDPOINT, {
      method: "PUT",
      headers: authHeaders(),
      body,
      keepalive: reason === "hide" || reason === "unload",
    }).then((res) => {
      if (res) lastPayload = body;
      return Boolean(res);
    });
  }

  function pull() {
    if (!isAuthed()) return Promise.resolve(false);
    return quietFetch(ENDPOINT, { headers: authHeaders() }).then((res) => {
      if (!res) return false;
      return res.json().then((remote) => {
        if (!remote || !Array.isArray(remote.boards) || !remote.boards.length) return false;
        flushLocal();
        const local = readDoc();
        if (docUpdatedAt(remote) > docUpdatedAt(local)) {
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
