/* App-owned board context menu. Disconnect lives here, not on a naked wire click. */

(function (root) {
  let host = null;
  let menu = null;
  let items = [];
  let active = -1;
  let at = { x: 88, y: 200, clientX: 0, clientY: 0 };
  let clip = null;
  let bound = false;

  function db() {
    return host || root.DB;
  }

  function flow() {
    return root.DataBasedFlow || null;
  }

  function blocked() {
    const api = db();
    if (!api) return true;
    if (api.editDlg && api.editDlg.open) return true;
    if (document.body.classList.contains("is-page")) return true;
    if (document.body.classList.contains("is-market")) return true;
    if (document.body.classList.contains("is-modal")) return true;
    return false;
  }

  function typing(t) {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t && t.isContentEditable);
  }

  function worldPt(ev) {
    if (root.Camera && typeof root.Camera.toWorld === "function") return root.Camera.toWorld(ev);
    const canvas = db() && db().canvas;
    if (!canvas) return { x: ev.clientX, y: ev.clientY };
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function cloneBody(body) {
    return JSON.parse(JSON.stringify(body || {}));
  }

  function stackTop(cards) {
    let max = 1;
    for (const c of cards) {
      if (typeof c.z === "number" && c.z > max) max = c.z;
    }
    return max;
  }

  function selectedIds() {
    const st = db().state;
    if (st.sel instanceof Set) return [...st.sel];
    return [];
  }

  function selectedCards() {
    const ids = new Set(selectedIds().map(String));
    return db().state.cards.filter((c) => ids.has(String(c.id)));
  }

  function edgeOf(el) {
    if (!el || el.dataset.edge == null) return null;
    const f = flow();
    if (f && typeof f.edgeAt === "function") return f.edgeAt(el.dataset.edge);
    const list = (db().state && db().state.edges) || [];
    return list[Number(el.dataset.edge)] || null;
  }

  function targetFromEvent(ev) {
    const t = ev.target;
    const unlink = t.closest && t.closest(".wire-unlink");
    const hit = t.closest && t.closest(".wire-hit, .wire, .wire-unlink");
    if (unlink || hit) {
      const edge = edgeOf(unlink || hit);
      if (edge) return { kind: "edge", edge };
    }
    const card = db().cardFromEvent ? db().cardFromEvent(t) : null;
    if (card) {
      const list = selectedCards();
      if (list.length > 1 && list.some((c) => String(c.id) === String(card.id))) {
        return { kind: "multi", cards: list, card };
      }
      return { kind: "card", card };
    }
    return { kind: "canvas" };
  }

  function ensureMenu() {
    if (menu) return menu;
    menu = document.createElement("div");
    menu.id = "board-menu";
    menu.className = "board-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Board");
    document.body.appendChild(menu);
    menu.addEventListener("keydown", onMenuKey);
    menu.addEventListener("mouseover", (ev) => {
      const btn = ev.target.closest("[role='menuitem']");
      if (!btn || btn.getAttribute("aria-disabled") === "true") return;
      setActive([...menu.querySelectorAll("[role='menuitem']")].indexOf(btn));
    });
    menu.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[role='menuitem']");
      if (!btn) return;
      ev.preventDefault();
      runItem(btn);
    });
    return menu;
  }

  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    menu.innerHTML = "";
    items = [];
    active = -1;
  }

  function placeMenu(clientX, clientY) {
    menu.hidden = false;
    const pad = 8;
    const viewW = window.visualViewport ? window.visualViewport.width : innerWidth;
    const viewH = window.visualViewport ? window.visualViewport.height : innerHeight;
    const ox = window.visualViewport ? window.visualViewport.offsetLeft : 0;
    const oy = window.visualViewport ? window.visualViewport.offsetTop : 0;
    const w = menu.offsetWidth || 196;
    const h = menu.offsetHeight || 40;
    let x = clientX;
    let y = clientY;
    if (x + w > ox + viewW - pad) x = ox + viewW - w - pad;
    if (y + h > oy + viewH - pad) y = oy + viewH - h - pad;
    if (x < ox + pad) x = ox + pad;
    if (y < oy + pad) y = oy + pad;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
  }

  function setActive(i) {
    const nodes = [...menu.querySelectorAll("[role='menuitem']")];
    const enabled = nodes
      .map((el, idx) => (el.getAttribute("aria-disabled") === "true" ? -1 : idx))
      .filter((idx) => idx >= 0);
    if (!enabled.length) {
      active = -1;
      return;
    }
    let next = i;
    if (next < 0) next = enabled[enabled.length - 1];
    if (next >= nodes.length) next = enabled[0];
    if (nodes[next] && nodes[next].getAttribute("aria-disabled") === "true") {
      const dir = i >= active ? 1 : -1;
      let hop = next;
      for (let n = 0; n < nodes.length; n++) {
        hop = (hop + dir + nodes.length) % nodes.length;
        if (nodes[hop].getAttribute("aria-disabled") !== "true") {
          next = hop;
          break;
        }
      }
    }
    active = next;
    nodes.forEach((el, idx) => {
      el.classList.toggle("is-on", idx === active);
      if (idx === active) el.focus();
    });
  }

  function addItem(label, id, opts) {
    const o = opts || {};
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "board-menu-item" + (o.danger ? " is-danger" : "");
    btn.setAttribute("role", "menuitem");
    btn.dataset.act = id;
    btn.tabIndex = -1;
    if (o.disabled) btn.setAttribute("aria-disabled", "true");
    const name = document.createElement("span");
    name.textContent = label;
    btn.appendChild(name);
    if (o.kbd) {
      const k = document.createElement("span");
      k.className = "kbd";
      k.textContent = o.kbd;
      btn.appendChild(k);
    }
    menu.appendChild(btn);
  }

  function addRule() {
    const hr = document.createElement("div");
    hr.className = "board-menu-rule";
    hr.setAttribute("role", "separator");
    menu.appendChild(hr);
  }

  function fillCanvas() {
    addItem("Add note", "add-note");
    addItem("Add table", "add-table");
    addItem("Add comment", "add-comment");
    addItem("Open marketplace", "market");
    addRule();
    addItem("Paste", "paste", { disabled: !clip, kbd: "⌘V" });
    addItem("Select all", "select-all", { kbd: "⌘A" });
    addItem("Reset zoom", "reset-zoom", { kbd: "0" });
    addItem("Re-center", "recenter");
  }

  function fillCard(card) {
    const f = flow();
    const links = f && typeof f.cardLinkCount === "function"
      ? f.cardLinkCount(card.id)
      : ((card.links && card.links.length) || 0);
    addItem("Edit", "edit", { kbd: "E" });
    addItem("Add comment", "add-comment");
    addItem("Duplicate", "duplicate");
    if (links) addItem("Disconnect links", "disconnect-card");
    addItem("Bring to front", "front");
    addItem("Export this card", "export-card");
    addRule();
    addItem("Delete", "delete", { danger: true, kbd: "⌫" });
  }

  function fillMulti() {
    addItem("Add comment", "add-comment");
    addItem("Duplicate", "duplicate");
    addItem("Delete", "delete", { danger: true, kbd: "⌫" });
  }

  function fillEdge(edge) {
    addItem("Disconnect", "disconnect-edge", { danger: true });
    addItem("Go to source", "goto-from");
    addItem("Go to target", "goto-to");
  }

  function openMenu(ev, target) {
    ensureMenu();
    at = {
      x: worldPt(ev).x,
      y: worldPt(ev).y,
      clientX: ev.clientX,
      clientY: ev.clientY,
      target,
    };
    menu.innerHTML = "";
    if (target.kind === "edge") fillEdge(target.edge);
    else if (target.kind === "multi") fillMulti();
    else if (target.kind === "card") fillCard(target.card);
    else fillCanvas();
    items = [...menu.querySelectorAll("[role='menuitem']")];
    placeMenu(ev.clientX, ev.clientY);
    const first = items.find((el) => el.getAttribute("aria-disabled") !== "true");
    if (first) {
      setActive(items.indexOf(first));
    } else {
      menu.tabIndex = -1;
      menu.focus();
    }
  }

  function runExport(detail) {
    const exp = root.DataBasedExport;
    if (exp && typeof exp.open === "function") exp.open(detail);
  }

  function persist() {
    if (db().persist) db().persist();
  }

  function duplicateCards(list) {
    const api = db();
    const st = api.state;
    const dx = 32;
    const dy = 24;
    const idMap = new Map();
    const clones = [];
    let z = stackTop(st.cards);
    for (const card of list) {
      const id = st.nextId++;
      idMap.set(String(card.id), id);
      const copy = {
        id,
        kind: card.kind,
        x: card.x + dx,
        y: card.y + dy,
        w: card.w,
        h: card.h,
        body: cloneBody(card.body),
        next: null,
        prev: null,
        links: [],
        z: ++z,
      };
      st.cards.push(copy);
      clones.push(copy);
    }
    const f = flow();
    const oldIds = new Set(list.map((c) => String(c.id)));
    const edges = (st.edges || []).filter((e) => oldIds.has(String(e.from)) && oldIds.has(String(e.to)));
    for (const e of edges) {
      const from = idMap.get(String(e.from));
      const to = idMap.get(String(e.to));
      if (from == null || to == null) continue;
      if (f && typeof f.link === "function") f.link(from, to, true);
      else st.edges = (st.edges || []).concat({ from, to });
    }
    api.setSelection(clones.map((c) => c.id));
    api.renderCards();
    persist();
    return clones;
  }

  function snapshot(list) {
    if (!list.length) return null;
    const ids = new Set(list.map((c) => String(c.id)));
    const edges = (db().state.edges || []).filter((e) => ids.has(String(e.from)) && ids.has(String(e.to)));
    return {
      cards: list.map((c) => ({
        id: c.id,
        kind: c.kind,
        w: c.w,
        h: c.h,
        body: cloneBody(c.body),
        ox: c.x,
        oy: c.y,
      })),
      edges: edges.map((e) => ({ from: e.from, to: e.to })),
      origin: {
        x: Math.min(...list.map((c) => c.x)),
        y: Math.min(...list.map((c) => c.y)),
      },
    };
  }

  function pasteAt(pt) {
    if (!clip || !clip.cards.length) return;
    const api = db();
    const st = api.state;
    const origin = clip.origin || { x: clip.cards[0].ox, y: clip.cards[0].oy };
    const dx = (pt && pt.x != null ? pt.x : origin.x + 32) - origin.x;
    const dy = (pt && pt.y != null ? pt.y : origin.y + 24) - origin.y;
    const idMap = new Map();
    const placed = [];
    let z = stackTop(st.cards);
    for (const c of clip.cards) {
      const id = st.nextId++;
      idMap.set(String(c.id), id);
      const copy = {
        id,
        kind: c.kind,
        x: c.ox + dx,
        y: c.oy + dy,
        w: c.w,
        h: c.h,
        body: cloneBody(c.body),
        next: null,
        prev: null,
        links: [],
        z: ++z,
      };
      st.cards.push(copy);
      placed.push(copy);
    }
    const f = flow();
    for (const e of clip.edges || []) {
      const from = idMap.get(String(e.from));
      const to = idMap.get(String(e.to));
      if (from == null || to == null) continue;
      if (f && typeof f.link === "function") f.link(from, to, true);
      else st.edges = (st.edges || []).concat({ from, to });
    }
    api.setSelection(placed.map((c) => c.id));
    api.renderCards();
    persist();
  }

  function captureClip(list) {
    clip = snapshot(list);
  }

  function focusCard(id) {
    const api = db();
    const card = api.state.cards.find((c) => String(c.id) === String(id));
    if (!card) return;
    const cx = card.x + card.w / 2;
    const cy = card.y + card.h / 2;
    if (root.Camera && typeof root.Camera.centerOn === "function") {
      root.Camera.centerOn(cx, cy, true);
    } else {
      const scroller = api.scroller;
      const z = root.Camera && typeof root.Camera.zoom === "function" ? root.Camera.zoom() : 1;
      if (scroller) {
        scroller.scrollLeft = cx * z - scroller.clientWidth / 2;
        scroller.scrollTop = cy * z - scroller.clientHeight / 2;
      }
    }
    api.setSelection([card.id]);
    const el = api.canvas && api.canvas.querySelector(`.card[data-id="${card.id}"]`);
    if (el) el.focus();
  }

  function runItem(btn) {
    if (!btn || btn.getAttribute("aria-disabled") === "true") return;
    const act = btn.dataset.act;
    const api = db();
    const target = at.target || { kind: "canvas" };
    closeMenu();
    if (act === "add-note") {
      api.place("note", { x: at.x, y: at.y });
      return;
    }
    if (act === "add-table") {
      api.place("schema", { x: at.x, y: at.y });
      return;
    }
    if (act === "add-comment") {
      const lb = root.DataBasedLiveblocks;
      const cardId = target.card && target.kind !== "multi" ? String(target.card.id) : "";
      if (lb && typeof lb.startComment === "function") {
        lb.startComment({ x: at.x, y: at.y, cardId, clientX: at.clientX, clientY: at.clientY });
      }
      if (lb && typeof lb.showComments === "function") lb.showComments();
      return;
    }
    if (act === "market") {
      api.openMarket("db");
      return;
    }
    if (act === "paste") {
      pasteAt({ x: at.x, y: at.y });
      return;
    }
    if (act === "select-all") {
      api.setSelection(api.state.cards.map((c) => c.id));
      return;
    }
    if (act === "reset-zoom") {
      if (root.Camera && typeof root.Camera.zoomTo === "function") root.Camera.zoomTo(1);
      return;
    }
    if (act === "recenter") {
      if (root.Camera && typeof root.Camera.recenter === "function") root.Camera.recenter();
      return;
    }
    if (act === "export") {
      runExport();
      return;
    }
    if (act === "export-card") {
      const card = target.card;
      runExport(card ? { cardId: card.id, card } : undefined);
      return;
    }
    if (act === "edit") {
      if (target.card) api.openEdit(target.card);
      return;
    }
    if (act === "duplicate") {
      const list = target.kind === "multi" ? target.cards : target.card ? [target.card] : selectedCards();
      if (list.length) duplicateCards(list);
      return;
    }
    if (act === "disconnect-card") {
      const card = target.card;
      const f = flow();
      if (card && f && typeof f.unlinkIncident === "function") f.unlinkIncident(card.id);
      return;
    }
    if (act === "front") {
      const card = target.card;
      const f = flow();
      if (card && f && typeof f.bringToFront === "function") {
        f.bringToFront(card);
        persist();
      }
      return;
    }
    if (act === "delete") {
      if (target.kind === "card" && target.card) api.setSelection([target.card.id]);
      api.removeSel();
      return;
    }
    if (act === "disconnect-edge") {
      const edge = target.edge;
      const f = flow();
      if (edge && f && typeof f.unlink === "function") f.unlink(edge.from, edge.to);
      return;
    }
    if (act === "goto-from" && target.edge) focusCard(target.edge.from);
    if (act === "goto-to" && target.edge) focusCard(target.edge.to);
  }

  function onMenuKey(ev) {
    if (menu.hidden) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      closeMenu();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setActive(active + 1);
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setActive(active - 1);
      return;
    }
    if (ev.key === "Home") {
      ev.preventDefault();
      setActive(0);
      return;
    }
    if (ev.key === "End") {
      ev.preventDefault();
      setActive(items.length - 1);
      return;
    }
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      const nodes = [...menu.querySelectorAll("[role='menuitem']")];
      runItem(nodes[active] || nodes[0]);
    }
  }

  function onContext(ev) {
    const scroller = db() && db().scroller;
    if (!scroller || !scroller.contains(ev.target)) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
    if (hold) {
      hold.opened = true;
      clearTimeout(hold.timer);
    }
    if (blocked()) return;
    if (ev.target.closest(".hud-empty")) return;
    const target = targetFromEvent(ev);
    if (target.kind === "card") {
      db().setSelection([target.card.id]);
    } else if (target.kind === "edge") {
      db().setSelection([]);
      const f = flow();
      if (f && typeof f.selectEdge === "function") f.selectEdge(target.edge);
    }
    openMenu(ev, target);
  }

  const HOLD_MS = 520;
  const HOLD_MOVE = 10;
  let hold = null;

  function clearHold() {
    if (!hold) return;
    clearTimeout(hold.timer);
    hold = null;
  }

  function abortSelect() {
    const sel = root.DataBasedSelect;
    if (sel && typeof sel.abortGesture === "function") sel.abortGesture();
  }

  function onHoldPointerDown(ev) {
    if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
    if (ev.button != null && ev.button !== 0) return;
    const scroller = db() && db().scroller;
    if (!scroller || !scroller.contains(ev.target)) return;
    if (blocked() || typing(ev.target)) return;
    if (ev.target.closest(".hud-empty")) return;
    if (hold && hold.id !== ev.pointerId) {
      clearHold();
      return;
    }
    const start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, target: ev.target };
    hold = {
      id: ev.pointerId,
      x: start.x,
      y: start.y,
      timer: setTimeout(() => {
        if (!hold || hold.id !== start.id) return;
        hold.opened = true;
        abortSelect();
        onContext({
          target: start.target,
          clientX: hold.x,
          clientY: hold.y,
        });
      }, HOLD_MS),
    };
  }

  function onHoldPointerMove(ev) {
    if (!hold || ev.pointerId !== hold.id) return;
    if (Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > HOLD_MOVE) clearHold();
  }

  function onHoldPointerUp(ev) {
    if (!hold || ev.pointerId !== hold.id) return;
    if (hold.opened) {
      ev.preventDefault();
      ev.stopPropagation();
    }
    clearHold();
  }

  function attach(api) {
    host = api;
    ensureMenu();
    if (bound) return;
    bound = true;
    const shell = api.scroller || document.getElementById("scroller");
    if (shell) {
      shell.addEventListener("contextmenu", onContext);
      shell.addEventListener("pointerdown", onHoldPointerDown);
      shell.addEventListener("pointermove", onHoldPointerMove);
      shell.addEventListener("pointerup", onHoldPointerUp);
      shell.addEventListener("pointercancel", clearHold);
    }
    document.addEventListener("pointerdown", (ev) => {
      if (!menu || menu.hidden) return;
      if (menu.contains(ev.target)) return;
      closeMenu();
    });
    window.addEventListener("blur", closeMenu);
    window.addEventListener("resize", closeMenu);
    if (api.scroller) {
      api.scroller.addEventListener("scroll", () => {
        if (!menu.hidden) closeMenu();
      }, { passive: true });
    }
    window.addEventListener("keydown", (ev) => {
      if (!menu.hidden) {
        if (ev.key === "Escape") {
          ev.preventDefault();
          closeMenu();
          return;
        }
        if (menu.contains(document.activeElement) || ev.target === menu) return;
      }
      if (blocked() || typing(ev.target)) return;
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === "c" || ev.key === "C")) {
        const list = selectedCards();
        if (!list.length) return;
        ev.preventDefault();
        captureClip(list);
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === "v" || ev.key === "V")) {
        if (!clip) return;
        ev.preventDefault();
        pasteAt({ x: at.x, y: at.y });
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === "d" || ev.key === "D")) {
        const list = selectedCards();
        if (!list.length) return;
        ev.preventDefault();
        duplicateCards(list);
      }
    }, true);
  }

  function boot() {
    const api = root.DB;
    if (!api || !api.canvas) return;
    attach(api);
  }

  root.DataBasedMenu = { attach, close: closeMenu, boot };

  function closePops() {
    ["chrome-menu", "board-switch-menu"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.hidden = true;
    });
    const more = document.getElementById("chrome-more");
    const sw = document.getElementById("board-switch");
    if (more) more.setAttribute("aria-expanded", "false");
    if (sw) sw.setAttribute("aria-expanded", "false");
  }

  function hostPop(pop) {
    if (pop && pop.parentElement !== document.body) document.body.appendChild(pop);
  }

  function placePop(pop, anchor) {
    if (!pop || !anchor) return;
    hostPop(pop);
    pop.hidden = false;
    pop.style.position = "fixed";
    pop.style.right = "auto";
    pop.style.bottom = "auto";
    pop.style.width = "auto";
    pop.style.height = "auto";
    pop.style.minHeight = "0";
    const gap = 6;
    const pad = 8;
    const a = anchor.getBoundingClientRect();
    const w = pop.offsetWidth || 240;
    const h = pop.offsetHeight || 40;
    let left = Math.round(a.right - w);
    let top = Math.round(a.bottom + gap);
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - pad - w);
    if (top + h > window.innerHeight - pad) {
      const above = a.top - gap - h;
      top = above >= pad ? Math.round(above) : Math.max(pad, window.innerHeight - pad - h);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";
    pop.style.maxWidth = Math.min(280, window.innerWidth - pad * 2) + "px";
  }

  function fillBoardSwitch() {
    const menu = document.getElementById("board-switch-menu");
    const api = root.Boards;
    if (!menu || !api || !api.store) return;
    const current = api.current ? api.current() : null;
    menu.innerHTML = "";
    api.store.boards.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chrome-pop-item";
      btn.setAttribute("role", "menuitem");
      btn.textContent = b.name;
      if (current && String(b.id) === String(current.id)) btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", () => {
        closePops();
        if (typeof api.open === "function") api.open(b);
        location.hash = "#/";
      });
      menu.appendChild(btn);
    });
    const hr = document.createElement("div");
    hr.className = "chrome-pop-rule";
    hr.setAttribute("role", "separator");
    menu.appendChild(hr);
    const all = document.createElement("a");
    all.className = "chrome-pop-item";
    all.href = "#/boards";
    all.setAttribute("role", "menuitem");
    all.textContent = "All boards";
    all.addEventListener("click", closePops);
    menu.appendChild(all);
  }

  function bindChrome() {
    const more = document.getElementById("chrome-more");
    const moreMenu = document.getElementById("chrome-menu");
    const sw = document.getElementById("board-switch");
    const swMenu = document.getElementById("board-switch-menu");
    if (!more || !moreMenu || !sw || !swMenu) return;
    more.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const open = moreMenu.hidden;
      closePops();
      if (open) {
        more.setAttribute("aria-expanded", "true");
        placePop(moreMenu, more);
      }
    });
    sw.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const open = swMenu.hidden;
      closePops();
      if (open) {
        fillBoardSwitch();
        sw.setAttribute("aria-expanded", "true");
        placePop(swMenu, sw);
      }
    });
    moreMenu.addEventListener("click", (ev) => {
      if (ev.target.closest("[role='menuitem']")) closePops();
    });
    document.addEventListener("pointerdown", (ev) => {
      if (ev.target.closest("#chrome-more, #board-switch, #chrome-menu, #board-switch-menu")) return;
      closePops();
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closePops();
    });
    window.addEventListener("resize", closePops);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(boot, 0);
      bindChrome();
    });
  } else {
    setTimeout(boot, 0);
    bindChrome();
  }
})(window);
