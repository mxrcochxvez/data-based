(function (global) {
  const Persist = global.Persist;

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function emptyBoard(name) {
    return {
      id: uid(),
      name: name || "Board",
      cards: [],
      edges: [],
      nextId: 1,
      placeAt: { x: 88, y: 200 },
      camera: { pan: { x: 0, y: 0 }, zoom: 1 },
      grants: [{ id: "owner", handle: "you", role: "owner" }],
      updatedAt: Date.now(),
    };
  }

  function normalizeBoard(b) {
    if (!b || !b.id) return null;
    b.name = b.name || "Board";
    b.cards = Array.isArray(b.cards) ? b.cards : [];
    b.edges = Array.isArray(b.edges) ? b.edges : [];
    b.nextId = b.nextId || 1;
    b.placeAt = b.placeAt || { x: 88, y: 200 };
    b.camera = b.camera && typeof b.camera === "object"
      ? b.camera
      : { pan: { x: 0, y: 0 }, zoom: 1 };
    b.grants = b.grants && b.grants.length ? b.grants : [{ id: "owner", handle: "you", role: "owner" }];
    return b;
  }

  function loadStore() {
    const raw = Persist && Persist.readSync ? Persist.readSync() : null;
    if (raw && Array.isArray(raw.boards) && raw.boards.length) {
      const boards = raw.boards.map(normalizeBoard).filter(Boolean);
      if (boards.length) {
        const currentId = boards.some((b) => b.id === raw.currentId) ? raw.currentId : boards[0].id;
        return { boards, currentId, updatedAt: raw.updatedAt || 0 };
      }
    }
    const b = emptyBoard("Board");
    return { boards: [b], currentId: b.id, updatedAt: Date.now() };
  }

  const store = loadStore();
  let api = null;

  function currentBoard() {
    return store.boards.find((b) => b.id === store.currentId) || store.boards[0];
  }

  function snapshot() {
    store.updatedAt = Date.now();
    return { boards: store.boards, currentId: store.currentId, updatedAt: store.updatedAt };
  }

  function flushBoard() {
    const b = currentBoard();
    if (!b || !api) return;
    const s = api.state;
    b.cards = s.cards;
    b.edges = Array.isArray(s.edges) ? s.edges : (b.edges || []);
    b.nextId = s.nextId;
    b.placeAt = s.placeAt;
    if (global.Camera && typeof global.Camera.flush === "function") global.Camera.flush(b);
    else if (s.camera) b.camera = { pan: { x: s.camera.pan.x, y: s.camera.pan.y }, zoom: s.camera.zoom };
    b.updatedAt = Date.now();
    const flow = global.DataBasedFlow;
    if (flow && typeof flow.flushToBoard === "function") flow.flushToBoard(b);
  }

  function hydrateBoard(b) {
    store.currentId = b.id;
    if (!api) return;
    const cards = (b.cards || []).map((c) => api.normalizeCard(c));
    api.state.cards = cards;
    api.state.edges = Array.isArray(b.edges) ? b.edges.slice() : [];
    api.state.nextId = b.nextId || 1;
    api.state.placeAt = b.placeAt || { x: 88, y: 200 };
    if (global.Camera && typeof global.Camera.hydrate === "function") global.Camera.hydrate(b);
    else api.state.camera = b.camera || { pan: { x: 0, y: 0 }, zoom: 1 };
    api.state.sel = new Set();
    if ("sels" in api.state) api.state.sels = api.state.sel;
    api.state.editing = null;
    const flow = global.DataBasedFlow;
    if (flow && typeof flow.hydrateFromBoard === "function") flow.hydrateFromBoard(b);
  }

  function saveNow() {
    flushBoard();
    if (Persist) Persist.flush(snapshot);
  }

  function persist() {
    flushBoard();
    if (Persist) Persist.schedule(snapshot);
  }

  function esc(s) {
    return api && api.esc ? api.esc(s) : String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderBoardChrome() {
    const b = currentBoard();
    const name = $("board-name");
    const invite = $("invite-link");
    if (name) name.textContent = b.name;
    if (invite) invite.href = "#/invite/" + b.id;
  }

  function renderBoardList() {
    const list = $("board-list");
    if (!list) return;
    list.innerHTML = store.boards.map((b) => `
      <li>
        <a href="#/" data-open="${b.id}">${esc(b.name)}</a>
        <span class="role">${(b.cards || []).length} cards</span>
        <a href="#/invite/${b.id}">Invite</a>
      </li>
    `).join("");
  }

  function renderGrants(id) {
    const b = store.boards.find((x) => x.id === id) || currentBoard();
    const title = $("invite-title");
    const back = $("invite-back");
    const list = $("grant-list");
    if (title) title.textContent = "Invite · " + b.name;
    if (back) back.href = "#/";
    if (!list) return;
    list.innerHTML = (b.grants || []).map((g) => `
      <li>
        <span>${esc(g.handle)}</span>
        <span class="role">${esc(g.role)}</span>
        ${g.role === "owner" ? "" : `<button type="button" class="text-btn" data-revoke="${g.id}">Remove</button>`}
      </li>
    `).join("");
  }

  function showView(name, inviteId) {
    const boards = name === "boards";
    const invite = name === "invite";
    const boardsEl = $("screen-boards");
    const inviteEl = $("screen-invite");
    if (boardsEl) boardsEl.hidden = !boards;
    if (inviteEl) inviteEl.hidden = !invite;
    document.body.classList.toggle("is-page", boards || invite);
    if (api && api.showEmpty) api.showEmpty();
    if (boards) renderBoardList();
    if (invite) renderGrants(inviteId || currentBoard().id);
  }

  function openBoard(b) {
    if (!b) return;
    flushBoard();
    hydrateBoard(b);
    saveNow();
    if (api && api.renderCards) api.renderCards();
    renderBoardChrome();
  }

  function route() {
    const h = (location.hash || "#/").slice(1);
    if (h === "/boards") {
      showView("boards");
      return;
    }
    const inv = h.match(/^\/invite(?:\/([^/]+))?$/);
    if (inv) {
      if (inv[1]) {
        const b = store.boards.find((x) => x.id === inv[1]);
        if (b) {
          flushBoard();
          hydrateBoard(b);
          if (api && api.renderCards) api.renderCards();
          renderBoardChrome();
        }
      }
      showView("invite", inv[1]);
      return;
    }
    showView("canvas");
  }

  function bind() {
    const list = $("board-list");
    if (list) {
      list.addEventListener("click", (ev) => {
        const open = ev.target.closest("[data-open]");
        if (!open) return;
        ev.preventDefault();
        openBoard(store.boards.find((x) => x.id === open.dataset.open));
        location.hash = "#/";
      });
    }

    const form = $("new-board");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = new FormData(ev.target).get("name").toString().trim();
        if (!name) return;
        flushBoard();
        const b = emptyBoard(name);
        store.boards.push(b);
        hydrateBoard(b);
        saveNow();
        if (api && api.renderCards) api.renderCards();
        renderBoardChrome();
        ev.target.reset();
        location.hash = "#/";
      });
    }

    const grant = $("grant-form");
    if (grant) {
      grant.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const handle = new FormData(ev.target).get("handle").toString().trim().toLowerCase();
        const err = $("grant-err");
        if (err) err.hidden = true;
        if (!handle) return;
        const b = currentBoard();
        if (b.grants.some((g) => g.handle === handle)) {
          if (err) {
            err.hidden = false;
            err.textContent = "Already on this board.";
          }
          return;
        }
        b.grants.push({ id: uid(), handle, role: "granted" });
        b.updatedAt = Date.now();
        saveNow();
        ev.target.reset();
        renderGrants(b.id);
      });
    }

    const grants = $("grant-list");
    if (grants) {
      grants.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-revoke]");
        if (!btn) return;
        const b = currentBoard();
        b.grants = b.grants.filter((g) => g.id !== btn.dataset.revoke);
        b.updatedAt = Date.now();
        saveNow();
        renderGrants(b.id);
      });
    }

    window.addEventListener("hashchange", route);
    window.addEventListener("pagehide", saveNow);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) saveNow();
    });
  }

  function boot(next) {
    api = next;
    Persist.read().then((doc) => {
      if (doc && Array.isArray(doc.boards) && doc.boards.length) {
        const incoming = Number(doc.updatedAt) || 0;
        const current = Number(store.updatedAt) || 0;
        if (incoming < current) return;
        store.boards = doc.boards.map(normalizeBoard).filter(Boolean);
        store.currentId = store.boards.some((b) => b.id === doc.currentId) ? doc.currentId : store.boards[0].id;
        store.updatedAt = incoming || current;
      }
      hydrateBoard(currentBoard());
      renderBoardChrome();
      if (api.renderCards) api.renderCards();
      route();
    });
    hydrateBoard(currentBoard());
    bind();
    renderBoardChrome();
  }

  global.Boards = {
    KEY: Persist ? Persist.KEY : "databased.v1",
    store,
    boot,
    persist,
    save: saveNow,
    current: currentBoard,
    hydrate: hydrateBoard,
    flush: flushBoard,
    chrome: renderBoardChrome,
    route,
  };
})(window);
