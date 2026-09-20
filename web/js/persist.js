(function (global) {
  const KEY = "databased.v1";
  const LEGACY = "data-based.v1";
  const IDB_NAME = "databased";
  const IDB_STORE = "kv";
  const LS_LIMIT = 4_000_000;

  function parse(raw) {
    try {
      const v = JSON.parse(raw);
      return v && typeof v === "object" ? v : null;
    } catch (_) {
      return null;
    }
  }

  function readLocal(key) {
    try {
      return parse(localStorage.getItem(key));
    } catch (_) {
      return null;
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function idbGet() {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(KEY);
      req.onsuccess = () => resolve(req.result && typeof req.result === "object" ? req.result : null);
      req.onerror = () => reject(req.error);
    }));
  }

  function idbSet(doc) {
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(doc, KEY);
      tx.oncomplete = () => resolve(doc);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function writeLocal(doc) {
    const raw = JSON.stringify(doc);
    if (raw.length > LS_LIMIT) throw new DOMException("payload too large", "QuotaExceededError");
    localStorage.setItem(KEY, raw);
  }

  function kickSync() {
    const sync = global.DataBasedSync;
    try {
      if (sync && typeof sync.kick === "function") sync.kick();
      else if (sync && typeof sync.push === "function") sync.push();
    } catch (_) {}
  }

  function mergeDoc(prev, next) {
    const base = prev && typeof prev === "object" ? prev : {};
    const doc = next && typeof next === "object" ? next : {};
    return {
      ...base,
      ...doc,
      boards: doc.boards,
      currentId: doc.currentId,
      updatedAt: doc.updatedAt != null ? doc.updatedAt : (base.updatedAt || Date.now()),
    };
  }

  const Persist = {
    KEY,
    _mem: null,
    _timer: 0,
    _pending: null,

    readSync() {
      const cur = readLocal(KEY);
      if (cur) return cur;
      const old = readLocal(LEGACY);
      if (old) {
        try { localStorage.setItem(KEY, JSON.stringify(old)); } catch (_) {}
        return old;
      }
      return this._mem;
    },

    async read() {
      const sync = this.readSync();
      if (sync) {
        this._mem = sync;
        return sync;
      }
      try {
        const fromIdb = await idbGet();
        if (fromIdb) {
          this._mem = fromIdb;
          return fromIdb;
        }
      } catch (_) {}
      return null;
    },

    writeSync(doc) {
      const prev = this.readSync() || this._mem || {};
      const next = mergeDoc(prev, doc);
      this._mem = next;
      try {
        writeLocal(next);
      } catch (err) {
        if (err && (err.name === "QuotaExceededError" || err.code === 22)) {
          try { localStorage.removeItem(KEY); } catch (_) {}
          idbSet(next).catch(() => {});
        } else {
          throw err;
        }
      }
      kickSync();
      return next;
    },

    flush(getDoc) {
      const src = getDoc != null ? getDoc : this._pending;
      if (this._timer) {
        clearTimeout(this._timer);
        this._timer = 0;
      }
      this._pending = null;
      if (src == null) return this._mem;
      return this.writeSync(typeof src === "function" ? src() : src);
    },

    schedule(getDoc, wait) {
      this._pending = getDoc;
      if (this._timer) clearTimeout(this._timer);
      this._timer = setTimeout(() => {
        this._timer = 0;
        const src = this._pending;
        this._pending = null;
        this.writeSync(typeof src === "function" ? src() : src);
      }, wait == null ? 160 : wait);
    },
  };

  function flushPending() {
    if (Persist._pending != null) Persist.flush();
  }

  window.addEventListener("pagehide", flushPending);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) flushPending();
  });

  global.Persist = Persist;
})(window);
