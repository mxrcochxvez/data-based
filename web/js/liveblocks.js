/* Liveblocks real-time multiplayer collaboration for Data Based.
   Powers live cursors, peer presence, peer selection rings, and instant sync broadcast. */

(async function () {
  const CDN_CLIENT = "https://cdn.jsdelivr.net/npm/@liveblocks/client/+esm";
  const FALLBACK_CLIENT = "https://esm.sh/@liveblocks/client";

  let createClient = null;
  try {
    const mod = await import(CDN_CLIENT);
    createClient = mod.createClient;
  } catch (_) {
    try {
      const mod = await import(FALLBACK_CLIENT);
      createClient = mod.createClient;
    } catch (err) {
      console.info("Liveblocks client could not be loaded (offline or CDN blocked).", err);
    }
  }

  let client = null;
  let currentRoom = null;
  let leaveCurrentRoom = null;
  let currentBoardId = null;
  let unconfigured = false;
  let pendingCursorFrame = 0;
  let lastCursorPt = null;

  function authHeaders() {
    if (window.DataBasedAccess && typeof window.DataBasedAccess.headers === "function") {
      return window.DataBasedAccess.headers();
    }
    return Promise.resolve({ "Content-Type": "application/json" });
  }

  async function authEndpoint(room) {
    const headers = await authHeaders();
    const res = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: Object.assign({}, headers, { "Content-Type": "application/json" }),
      body: JSON.stringify({ room }),
    });

    if (res.status === 503) {
      unconfigured = true;
      const data = await res.json().catch(() => ({}));
      console.info("Liveblocks not configured: " + (data.message || "Set LIVEBLOCKS_SECRET_KEY"));
      throw new Error("liveblocks_unconfigured");
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Liveblocks auth failed: " + res.status);
    }

    return await res.json();
  }

  function getClient() {
    if (client) return client;
    if (!createClient) return null;
    client = createClient({ authEndpoint });
    return client;
  }

  function cursorsContainer() {
    let el = document.getElementById("live-cursors");
    if (!el) {
      const canvas = document.getElementById("canvas");
      if (canvas) {
        el = document.createElement("div");
        el.id = "live-cursors";
        el.className = "live-cursors";
        el.setAttribute("aria-hidden", "true");
        canvas.appendChild(el);
      }
    }
    return el;
  }

  function presenceContainer() {
    let el = document.getElementById("presence-bar");
    if (!el) {
      const nav = document.querySelector("#chrome-brand .brand-nav");
      if (nav) {
        el = document.createElement("div");
        el.id = "presence-bar";
        el.className = "presence-bar";
        el.setAttribute("aria-label", "Collaborators");
        nav.prepend(el);
      }
    }
    return el;
  }

  function sanitize(str) {
    return String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderPeerCursors(others) {
    const container = cursorsContainer();
    if (!container) return;

    const existingMap = new Map();
    container.querySelectorAll(".peer-cursor").forEach((el) => {
      existingMap.set(el.dataset.connectionId, el);
    });

    const activeIds = new Set();

    others.forEach((user) => {
      const connId = String(user.connectionId);
      activeIds.add(connId);
      const presence = user.presence || {};
      const cursor = presence.cursor;
      const info = user.info || {};
      const color = info.color || "#3d7be6";
      const name = info.name || (info.email ? info.email.split("@")[0] : "Collaborator");

      let el = existingMap.get(connId);
      if (!cursor) {
        if (el) el.hidden = true;
        return;
      }

      if (!el) {
        el = document.createElement("div");
        el.className = "peer-cursor";
        el.dataset.connectionId = connId;
        el.innerHTML = `
          <svg class="peer-cursor-pointer" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
            <polygon points="0,0 12,9 7,10 4,15" fill="${sanitize(color)}" stroke="#ffffff" stroke-width="1.2" stroke-linejoin="round" />
          </svg>
          <span class="peer-cursor-label" style="background-color: ${sanitize(color)};">${sanitize(name)}</span>
        `;
        container.appendChild(el);
      }

      el.hidden = false;
      el.style.transform = `translate(${Math.round(cursor.x)}px, ${Math.round(cursor.y)}px)`;
    });

    existingMap.forEach((el, connId) => {
      if (!activeIds.has(connId)) el.remove();
    });
  }

  function renderPresenceAvatars(others) {
    const bar = presenceContainer();
    if (!bar) return;

    if (!others || !others.length) {
      bar.hidden = true;
      bar.innerHTML = "";
      return;
    }

    bar.hidden = false;
    const html = others.map((user) => {
      const info = user.info || {};
      const color = info.color || "#3d7be6";
      const name = info.name || (info.email ? info.email.split("@")[0] : "Collaborator");
      const initial = (name.trim()[0] || "C").toUpperCase();
      return `<span class="presence-avatar" title="${sanitize(name)} (${sanitize(info.email || '')})" style="background-color: ${sanitize(color)};">${sanitize(initial)}</span>`;
    }).join("");

    bar.innerHTML = html;
  }

  function renderPeerSelections(others) {
    // Clear old peer-sel classes
    document.querySelectorAll(".card.peer-selected").forEach((card) => {
      card.classList.remove("peer-selected");
      card.style.removeProperty("--peer-sel-color");
    });

    others.forEach((user) => {
      const presence = user.presence || {};
      const info = user.info || {};
      const color = info.color || "#3d7be6";
      const sel = Array.isArray(presence.selection) ? presence.selection : [];
      sel.forEach((cardId) => {
        const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
        if (cardEl && !cardEl.classList.contains("is-sel")) {
          cardEl.classList.add("peer-selected");
          cardEl.style.setProperty("--peer-sel-color", color);
        }
      });
    });
  }

  function onOthersChange(others) {
    renderPeerCursors(others);
    renderPresenceAvatars(others);
    renderPeerSelections(others);
  }

  function onRemoteEvent(eventData) {
    const event = eventData && eventData.event;
    if (!event || typeof event !== "object") return;

    if (event.type === "KICK_SYNC") {
      if (event.boardId && event.boardId === currentBoardId) {
        if (window.DataBasedSync && typeof window.DataBasedSync.pull === "function") {
          window.DataBasedSync.pull();
        }
      }
      return;
    }

    if (event.type === "CARD_DRAG") {
      if (event.boardId && event.boardId === currentBoardId && event.cardId != null) {
        const cardEl = document.querySelector(`.card[data-id="${event.cardId}"]`);
        if (cardEl && event.x != null && event.y != null) {
          cardEl.style.left = event.x + "px";
          cardEl.style.top = event.y + "px";
        }
      }
    }
  }

  async function enterBoard(boardId) {
    if (!boardId) return;
    if (currentBoardId === boardId && currentRoom) return;

    leaveBoard();
    currentBoardId = boardId;

    if (unconfigured) return;
    const c = getClient();
    if (!c) return;

    try {
      const roomId = `board:${boardId}`;
      const { room, leave } = c.enterRoom(roomId, {
        initialPresence: { cursor: null, selection: [] },
      });

      currentRoom = room;
      leaveCurrentRoom = leave;

      room.subscribe("others", onOthersChange);
      room.subscribe("event", onRemoteEvent);

      // Initial update
      onOthersChange(room.getOthers());
    } catch (e) {
      console.warn("Could not join Liveblocks room:", e);
    }
  }

  function leaveBoard() {
    if (leaveCurrentRoom) {
      try { leaveCurrentRoom(); } catch (_) {}
    }
    currentRoom = null;
    leaveCurrentRoom = null;
    currentBoardId = null;

    const container = cursorsContainer();
    if (container) container.innerHTML = "";
    const bar = presenceContainer();
    if (bar) {
      bar.innerHTML = "";
      bar.hidden = true;
    }
    document.querySelectorAll(".card.peer-selected").forEach((card) => {
      card.classList.remove("peer-selected");
      card.style.removeProperty("--peer-sel-color");
    });
  }

  function updateCursor(pt) {
    if (!currentRoom || !pt) return;
    lastCursorPt = pt;
    if (pendingCursorFrame) return;

    pendingCursorFrame = requestAnimationFrame(() => {
      pendingCursorFrame = 0;
      if (currentRoom && lastCursorPt) {
        try {
          currentRoom.updatePresence({
            cursor: { x: Math.round(lastCursorPt.x), y: Math.round(lastCursorPt.y) },
          });
        } catch (_) {}
      }
    });
  }

  function clearCursor() {
    if (pendingCursorFrame) {
      cancelAnimationFrame(pendingCursorFrame);
      pendingCursorFrame = 0;
    }
    lastCursorPt = null;
    if (!currentRoom) return;
    try {
      currentRoom.updatePresence({ cursor: null });
    } catch (_) {}
  }

  function updateSelection(ids) {
    if (!currentRoom) return;
    try {
      currentRoom.updatePresence({ selection: Array.isArray(ids) ? ids : [] });
    } catch (_) {}
  }

  function broadcastDrag(cardId, x, y) {
    if (!currentRoom || !currentBoardId) return;
    try {
      currentRoom.broadcastEvent({
        type: "CARD_DRAG",
        boardId: currentBoardId,
        cardId,
        x: Math.round(x),
        y: Math.round(y),
      });
    } catch (_) {}
  }

  function broadcastSync(boardId) {
    const targetBoardId = boardId || currentBoardId;
    if (!currentRoom || !targetBoardId) return;
    try {
      currentRoom.broadcastEvent({
        type: "KICK_SYNC",
        boardId: targetBoardId,
        updatedAt: Date.now(),
      });
    } catch (_) {}
  }

  window.DataBasedLiveblocks = {
    enterBoard,
    leaveBoard,
    updateCursor,
    clearCursor,
    updateSelection,
    broadcastDrag,
    broadcastSync,
    get activeRoom() { return currentRoom; },
    get currentBoardId() { return currentBoardId; },
    get isAvailable() { return Boolean(createClient && !unconfigured); },
  };

  // Auto-connect to current board once access is ready
  function autoStart() {
    const access = window.DataBasedAccess;
    const store = (window.DB && window.DB.store) || (window.Boards && window.Boards.store);
    const go = () => {
      const bId = store && store.currentId;
      const hash = String(location.hash || "#/").replace(/^#/, "") || "/";
      const isBoard = hash === "/" || hash === "" || hash.startsWith("/#") || !hash.match(/^\/(?:boards|invite|people|admin|mcp)/);
      if (bId && isBoard) {
        enterBoard(bId);
      }
    };

    if (access && typeof access.ready === "function") {
      access.ready().then(go).catch(go);
    } else {
      setTimeout(go, 100);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoStart);
  } else {
    autoStart();
  }
})();
