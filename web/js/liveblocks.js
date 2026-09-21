/* Liveblocks real-time multiplayer collaboration for Data Based.
   Powers live cursors, peer presence, peer selection rings, and instant sync broadcast. */

(async function () {
  const CDN_CLIENT = "https://cdn.jsdelivr.net/npm/@liveblocks/client/+esm";
  const FALLBACK_CLIENT = "https://esm.sh/@liveblocks/client";

  let createClient = null;
  let stringifyCommentBody = null;
  try {
    const mod = await import(CDN_CLIENT);
    createClient = mod.createClient;
    stringifyCommentBody = mod.stringifyCommentBody || null;
  } catch (_) {
    try {
      const mod = await import(FALLBACK_CLIENT);
      createClient = mod.createClient;
      stringifyCommentBody = mod.stringifyCommentBody || null;
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
  const threads = new Map();
  const COMMENTS_OPEN_KEY = "databased-comments-open";
  let commentsOpen = false;
  let commentsSince = null;
  let commentsPoll = 0;
  let openThreadId = "";
  let composerEl = null;
  let composerAway = null;
  let commentsBound = false;

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

  function localDragIds() {
    const select = window.DataBasedSelect;
    if (select && typeof select.dragIds === "function") return select.dragIds();
    return [];
  }

  function localDragging() {
    const select = window.DataBasedSelect;
    if (select && typeof select.isDragging === "function") return select.isDragging();
    const sync = window.DataBasedSync;
    if (sync && typeof sync.pointerDragging === "function") return sync.pointerDragging();
    return false;
  }

  function applyRemoteCardDrag(cardId, x, y) {
    const busy = localDragIds().map(String);
    if (busy.indexOf(String(cardId)) >= 0) return;
    const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
    if (cardEl) {
      cardEl.style.left = x + "px";
      cardEl.style.top = y + "px";
    }
    const db = window.DB;
    const cards = db && db.state && Array.isArray(db.state.cards) ? db.state.cards : [];
    const card = cards.find((c) => c && String(c.id) === String(cardId));
    if (!card) return;
    card.x = x;
    card.y = y;
    card.left = x;
    card.top = y;
    if (typeof db.paintCard === "function") {
      try { db.paintCard(card); } catch (_) {}
    }
  }

  function onRemoteEvent(eventData) {
    const event = eventData && eventData.event;
    if (!event || typeof event !== "object") return;

    if (event.type === "KICK_SYNC") {
      if (localDragging()) return;
      if (event.boardId && event.boardId === currentBoardId) {
        if (window.DataBasedSync && typeof window.DataBasedSync.pull === "function") {
          window.DataBasedSync.pull();
        }
      }
      return;
    }

    if (event.type === "CARD_DRAG") {
      if (event.boardId && event.boardId === currentBoardId && event.cardId != null) {
        if (event.x != null && event.y != null) applyRemoteCardDrag(event.cardId, event.x, event.y);
      }
    }
  }

  function commentsNeedLiveblocks() {
    return unconfigured || !createClient;
  }

  function readCommentsOpen() {
    try {
      const v = localStorage.getItem(COMMENTS_OPEN_KEY);
      return v === "1" || v === "true";
    } catch (_) {
      return false;
    }
  }

  function commentsPanel() {
    return document.getElementById("comments-panel");
  }

  function commentsList() {
    let list = document.getElementById("comments-list");
    const panel = commentsPanel();
    if (!list && panel) {
      list = document.createElement("div");
      list.id = "comments-list";
      list.className = "comments-list";
      panel.appendChild(list);
    }
    return list;
  }

  function pinsLayer() {
    let el = document.getElementById("comment-pins");
    if (!el) {
      const canvas = document.getElementById("canvas");
      if (canvas) {
        el = document.createElement("div");
        el.id = "comment-pins";
        el.className = "comments-pins";
        el.setAttribute("aria-hidden", "true");
        canvas.appendChild(el);
      }
    }
    return el;
  }

  function commentBody(text) {
    return {
      version: 1,
      content: [{ type: "paragraph", children: [{ text: String(text || "") }] }],
    };
  }

  function walkBody(body) {
    if (!body || !Array.isArray(body.content)) return "";
    return body.content.map((block) => {
      if (!block || !Array.isArray(block.children)) return "";
      return block.children.map((node) => (node && node.text != null ? String(node.text) : "")).join("");
    }).join("\n").trim();
  }

  async function bodyText(body) {
    if (typeof stringifyCommentBody === "function") {
      try {
        const out = stringifyCommentBody(body);
        const s = await Promise.resolve(out);
        if (s != null && String(s).trim()) return String(s).trim();
      } catch (_) {}
    }
    return walkBody(body);
  }

  function toMs(value) {
    if (value instanceof Date) return value.getTime();
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }

  function commentTime(value) {
    const ms = toMs(value);
    if (!ms) return "";
    const d = Date.now() - ms;
    if (d < 60000) return "just now";
    if (d < 3600000) return Math.floor(d / 60000) + "m";
    if (d < 86400000) return Math.floor(d / 3600000) + "h";
    return Math.floor(d / 86400000) + "d";
  }

  function liveComments(thread) {
    const list = thread && Array.isArray(thread.comments) ? thread.comments : [];
    return list.filter((c) => c && !c.deletedAt);
  }

  function threadMeta(thread) {
    const meta = (thread && thread.metadata) || {};
    const x = Number(meta.x);
    const y = Number(meta.y);
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      cardId: meta.cardId == null ? "" : String(meta.cardId),
    };
  }

  function worldToClient(x, y, extra) {
    if (extra && extra.clientX != null && extra.clientY != null) {
      return { clientX: extra.clientX, clientY: extra.clientY };
    }
    const canvas = document.getElementById("canvas");
    if (!canvas) return { clientX: 24, clientY: 80 };
    const r = canvas.getBoundingClientRect();
    const sx = canvas.offsetWidth ? r.width / canvas.offsetWidth : 1;
    const sy = canvas.offsetHeight ? r.height / canvas.offsetHeight : 1;
    return { clientX: r.left + x * sx, clientY: r.top + y * sy };
  }

  function applyFullThreads(result) {
    threads.clear();
    const list = result && result.threads;
    if (Array.isArray(list)) {
      for (const t of list) {
        if (t && t.id) threads.set(t.id, t);
      }
    }
    commentsSince = result && result.requestedAt ? result.requestedAt : commentsSince;
  }

  function applySinceThreads(result) {
    const pack = result && result.threads;
    if (pack && Array.isArray(pack.updated)) {
      for (const t of pack.updated) {
        if (t && t.id) threads.set(t.id, t);
      }
    }
    if (pack && Array.isArray(pack.deleted)) {
      for (const d of pack.deleted) {
        if (d && d.id) threads.delete(d.id);
      }
    }
    if (Array.isArray(pack)) {
      for (const t of pack) {
        if (t && t.id) threads.set(t.id, t);
      }
    }
    if (result && result.requestedAt) commentsSince = result.requestedAt;
  }

  function sortedThreads() {
    return [...threads.values()].sort((a, b) => {
      const ar = a && a.resolved ? 1 : 0;
      const br = b && b.resolved ? 1 : 0;
      if (ar !== br) return ar - br;
      const at = toMs((a && a.updatedAt) || (a && a.createdAt));
      const bt = toMs((b && b.updatedAt) || (b && b.createdAt));
      return bt - at;
    });
  }

  async function refreshThreads() {
    if (!currentRoom || typeof currentRoom.getThreads !== "function") return;
    try {
      const result = await currentRoom.getThreads();
      applyFullThreads(result);
      await paintComments();
    } catch (err) {
      console.warn("Could not load comments:", err);
    }
  }

  async function pollThreads() {
    if (!currentRoom) return;
    if (typeof currentRoom.getThreadsSince === "function" && commentsSince) {
      try {
        const result = await currentRoom.getThreadsSince({ since: commentsSince });
        applySinceThreads(result);
        await paintComments();
        return;
      } catch (err) {
        console.warn("Could not poll comments:", err);
      }
    }
    await refreshThreads();
  }

  function startCommentsPoll() {
    stopCommentsPoll();
    commentsPoll = setInterval(() => {
      pollThreads();
    }, 2500);
  }

  function stopCommentsPoll() {
    if (commentsPoll) {
      clearInterval(commentsPoll);
      commentsPoll = 0;
    }
  }

  function persistCommentsOpen(open) {
    commentsOpen = Boolean(open);
    try {
      localStorage.setItem(COMMENTS_OPEN_KEY, commentsOpen ? "1" : "0");
    } catch (_) {}
    const panel = commentsPanel();
    if (panel) panel.hidden = !commentsOpen;
    document.body.classList.toggle("is-comments", commentsOpen);
    const tool = document.getElementById("comments-tool");
    if (tool) {
      tool.classList.toggle("is-on", commentsOpen);
      tool.setAttribute("aria-pressed", commentsOpen ? "true" : "false");
    }
  }

  function showComments() {
    persistCommentsOpen(true);
    paintComments();
  }

  function hideComments() {
    persistCommentsOpen(false);
    openThreadId = "";
    paintPins();
  }

  function toggleComments() {
    if (commentsOpen) hideComments();
    else showComments();
  }

  function closeComposer() {
    if (composerAway) {
      document.removeEventListener("pointerdown", composerAway, true);
      composerAway = null;
    }
    if (composerEl) {
      composerEl.remove();
      composerEl = null;
    }
  }

  function openComposer(opts) {
    closeComposer();
    const meta = {
      x: Number(opts && opts.x) || 0,
      y: Number(opts && opts.y) || 0,
      cardId: opts && opts.cardId != null ? String(opts.cardId) : "",
    };
    const pt = worldToClient(meta.x, meta.y, opts);
    const el = document.createElement("div");
    el.className = "comment-composer island";
    el.innerHTML = '<textarea class="comment-composer-text" rows="3" placeholder="Write a comment"></textarea><button type="button" class="comment-composer-post">Post</button>';
    document.body.appendChild(el);
    const pad = 8;
    const w = el.offsetWidth || 260;
    const h = el.offsetHeight || 96;
    let x = pt.clientX;
    let y = pt.clientY;
    if (x + w > innerWidth - pad) x = innerWidth - w - pad;
    if (y + h > innerHeight - pad) y = innerHeight - h - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    el.style.left = Math.round(x) + "px";
    el.style.top = Math.round(y) + "px";
    composerEl = el;
    const ta = el.querySelector("textarea");
    const post = el.querySelector(".comment-composer-post");
    if (ta) ta.focus();

    async function submit() {
      const text = ta ? ta.value.trim() : "";
      if (!text || !currentRoom || typeof currentRoom.createThread !== "function") return;
      try {
        await currentRoom.createThread({
          body: commentBody(text),
          metadata: { x: meta.x, y: meta.y, cardId: meta.cardId },
        });
        closeComposer();
        await refreshThreads();
      } catch (err) {
        console.warn("Could not create comment:", err);
      }
    }

    if (post) post.addEventListener("click", submit);
    if (ta) {
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          ev.preventDefault();
          closeComposer();
        }
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
          ev.preventDefault();
          submit();
        }
      });
    }
    composerAway = (ev) => {
      if (!composerEl) return;
      if (composerEl.contains(ev.target)) return;
      closeComposer();
    };
    setTimeout(() => {
      document.addEventListener("pointerdown", composerAway, true);
    }, 0);
  }

  function startComment(opts) {
    showComments();
    if (commentsNeedLiveblocks() || !currentRoom) {
      paintComments();
      return;
    }
    openComposer(opts || {});
  }

  function openThread(threadId) {
    openThreadId = threadId ? String(threadId) : "";
    showComments();
  }

  async function paintComments() {
    const list = commentsList();
    if (list) await paintThreadList(list);
    paintPins();
  }

  async function paintThreadList(list) {
    if (commentsNeedLiveblocks()) {
      list.innerHTML = '<p class="comments-empty">Comments need Liveblocks.</p>';
      return;
    }
    const rows = sortedThreads();
    if (!rows.length) {
      list.innerHTML = '<p class="comments-empty">No comments on this board.</p>';
      return;
    }
    const parts = [];
    for (const thread of rows) {
      const notes = liveComments(thread);
      const first = notes[0];
      const preview = await bodyText(first && first.body);
      const author = first && first.userId ? first.userId : "";
      const when = commentTime((first && first.createdAt) || thread.createdAt);
      const resolved = thread.resolved ? " is-resolved" : "";
      const on = String(thread.id) === openThreadId ? " is-on" : "";
      parts.push(
        `<article class="comment-row${resolved}${on}" data-thread-id="${sanitize(thread.id)}">` +
        `<button type="button" class="comment-row-hit" data-open-thread="${sanitize(thread.id)}">` +
        `<span class="comment-row-preview">${sanitize(preview || "Comment")}</span>` +
        `<span class="comment-row-meta">${sanitize(author)}${author && when ? " · " : ""}${sanitize(when)}</span>` +
        `</button>`
      );
      if (String(thread.id) === openThreadId) {
        parts.push('<div class="comment-thread">');
        for (const note of notes) {
          const text = await bodyText(note.body);
          parts.push(
            `<p class="comment-note"><span class="comment-note-who">${sanitize(note.userId || "")}</span>` +
            `<span class="comment-note-when">${sanitize(commentTime(note.createdAt))}</span>` +
            `<span class="comment-note-body">${sanitize(text)}</span></p>`
          );
        }
        parts.push(
          `<form class="comment-reply" data-reply="${sanitize(thread.id)}">` +
          `<textarea class="comment-reply-text" rows="2" placeholder="Reply"></textarea>` +
          `<button type="submit" class="comment-reply-post">Reply</button></form></div>`
        );
      }
      parts.push("</article>");
    }
    list.innerHTML = parts.join("");
    if (!list.dataset.bound) {
      list.dataset.bound = "1";
      list.addEventListener("click", (ev) => {
        const hit = ev.target.closest("[data-open-thread]");
        if (!hit || !list.contains(hit)) return;
        openThread(hit.getAttribute("data-open-thread"));
      });
      list.addEventListener("submit", (ev) => {
        const form = ev.target.closest("form[data-reply]");
        if (!form || !list.contains(form)) return;
        ev.preventDefault();
        const ta = form.querySelector("textarea");
        const text = ta ? ta.value.trim() : "";
        const threadId = form.getAttribute("data-reply");
        if (!text || !threadId || !currentRoom || typeof currentRoom.createComment !== "function") return;
        currentRoom.createComment({ threadId, body: commentBody(text) }).then(() => refreshThreads()).catch((err) => {
          console.warn("Could not reply:", err);
        });
      });
    }
  }

  function paintPins() {
    const layer = pinsLayer();
    if (!layer) return;
    const existing = new Map();
    layer.querySelectorAll(".comment-pin").forEach((el) => {
      existing.set(el.dataset.threadId, el);
    });
    const active = new Set();
    if (!commentsNeedLiveblocks()) {
      sortedThreads().forEach((thread) => {
        if (!thread || !thread.id) return;
        const meta = threadMeta(thread);
        active.add(thread.id);
        let el = existing.get(thread.id);
        if (!el) {
          el = document.createElement("button");
          el.type = "button";
          el.className = "comment-pin";
          el.dataset.threadId = thread.id;
          el.setAttribute("aria-label", "Comment");
          el.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            openThread(el.dataset.threadId);
          });
          layer.appendChild(el);
        }
        el.style.left = Math.round(meta.x) + "px";
        el.style.top = Math.round(meta.y) + "px";
        el.classList.toggle("is-on", String(thread.id) === openThreadId);
      });
    }
    existing.forEach((el, id) => {
      if (!active.has(id)) el.remove();
    });
  }

  function bindCommentsChrome() {
    if (commentsBound) return;
    commentsBound = true;
    const tool = document.getElementById("comments-tool");
    if (tool) {
      tool.addEventListener("click", (ev) => {
        ev.preventDefault();
        toggleComments();
      });
    }
    const openItem = document.getElementById("comments-open");
    if (openItem) {
      openItem.addEventListener("click", (ev) => {
        ev.preventDefault();
        showComments();
      });
    }
    const panel = commentsPanel();
    if (panel) {
      const hideBtn = panel.querySelector(".comments-hide, [data-hide-comments]");
      if (hideBtn) {
        hideBtn.addEventListener("click", (ev) => {
          ev.preventDefault();
          hideComments();
        });
      }
    }
    persistCommentsOpen(readCommentsOpen());
    paintComments();
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

      onOthersChange(room.getOthers());
      await refreshThreads();
      startCommentsPoll();
    } catch (e) {
      console.warn("Could not join Liveblocks room:", e);
    }
  }

  function leaveBoard() {
    stopCommentsPoll();
    threads.clear();
    commentsSince = null;
    openThreadId = "";
    closeComposer();
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
    const pins = document.getElementById("comment-pins");
    if (pins) pins.innerHTML = "";
    paintComments();
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
    startComment,
    toggleComments,
    showComments,
    hideComments,
    openThread,
    get commentsOpen() { return commentsOpen; },
    get activeRoom() { return currentRoom; },
    get currentBoardId() { return currentBoardId; },
    get isAvailable() { return Boolean(createClient && !unconfigured); },
  };

  function autoStart() {
    bindCommentsChrome();
    const access = window.DataBasedAccess;
    const store = (window.DB && window.DB.store) || (window.Boards && window.Boards.store);
    const go = () => {
      const bId = store && store.currentId;
      if (bId) enterBoard(bId);
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
