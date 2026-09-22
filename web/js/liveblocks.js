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
  const userNames = new Map();
  const COMMENTS_OPEN_KEY = "databased-comments-open";
  let commentsOpen = false;
  let commentsSince = null;
  let commentsPoll = 0;
  let openThreadId = "";
  let composerEl = null;
  let composerAway = null;
  let commentsBound = false;
  let replyBusy = false;
  let commentBusy = false;
  let paintSeq = 0;
  let commentMenu = null;
  let commentHold = null;
  let commentSuppressClick = false;
  const COMMENT_HOLD_MS = 520;
  const COMMENT_HOLD_MOVE = 10;

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
    client = createClient({
      authEndpoint,
      badgeLocation: "top-right",
      resolveUsers: async ({ userIds }) => {
        harvestPresenceNames();
        rememberSelf();
        return (userIds || []).map((id) => {
          const name = authorLabel(id);
          return { name, id };
        });
      },
    });
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

  function localPart(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    return s.includes("@") ? s.split("@")[0] : s;
  }

  function clerkish(value) {
    return /^user_[A-Za-z0-9]+$/.test(String(value || "").trim());
  }

  function rememberUser(id, name) {
    const key = String(id || "").trim();
    const label = localPart(name);
    if (!key || !label || clerkish(label)) return;
    userNames.set(key, label);
  }

  function localHandle() {
    const access = window.DataBasedAccess;
    if (access && typeof access.handle === "function") {
      try {
        const handle = String(access.handle() || "");
        if (handle) return handle;
      } catch (_) {}
    }
    try {
      const user = window.Clerk && window.Clerk.user;
      if (user) {
        return user.fullName || user.firstName || user.username
          || (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress)
          || "";
      }
    } catch (_) {}
    return "";
  }

  function rememberSelf() {
    const handle = localHandle();
    const name = localPart(handle) || "You";
    if (handle) rememberUser(handle, name);
    try {
      const user = window.Clerk && window.Clerk.user;
      if (user && user.id) rememberUser(user.id, user.fullName || user.firstName || user.username || name);
    } catch (_) {}
    if (!currentRoom || typeof currentRoom.getSelf !== "function") return name;
    try {
      const self = currentRoom.getSelf();
      if (self && self.id) rememberUser(self.id, (self.info && (self.info.name || self.info.email)) || name);
    } catch (_) {}
    return name;
  }

  function harvestPresenceNames() {
    rememberSelf();
    if (!currentRoom || typeof currentRoom.getOthers !== "function") return;
    try {
      const others = currentRoom.getOthers();
      (others || []).forEach((user) => {
        const info = (user && user.info) || {};
        rememberUser(user.id, info.name || info.email);
      });
    } catch (_) {}
  }

  function authorLabel(id) {
    const key = String(id || "").trim();
    if (!key) return "Collaborator";
    if (userNames.has(key)) return userNames.get(key);
    if (clerkish(key)) return "Collaborator";
    return localPart(key) || "Collaborator";
  }

  function commentAuthor(note, thread) {
    if (note && note.userId) {
      const fromMap = authorLabel(note.userId);
      if (fromMap && fromMap !== "Collaborator") return fromMap;
    }
    const meta = (thread && thread.metadata) || {};
    if (meta.author) return authorLabel(meta.author);
    return authorLabel(note && note.userId);
  }

  function selfIds() {
    const ids = new Set();
    const add = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return;
      ids.add(raw);
      ids.add(raw.toLowerCase());
    };
    try {
      if (currentRoom && typeof currentRoom.getSelf === "function") {
        const self = currentRoom.getSelf();
        if (self && self.id) add(self.id);
        if (self && self.info) {
          add(self.info.email);
          add(self.info.name);
        }
      }
    } catch (_) {}
    try {
      const user = window.Clerk && window.Clerk.user;
      if (user) {
        add(user.id);
        add(user.username);
        add(user.primaryEmailAddress && user.primaryEmailAddress.emailAddress);
      }
    } catch (_) {}
    const access = window.DataBasedAccess;
    if (access && typeof access.handle === "function") {
      try { add(access.handle()); } catch (_) {}
    }
    if (access && access.session) {
      add(access.session.email);
      add(access.session.clerkUserId);
    }
    return ids;
  }

  function isSystemAdmin() {
    const access = window.DataBasedAccess;
    return Boolean(access && typeof access.isSystem === "function" && access.isSystem());
  }

  function isSelfAuthor(note) {
    const uid = String((note && note.userId) || "").trim();
    if (!uid) return false;
    const ids = selfIds();
    return ids.has(uid) || ids.has(uid.toLowerCase());
  }

  function canManageComment(note) {
    if (!note || note.deletedAt) return false;
    return isSelfAuthor(note) || isSystemAdmin();
  }

  function commentAttr(value) {
    return sanitize(value).replace(/"/g, "");
  }

  function authorInitial(name) {
    const s = String(name || "C").trim();
    return (s[0] || "C").toUpperCase();
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
      rememberUser(user.id, name);

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
      rememberUser(user.id, name);
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
    harvestPresenceNames();
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

  function commentsTitle() {
    const panel = commentsPanel();
    return document.getElementById("comments-title") || (panel && panel.querySelector(".comments-head h2"));
  }

  function commentsBack() {
    return document.getElementById("comments-back") || (commentsPanel() && commentsPanel().querySelector(".comments-back"));
  }

  function replyForm() {
    let form = document.getElementById("comment-reply");
    const panel = commentsPanel();
    if (!form && panel) {
      form = document.createElement("form");
      form.id = "comment-reply";
      form.className = "comment-reply";
      form.hidden = true;
      form.setAttribute("action", "#");
      form.innerHTML = '<textarea id="comment-reply-text" class="comment-reply-text" rows="2" placeholder="Reply" aria-label="Reply"></textarea><button type="submit" class="comment-reply-post btn">Reply</button>';
      panel.appendChild(form);
    }
    return form;
  }

  function replyTextarea() {
    const form = replyForm();
    return form ? form.querySelector("textarea") : null;
  }

  function replyFocused() {
    const ta = replyTextarea();
    return Boolean(ta && document.activeElement === ta);
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
    const skipPaint = replyFocused() || replyBusy || commentEditing() || commentBusy;
    if (typeof currentRoom.getThreadsSince === "function" && commentsSince) {
      try {
        const result = await currentRoom.getThreadsSince({ since: commentsSince });
        applySinceThreads(result);
        if (!skipPaint) await paintComments();
        else paintPins();
        return;
      } catch (err) {
        console.warn("Could not poll comments:", err);
      }
    }
    if (skipPaint) return;
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
    syncCommentsChrome();
  }

  function syncCommentsChrome() {
    const panel = commentsPanel();
    const threadOn = Boolean(openThreadId);
    if (panel) panel.classList.toggle("is-thread", threadOn);
    const back = commentsBack();
    if (back) back.hidden = !threadOn;
    const title = commentsTitle();
    if (title) title.textContent = threadOn ? "Thread" : "Comments";
    const form = replyForm();
    if (form) {
      form.hidden = !commentsOpen || !threadOn;
      if (threadOn) form.setAttribute("data-reply", openThreadId);
      else form.removeAttribute("data-reply");
    }
  }

  function showComments() {
    persistCommentsOpen(true);
    paintComments();
  }

  function hideComments() {
    openThreadId = "";
    closeCommentMenu();
    cancelCommentEdit();
    persistCommentsOpen(false);
    paintPins();
  }

  function closeThread() {
    openThreadId = "";
    syncCommentsChrome();
    paintComments();
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
        rememberSelf();
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

  function mergeLocalComment(threadId, comment) {
    if (!threadId || !comment) return;
    const thread = threads.get(threadId);
    if (!thread) return;
    const notes = Array.isArray(thread.comments) ? thread.comments.slice() : [];
    if (comment.id && notes.some((c) => c && c.id === comment.id)) return;
    notes.push(comment);
    threads.set(threadId, Object.assign({}, thread, {
      comments: notes,
      updatedAt: comment.createdAt || new Date(),
    }));
  }

  async function sendReply(form) {
    const box = form || replyForm();
    if (!box || replyBusy) return;
    const ta = box.querySelector("textarea");
    const text = ta ? ta.value.trim() : "";
    const threadId = box.getAttribute("data-reply") || openThreadId;
    if (!text || !threadId || !currentRoom) return;
    const create = currentRoom.createComment;
    if (typeof create !== "function") {
      console.warn("Could not reply: createComment is not available");
      return;
    }
    replyBusy = true;
    const post = box.querySelector(".comment-reply-post, [type='submit']");
    if (post) post.disabled = true;
    rememberSelf();
    try {
      const comment = await create.call(currentRoom, { threadId, body: commentBody(text) });
      if (ta) ta.value = "";
      mergeLocalComment(threadId, comment || {
        id: "local-" + Date.now(),
        threadId,
        userId: (currentRoom.getSelf && currentRoom.getSelf() && currentRoom.getSelf().id) || "",
        createdAt: new Date(),
        body: commentBody(text),
      });
      await paintComments();
      await refreshThreads();
    } catch (err) {
      console.warn("Could not reply:", err);
    } finally {
      replyBusy = false;
      if (post) post.disabled = false;
    }
  }

  function commentEditing() {
    return Boolean(document.querySelector(".comment-note.is-edit"));
  }

  function findComment(threadId, commentId) {
    const thread = threads.get(threadId);
    const notes = thread && Array.isArray(thread.comments) ? thread.comments : [];
    return notes.find((c) => c && c.id === commentId) || null;
  }

  function currentRoomId() {
    return currentBoardId ? "board:" + currentBoardId : "";
  }

  function closeCommentMenu() {
    if (!commentMenu) return;
    commentMenu.hidden = true;
    commentMenu.innerHTML = "";
  }

  function ensureCommentMenu() {
    if (commentMenu) return commentMenu;
    const el = document.createElement("div");
    el.id = "comment-menu";
    el.className = "board-menu comment-menu";
    el.hidden = true;
    el.setAttribute("role", "menu");
    el.setAttribute("aria-label", "Comment");
    document.body.appendChild(el);
    el.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[role='menuitem']");
      if (!btn || btn.getAttribute("aria-disabled") === "true") return;
      ev.preventDefault();
      runCommentMenu(btn);
    });
    commentMenu = el;
    return el;
  }

  function placeCommentMenu(clientX, clientY) {
    const menu = ensureCommentMenu();
    menu.hidden = false;
    const pad = 8;
    const viewW = window.visualViewport ? window.visualViewport.width : innerWidth;
    const viewH = window.visualViewport ? window.visualViewport.height : innerHeight;
    const ox = window.visualViewport ? window.visualViewport.offsetLeft : 0;
    const oy = window.visualViewport ? window.visualViewport.offsetTop : 0;
    const w = menu.offsetWidth || 196;
    const h = menu.offsetHeight || 72;
    let left = ox;
    let top = oy;
    let right = ox + viewW;
    let bottom = oy + viewH;
    const sheet = commentsPanel();
    if (sheet && !sheet.hidden) {
      const box = sheet.getBoundingClientRect();
      if (box.width && box.height) {
        left = Math.max(left, box.left);
        top = Math.max(top, box.top);
        right = Math.min(right, box.right);
        bottom = Math.min(bottom, box.bottom);
      }
    }
    let x = clientX;
    let y = clientY;
    if (y + h > bottom - pad) y = clientY - h;
    if (x + w > right - pad) x = right - w - pad;
    if (y + h > bottom - pad) y = bottom - h - pad;
    if (x < left + pad) x = left + pad;
    if (y < top + pad) y = top + pad;
    menu.style.left = Math.round(x) + "px";
    menu.style.top = Math.round(y) + "px";
  }

  function openCommentMenu(ev, target) {
    const threadId = target && target.getAttribute("data-thread-id");
    const commentId = target && target.getAttribute("data-comment-id");
    if (!threadId || !commentId || target.getAttribute("data-can-manage") !== "1") return false;
    if (window.DataBasedMenu && typeof window.DataBasedMenu.close === "function") {
      window.DataBasedMenu.close();
    }
    const menu = ensureCommentMenu();
    menu.innerHTML = "";
    menu.dataset.threadId = threadId;
    menu.dataset.commentId = commentId;
    [
      { act: "edit", label: "Edit" },
      { act: "delete", label: "Delete", danger: true },
    ].forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "board-menu-item" + (item.danger ? " is-danger" : "");
      btn.setAttribute("role", "menuitem");
      btn.dataset.act = item.act;
      btn.tabIndex = -1;
      const name = document.createElement("span");
      name.textContent = item.label;
      btn.appendChild(name);
      menu.appendChild(btn);
    });
    placeCommentMenu(ev.clientX, ev.clientY);
    const first = menu.querySelector("[role='menuitem']");
    if (first) first.focus();
    return true;
  }

  function commentTargetFromEvent(ev) {
    const t = ev.target && ev.target.closest && ev.target.closest("[data-comment-id]");
    if (!t) return null;
    const list = commentsList();
    if (list && !list.contains(t)) return null;
    return t;
  }

  function onCommentContext(ev) {
    const target = commentTargetFromEvent(ev);
    if (typeof ev.preventDefault === "function") ev.preventDefault();
    if (commentHold) {
      commentHold.opened = true;
      commentSuppressClick = true;
      clearTimeout(commentHold.timer);
    }
    if (!target || target.getAttribute("data-can-manage") !== "1") {
      closeCommentMenu();
      return;
    }
    openCommentMenu(ev, target);
  }

  function clearCommentHold() {
    if (!commentHold) return;
    clearTimeout(commentHold.timer);
    commentHold = null;
  }

  function onCommentHoldDown(ev) {
    if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
    if (ev.button != null && ev.button !== 0) return;
    if (ev.target.closest && ev.target.closest("textarea, input, .comment-edit-actions, .comment-reply")) return;
    const target = commentTargetFromEvent(ev);
    if (!target || target.getAttribute("data-can-manage") !== "1") return;
    if (commentHold && commentHold.id !== ev.pointerId) {
      clearCommentHold();
      return;
    }
    const start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, target };
    commentHold = {
      id: ev.pointerId,
      x: start.x,
      y: start.y,
      target,
      timer: setTimeout(() => {
        if (!commentHold || commentHold.id !== start.id) return;
        commentHold.opened = true;
        commentSuppressClick = true;
        openCommentMenu({
          clientX: commentHold.x,
          clientY: commentHold.y,
        }, start.target);
      }, COMMENT_HOLD_MS),
    };
  }

  function onCommentHoldMove(ev) {
    if (!commentHold || ev.pointerId !== commentHold.id) return;
    if (Math.hypot(ev.clientX - commentHold.x, ev.clientY - commentHold.y) > COMMENT_HOLD_MOVE) {
      clearCommentHold();
    }
  }

  function onCommentHoldUp(ev) {
    if (!commentHold || ev.pointerId !== commentHold.id) return;
    if (commentHold.opened) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    clearCommentHold();
  }

  function cancelCommentEdit(article) {
    const note = article || document.querySelector(".comment-note.is-edit");
    if (!note) return;
    note.classList.remove("is-edit");
    const body = note.querySelector(".comment-note-body");
    if (body) body.hidden = false;
    const edit = note.querySelector(".comment-edit");
    if (edit) edit.remove();
  }

  function beginCommentEdit(article) {
    if (!article) return;
    document.querySelectorAll(".comment-note.is-edit").forEach((el) => {
      if (el !== article) cancelCommentEdit(el);
    });
    if (article.classList.contains("is-edit")) {
      const ta = article.querySelector(".comment-edit-text");
      if (ta) ta.focus();
      return;
    }
    const body = article.querySelector(".comment-note-body");
    if (!body) return;
    article.classList.add("is-edit");
    body.hidden = true;
    const edit = document.createElement("div");
    edit.className = "comment-edit";
    edit.innerHTML = '<textarea class="comment-edit-text" rows="3" aria-label="Edit comment"></textarea><div class="comment-edit-actions"><button type="button" class="comment-edit-cancel">Cancel</button><button type="button" class="comment-edit-save">Save</button></div>';
    const ta = edit.querySelector(".comment-edit-text");
    ta.value = body.textContent || "";
    body.after(edit);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  async function startCommentEdit(threadId, commentId) {
    if (!threadId || !commentId) return;
    if (openThreadId !== threadId) {
      openThreadId = threadId;
      await paintComments();
    }
    const list = commentsList();
    const note = list && list.querySelector('.comment-note[data-comment-id="' + commentAttr(commentId) + '"]');
    if (note) beginCommentEdit(note);
  }

  function mergeLocalEdit(threadId, commentId, body) {
    const thread = threads.get(threadId);
    if (!thread) return;
    const notes = (Array.isArray(thread.comments) ? thread.comments : []).map((c) => {
      if (!c || c.id !== commentId) return c;
      return Object.assign({}, c, { body, editedAt: new Date() });
    });
    threads.set(threadId, Object.assign({}, thread, { comments: notes, updatedAt: new Date() }));
  }

  function mergeLocalDelete(threadId, commentId) {
    const thread = threads.get(threadId);
    if (!thread) return;
    const notes = (Array.isArray(thread.comments) ? thread.comments : []).map((c) => {
      if (!c || c.id !== commentId) return c;
      return Object.assign({}, c, { deletedAt: new Date(), body: undefined });
    });
    if (!notes.some((c) => c && !c.deletedAt)) {
      threads.delete(threadId);
      if (openThreadId === threadId) openThreadId = "";
      return;
    }
    threads.set(threadId, Object.assign({}, thread, { comments: notes, updatedAt: new Date() }));
  }

  async function serverComment(action, threadId, commentId, text) {
    const headers = await authHeaders();
    const res = await fetch("/api/liveblocks-comment", {
      method: "POST",
      headers: Object.assign({}, headers, { "Content-Type": "application/json" }),
      body: JSON.stringify({
        action,
        room: currentRoomId(),
        threadId,
        commentId,
        text: text || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data && data.message) || data.error || "Could not " + action + " comment");
    }
    return data;
  }

  async function mutateComment(action, threadId, commentId, text) {
    const note = findComment(threadId, commentId);
    if (note && !canManageComment(note)) {
      throw new Error("Only the author or the system administrator can edit or delete this comment.");
    }
    const author = !note || isSelfAuthor(note);
    if (author && currentRoom) {
      try {
        if (action === "edit") {
          if (typeof currentRoom.editComment !== "function") throw new Error("editComment is not available");
          return await currentRoom.editComment({ threadId, commentId, body: commentBody(text) });
        }
        if (typeof currentRoom.deleteComment !== "function") throw new Error("deleteComment is not available");
        return await currentRoom.deleteComment({ threadId, commentId });
      } catch (err) {
        if (!isSystemAdmin()) throw err;
      }
    }
    if (!isSystemAdmin() && note && !isSelfAuthor(note)) {
      throw new Error("Only the author or the system administrator can edit or delete this comment.");
    }
    return await serverComment(action, threadId, commentId, text);
  }

  async function saveCommentEdit(article) {
    if (!article || commentBusy) return;
    const threadId = article.getAttribute("data-thread-id");
    const commentId = article.getAttribute("data-comment-id");
    const ta = article.querySelector(".comment-edit-text");
    const text = ta ? ta.value.trim() : "";
    if (!text || !threadId || !commentId) return;
    commentBusy = true;
    const save = article.querySelector(".comment-edit-save");
    if (save) save.disabled = true;
    try {
      const body = commentBody(text);
      await mutateComment("edit", threadId, commentId, text);
      mergeLocalEdit(threadId, commentId, body);
      cancelCommentEdit(article);
      await paintComments();
      await refreshThreads();
    } catch (err) {
      console.warn("Could not edit comment:", err);
    } finally {
      commentBusy = false;
      if (save) save.disabled = false;
    }
  }

  async function deleteManagedComment(threadId, commentId) {
    if (!threadId || !commentId || commentBusy) return;
    commentBusy = true;
    try {
      await mutateComment("delete", threadId, commentId);
      mergeLocalDelete(threadId, commentId);
      closeCommentMenu();
      await paintComments();
      await refreshThreads();
    } catch (err) {
      console.warn("Could not delete comment:", err);
    } finally {
      commentBusy = false;
    }
  }

  function runCommentMenu(btn) {
    const menu = ensureCommentMenu();
    const threadId = menu.dataset.threadId;
    const commentId = menu.dataset.commentId;
    const act = btn && btn.dataset.act;
    closeCommentMenu();
    if (act === "edit") {
      startCommentEdit(threadId, commentId);
      return;
    }
    if (act === "delete") {
      deleteManagedComment(threadId, commentId);
    }
  }

  async function paintComments() {
    harvestPresenceNames();
    syncCommentsChrome();
    const list = commentsList();
    if (list) await paintThreadList(list);
    paintPins();
  }

  async function paintThreadList(list) {
    const seq = ++paintSeq;
    if (commentsNeedLiveblocks()) {
      list.innerHTML = '<p class="comments-empty">Comments need Liveblocks.</p>';
      bindThreadList(list);
      return;
    }
    const rows = sortedThreads();
    if (!rows.length) {
      list.innerHTML = '<p class="comments-empty">No comments on this board.</p>';
      bindThreadList(list);
      return;
    }

    const thread = openThreadId ? threads.get(openThreadId) : null;
    if (openThreadId && !thread) {
      openThreadId = "";
      syncCommentsChrome();
    }
    if (openThreadId && thread) {
      const notes = liveComments(thread);
      const parts = ['<div class="comment-thread">'];
      if (!notes.length) {
        parts.push('<p class="comments-empty">No replies yet.</p>');
      }
      for (const note of notes) {
        const text = await bodyText(note.body);
        if (seq !== paintSeq) return;
        const who = commentAuthor(note, thread);
        const when = commentTime(note.editedAt || note.createdAt) + (note.editedAt ? " · edited" : "");
        const manage = canManageComment(note) ? ' data-can-manage="1"' : "";
        parts.push(
          `<article class="comment-note" data-thread-id="${commentAttr(thread.id)}" data-comment-id="${commentAttr(note.id)}"${manage}>` +
          `<span class="comment-note-face" aria-hidden="true">${sanitize(authorInitial(who))}</span>` +
          `<span class="comment-note-who">${sanitize(who)}</span>` +
          `<span class="comment-note-when">${sanitize(when)}</span>` +
          `<p class="comment-note-body">${sanitize(text)}</p>` +
          `</article>`
        );
      }
      parts.push("</div>");
      if (seq !== paintSeq) return;
      list.innerHTML = parts.join("");
      bindThreadList(list);
      return;
    }

    const parts = [];
    for (const row of rows) {
      const notes = liveComments(row);
      const first = notes[0];
      const last = notes[notes.length - 1] || first;
      const preview = await bodyText((last && last.body) || (first && first.body));
      if (seq !== paintSeq) return;
      const author = commentAuthor(first, row);
      const when = commentTime((last && last.createdAt) || row.updatedAt || row.createdAt);
      const extra = notes.length > 1 ? notes.length + " comments" : "Comment";
      const resolved = row.resolved ? " is-resolved" : "";
      const manage = canManageComment(first) ? ' data-can-manage="1"' : "";
      const firstId = first && first.id ? commentAttr(first.id) : "";
      parts.push(
        `<article class="comment-row${resolved}" data-thread-id="${commentAttr(row.id)}" data-comment-id="${firstId}"${manage}>` +
        `<button type="button" class="comment-row-hit" data-open-thread="${commentAttr(row.id)}">` +
        `<span class="comment-row-preview">${sanitize(preview || "Comment")}</span>` +
        `<span class="comment-row-meta">${sanitize(author)}${author && when ? " · " : ""}${sanitize(when)} · ${sanitize(extra)}</span>` +
        `</button></article>`
      );
    }
    if (seq !== paintSeq) return;
    list.innerHTML = parts.join("");
    bindThreadList(list);
  }

  function bindThreadList(list) {
    if (!list || list.dataset.bound) return;
    list.dataset.bound = "1";
    list.addEventListener("click", (ev) => {
      if (commentSuppressClick || (commentHold && commentHold.opened)) {
        ev.preventDefault();
        ev.stopPropagation();
        commentSuppressClick = false;
        return;
      }
      const save = ev.target.closest(".comment-edit-save");
      if (save && list.contains(save)) {
        ev.preventDefault();
        saveCommentEdit(save.closest(".comment-note"));
        return;
      }
      const cancel = ev.target.closest(".comment-edit-cancel");
      if (cancel && list.contains(cancel)) {
        ev.preventDefault();
        cancelCommentEdit(cancel.closest(".comment-note"));
        return;
      }
      if (ev.target.closest(".comment-note.is-edit")) return;
      const hit = ev.target.closest("[data-open-thread]");
      if (!hit || !list.contains(hit)) return;
      openThread(hit.getAttribute("data-open-thread"));
    });
    list.addEventListener("keydown", (ev) => {
      const ta = ev.target.closest(".comment-edit-text");
      if (!ta || !list.contains(ta)) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        cancelCommentEdit(ta.closest(".comment-note"));
        return;
      }
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        saveCommentEdit(ta.closest(".comment-note"));
      }
    });
    list.addEventListener("contextmenu", onCommentContext);
    list.addEventListener("pointerdown", onCommentHoldDown);
    list.addEventListener("pointermove", onCommentHoldMove);
    list.addEventListener("pointerup", onCommentHoldUp);
    list.addEventListener("pointercancel", clearCommentHold);
    list.addEventListener("scroll", () => {
      clearCommentHold();
      closeCommentMenu();
    }, { passive: true });
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
    const back = commentsBack();
    if (back) {
      back.addEventListener("click", (ev) => {
        ev.preventDefault();
        closeThread();
      });
    }
    const form = replyForm();
    if (form && !form.dataset.bound) {
      form.dataset.bound = "1";
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        sendReply(form);
      });
      const post = form.querySelector(".comment-reply-post");
      if (post) {
        post.addEventListener("click", (ev) => {
          ev.preventDefault();
          sendReply(form);
        });
      }
      const ta = form.querySelector("textarea");
      if (ta) {
        ta.addEventListener("keydown", (ev) => {
          if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey || !ev.shiftKey)) {
            if (ev.shiftKey) return;
            ev.preventDefault();
            sendReply(form);
          }
        });
      }
    }
    persistCommentsOpen(readCommentsOpen());
    document.addEventListener("pointerdown", (ev) => {
      if (!commentMenu || commentMenu.hidden) return;
      if (commentMenu.contains(ev.target)) return;
      closeCommentMenu();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && commentMenu && !commentMenu.hidden) {
        ev.preventDefault();
        closeCommentMenu();
      }
    });
    window.addEventListener("resize", closeCommentMenu);
    window.addEventListener("blur", closeCommentMenu);
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

      rememberSelf();
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
    syncCommentsChrome();
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
    canManageComment,
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
