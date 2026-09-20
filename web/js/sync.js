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

  function start() {
    setTimeout(boot, 0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})(window);
