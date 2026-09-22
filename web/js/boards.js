(function (global) {
  const Persist = global.Persist;

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function $(id) {
    return document.getElementById(id);
  }

  function ownerHandle() {
    const access = global.DataBasedAccess;
    if (access && typeof access.handle === "function") {
      const who = access.handle();
      if (who) return who;
    }
    return "you";
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
      grants: [{ id: "owner", handle: ownerHandle(), role: "owner" }],
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
    let maxAt = Number(store.updatedAt) || 0;
    for (let i = 0; i < store.boards.length; i++) {
      const t = Number(store.boards[i] && store.boards[i].updatedAt) || 0;
      if (t > maxAt) maxAt = t;
    }
    store.updatedAt = maxAt;
    const doc = { boards: store.boards, currentId: store.currentId, updatedAt: store.updatedAt };
    return Persist && typeof Persist.snapshotDoc === "function" ? Persist.snapshotDoc(doc) : doc;
  }

  function flushBoard() {
    const b = currentBoard();
    if (!b || !api) return;
    const s = api.state;
    if (Persist && typeof Persist.layoutCard === "function") {
      (s.cards || []).forEach((c) => Persist.layoutCard(c));
    }
    b.cards = s.cards;
    b.edges = Array.isArray(s.edges) ? s.edges : (b.edges || []);
    b.nextId = s.nextId;
    b.placeAt = s.placeAt;
    if (global.Camera && typeof global.Camera.flush === "function") global.Camera.flush(b);
    else if (s.camera) b.camera = { pan: { x: s.camera.pan.x, y: s.camera.pan.y }, zoom: s.camera.zoom };
    if (Persist && typeof Persist.snapshotCamera === "function") b.camera = Persist.snapshotCamera(b.camera);
    const flow = global.DataBasedFlow;
    if (flow && typeof flow.flushToBoard === "function") flow.flushToBoard(b);
    if (Persist && typeof Persist.markDirty === "function") {
      if (Persist.markDirty(b)) store.updatedAt = b.updatedAt;
    }
  }

  function hydrateBoard(b) {
    const select = global.DataBasedSelect;
    if (select && typeof select.isDragging === "function" && select.isDragging()) return;
    if (api && api.state && (api.state.dragged || api.state.drag)) return;
    store.currentId = b.id;
    if (!api) return;
    const cards = (b.cards || []).map((c) => {
      if (Persist && typeof Persist.layoutCard === "function") Persist.layoutCard(c);
      return api.normalizeCard(c);
    });
    api.state.cards = cards;
    api.state.edges = Array.isArray(b.edges) ? b.edges.slice() : [];
    api.state.nextId = b.nextId || 1;
    api.state.placeAt = b.placeAt || { x: 88, y: 200 };
    if (global.Camera && typeof global.Camera.hydrate === "function") global.Camera.hydrate(b);
    else api.state.camera = b.camera || { pan: { x: 0, y: 0 }, zoom: 1 };
    const editOpen = global.DB && global.DB.editDlg && global.DB.editDlg.open;
    const keepEdit = editOpen ? api.state.editing : null;
    const keepSel = editOpen ? new Set(api.state.sel) : new Set();
    api.state.sel = keepSel;
    if ("sels" in api.state) api.state.sels = keepSel;
    api.state.editing = keepEdit;
    const flow = global.DataBasedFlow;
    if (flow && typeof flow.hydrateFromBoard === "function") flow.hydrateFromBoard(b);
    if (global.DataBasedLiveblocks && typeof global.DataBasedLiveblocks.enterBoard === "function") {
      global.DataBasedLiveblocks.enterBoard(b.id);
    }
  }

  function saveNow() {
    flushBoard();
    if (Persist) Persist.flush(snapshot);
  }

  function persist(opts) {
    flushBoard();
    if (!Persist) return;
    if (opts && opts.flush) Persist.flush(snapshot);
    else Persist.schedule(snapshot);
  }

  function esc(s) {
    return api && api.esc ? api.esc(s) : String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function announceGrant(msg) {
    const live = $("grant-live");
    if (!live) return;
    live.textContent = "";
    live.textContent = msg;
  }

  function renderBoardChrome() {
    const b = currentBoard();
    const name = $("board-name");
    const invite = $("invite-link");
    if (name) name.textContent = b.name;
    if (invite) invite.href = "#/invite/" + b.id;
    const phoneShare = $("invite-link-phone");
    if (phoneShare) phoneShare.href = "#/invite/" + b.id;
    const mcp = $("mcp-link");
    if (mcp) mcp.href = "#/mcp";
  }

  function renderBoardList() {
    const list = $("board-list");
    if (!list) return;
    list.innerHTML = store.boards.map((b) => `
      <li>
        <a href="#/" data-open="${b.id}">${esc(b.name)}</a>
        <span class="role">${(b.cards || []).length} cards</span>
        <a href="#/invite/${b.id}">Invite to board</a>
      </li>
    `).join("");
  }

  function renderGrants(id) {
    const b = store.boards.find((x) => x.id === id) || currentBoard();
    const title = $("invite-title");
    const back = $("invite-back");
    const list = $("grant-list");
    if (title) title.textContent = "Invite to this board · " + b.name;
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

  function renderPeople() {
    const access = global.DataBasedAccess;
    const list = $("user-list");
    const groups = $("boards-by-user");
    const wait = $("waitlist-list");
    if (!access || !access.isSystem()) {
      if (list) list.innerHTML = "";
      if (wait) wait.innerHTML = "";
      if (groups) groups.innerHTML = "<p class=\"lead\">Only the system user can see this directory.</p>";
      return;
    }
    const waitlistFetch = access.waitlist
      ? access.waitlist().catch(() => ({ waitlist: [] }))
      : Promise.resolve({ waitlist: [] });
    Promise.all([access.users(), access.boards(), waitlistFetch]).then(([usersDoc, boardsDoc, waitDoc]) => {
      if (wait) {
        const rows = waitDoc.waitlist || [];
        wait.innerHTML = rows.length ? rows.map((w) => `
          <li>
            <span>${esc(w.email)}</span>
            <span class="role">${esc(w.status || "pending")}</span>
            ${w.status === "invited" ? "" : `<button type="button" class="text-btn" data-waitlist-invite="${esc(w.email)}">Invite</button>`}
          </li>
        `).join("") : "<li><span class=\"role\">No requests yet</span></li>";
      }
      if (list) {
        list.innerHTML = (usersDoc.users || []).map((u) => `
          <li>
            <span>${esc(u.email)}</span>
            <span class="role">${esc(u.status)}${u.system ? " · system" : ""}</span>
            ${u.system || u.status === "revoked" ? "" : `<button type="button" class="text-btn" data-app-revoke="${esc(u.email)}">Revoke app access</button>`}
            ${u.status === "revoked" ? `<button type="button" class="text-btn" data-app-invite="${esc(u.email)}">Restore</button>` : ""}
          </li>
        `).join("");
      }
      if (groups) {
        groups.innerHTML = (boardsDoc.users || []).map((u) => {
          const owned = (u.owned || []).map((b) => `
            <li>
              <a href="#/" data-open="${b.id}">${esc(b.name)}</a>
              <span class="role">owner · ${b.cards} cards</span>
            </li>
          `).join("");
          const invited = (u.invited || []).map((b) => `
            <li>
              <a href="#/" data-open="${b.id}">${esc(b.name)}</a>
              <span class="role">${esc(b.role)} · ${b.cards} cards</span>
            </li>
          `).join("");
          return `<section class="user-boards">
            <h3>${esc(u.email)}</h3>
            <ul class="board-list">${owned || invited ? owned + invited : "<li><span class=\"role\">No boards</span></li>"}</ul>
          </section>`;
        }).join("") || "<p class=\"lead\">No boards yet.</p>";
      }
    }).catch(() => {
      if (list) list.innerHTML = "";
      if (wait) wait.innerHTML = "";
      if (groups) groups.innerHTML = "<p class=\"lead\">Could not load the directory.</p>";
    });
  }

  const OVERLAYS = ["screen-boards", "screen-invite", "screen-people", "screen-mcp"];
  let routing = false;

  function otherModalsOpen() {
    const edit = $("edit");
    const exp = $("export");
    return Boolean((edit && edit.open) || (exp && exp.open));
  }

  function overlayHash(h) {
    return h === "/boards" || h === "/people" || h === "/admin" || h === "/users" || h === "/mcp" || /^\/invite/.test(h);
  }

  function setDialog(el, on) {
    if (!el) return;
    if (el.tagName === "DIALOG") {
      if (on) {
        if (typeof el.showModal === "function") {
          if (!el.open) el.showModal();
        } else el.setAttribute("open", "");
      } else if (el.open) {
        el.close();
      } else {
        el.removeAttribute("open");
      }
      return;
    }
    el.hidden = !on;
  }

  function showView(name, inviteId) {
    routing = true;
    const boards = name === "boards";
    const invite = name === "invite";
    const people = name === "people";
    const mcp = name === "mcp";
    setDialog($("screen-boards"), boards);
    setDialog($("screen-invite"), invite);
    setDialog($("screen-people"), people);
    setDialog($("screen-mcp"), mcp);
    const overlay = boards || invite || people || mcp;
    document.body.classList.toggle("is-page", false);
    document.body.classList.toggle("is-modal", overlay || otherModalsOpen());
    const scroller = $("scroller");
    if (scroller) scroller.removeAttribute("aria-hidden");
    const tools = $("chrome-tools");
    if (tools) tools.removeAttribute("aria-hidden");
    if (api && api.showEmpty) api.showEmpty();
    if (boards) renderBoardList();
    if (invite) renderGrants(inviteId || currentBoard().id);
    if (people) renderPeople();
    routing = false;
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
    if (h === "/people" || h === "/admin" || h === "/users") {
      const access = global.DataBasedAccess;
      if (!access || !access.isSystem()) {
        showView("boards");
        return;
      }
      showView("people");
      return;
    }
    if (h === "/mcp") {
      showView("mcp");
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
          announceGrant("Already on this board.");
          return;
        }
        b.grants.push({ id: uid(), handle, role: "granted" });
        b.updatedAt = Date.now();
        saveNow();
        ev.target.reset();
        renderGrants(b.id);
        announceGrant("Granted access to " + handle);
      });
    }

    const grants = $("grant-list");
    if (grants) {
      grants.addEventListener("click", (ev) => {
        const btn = ev.target.closest("[data-revoke]");
        if (!btn) return;
        const b = currentBoard();
        const row = btn.closest("li");
        const who = row ? row.querySelector("span") && row.querySelector("span").textContent : "";
        b.grants = b.grants.filter((g) => g.id !== btn.dataset.revoke);
        b.updatedAt = Date.now();
        saveNow();
        renderGrants(b.id);
        announceGrant(who ? "Removed " + who : "Access removed");
      });
    }

    const groups = $("boards-by-user");
    if (groups) {
      groups.addEventListener("click", (ev) => {
        const open = ev.target.closest("[data-open]");
        if (!open) return;
        ev.preventDefault();
        openBoard(store.boards.find((x) => x.id === open.dataset.open));
        location.hash = "#/";
      });
    }

    const appInvite = $("app-invite-form");
    if (appInvite) {
      appInvite.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const access = global.DataBasedAccess;
        const err = $("app-invite-err");
        const live = $("app-invite-live");
        if (err) err.hidden = true;
        if (!access || !access.isSystem()) {
          if (err) {
            err.hidden = false;
            err.textContent = "Only the system user can invite people into the product.";
          }
          return;
        }
        const email = new FormData(ev.target).get("email").toString().trim().toLowerCase();
        access.inviteApp(email).then((out) => {
          if (!out.ok) {
            if (err) {
              err.hidden = false;
              err.textContent = (out.data && out.data.error) || "Invite failed.";
            }
            return;
          }
          ev.target.reset();
          if (live) live.textContent = "Granted app access to " + email;
          renderPeople();
        });
      });
    }

    const users = $("user-list");
    if (users) {
      users.addEventListener("click", (ev) => {
        const access = global.DataBasedAccess;
        if (!access) return;
        const revoke = ev.target.closest("[data-app-revoke]");
        const invite = ev.target.closest("[data-app-invite]");
        if (revoke) {
          access.revokeApp(revoke.dataset.appRevoke).then(() => renderPeople());
        }
        if (invite) {
          access.inviteApp(invite.dataset.appInvite).then(() => renderPeople());
        }
      });
    }

    const waitlist = $("waitlist-list");
    if (waitlist) {
      waitlist.addEventListener("click", (ev) => {
        const access = global.DataBasedAccess;
        if (!access) return;
        const invite = ev.target.closest("[data-waitlist-invite]");
        if (!invite) return;
        access.inviteApp(invite.dataset.waitlistInvite).then(() => renderPeople());
      });
    }

    window.addEventListener("hashchange", route);
    OVERLAYS.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("close", () => {
        if (routing) return;
        const h = (location.hash || "#/").slice(1);
        if (overlayHash(h)) location.hash = "#/";
        if (!otherModalsOpen()) document.body.classList.remove("is-modal");
      });
      el.addEventListener("click", (ev) => {
        if (ev.target !== el) return;
        location.hash = "#/";
      });
    });
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-close-overlay]");
      if (!btn) return;
      ev.preventDefault();
      location.hash = "#/";
    });
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
    open: openBoard,
    chrome: renderBoardChrome,
    route,
  };
})(window);
