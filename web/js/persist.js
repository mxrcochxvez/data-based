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

  function num(v, fallback) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function defaultSize(kind) {
    if (kind === "note") return { w: 200, h: 160 };
    if (kind === "logic") return { w: 280, h: 164 };
    if (kind === "mind") return { w: 228, h: 140 };
    return { w: 248, h: 164 };
  }

  function layoutCard(c) {
    if (!c || typeof c !== "object") return c;
    const size = defaultSize(c.kind);
    const x = num(c.x != null ? c.x : c.left, 88);
    const y = num(c.y != null ? c.y : c.top, 200);
    const w = num(c.w != null ? c.w : c.width, size.w);
    const h = num(c.h != null ? c.h : c.height, size.h);
    c.x = x;
    c.y = y;
    c.w = w;
    c.h = h;
    c.left = x;
    c.top = y;
    c.width = w;
    c.height = h;
    if (c.z == null) c.z = 1;
    return c;
  }

  function snapshotCard(c) {
    if (!c || typeof c !== "object") return c;
    const laid = layoutCard({ ...c, body: c.body });
    return laid;
  }

  function snapshotCamera(cam) {
    const src = cam && typeof cam === "object" ? cam : {};
    const pan = src.pan && typeof src.pan === "object" ? src.pan : {};
    return {
      pan: { x: num(pan.x, 0), y: num(pan.y, 0) },
      zoom: num(src.zoom, 1) || 1,
    };
  }

  function snapshotBoard(b) {
    if (!b || typeof b !== "object") return b;
    const place = b.placeAt && typeof b.placeAt === "object" ? b.placeAt : {};
    return {
      ...b,
      cards: Array.isArray(b.cards) ? b.cards.map(snapshotCard) : [],
      edges: Array.isArray(b.edges) ? b.edges.slice() : (b.edges || []),
      placeAt: { x: num(place.x, 88), y: num(place.y, 200) },
      camera: snapshotCamera(b.camera),
    };
  }

  function snapshotDoc(doc) {
    if (!doc || typeof doc !== "object") return doc;
    return {
      ...doc,
      boards: Array.isArray(doc.boards) ? doc.boards.map(snapshotBoard) : [],
      currentId: doc.currentId,
      updatedAt: doc.updatedAt != null ? doc.updatedAt : Date.now(),
    };
  }

  function mergeDoc(prev, next) {
    const base = prev && typeof prev === "object" ? prev : {};
    const doc = next && typeof next === "object" ? next : {};
    return snapshotDoc({
      ...base,
      ...doc,
      boards: doc.boards,
      currentId: doc.currentId,
      updatedAt: doc.updatedAt != null ? doc.updatedAt : (base.updatedAt || Date.now()),
    });
  }

  const Persist = {
    KEY,
    layoutCard,
    snapshotCard,
    snapshotCamera,
    snapshotBoard,
    snapshotDoc,
    _mem: null,
    _timer: 0,
    _pending: null,

    readSync() {
      const cur = readLocal(KEY);
      if (cur) return snapshotDoc(cur);
      const old = readLocal(LEGACY);
      if (old) {
        const migrated = snapshotDoc(old);
        try { localStorage.setItem(KEY, JSON.stringify(migrated)); } catch (_) {}
        return migrated;
      }
      return this._mem ? snapshotDoc(this._mem) : null;
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
