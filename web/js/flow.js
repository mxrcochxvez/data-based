(function (root) {
  const PIPE_NEXT = { schema: "repo", drizzle: "repo", prisma: "repo", kysely: "repo", convex: "repo", repo: "logic", logic: "ctrl" };
  const PIPE_LABEL = { repo: "Add repository", logic: "Add effects", ctrl: "Add controller" };
  const PIPE_SUFFIX = { repo: "Repo", logic: "Effect", ctrl: "Controller" };

  let host = null;
  let noteEditId = null;
  let selEdge = null;
  let linkDrag = null;
  let plusGesture = null;
  let bound = false;

  function kinds() {
    return root.DataBasedKinds || null;
  }

  function nextKindFor(kind) {
    const k = kinds();
    if (k && k.pipeNext) return k.pipeNext(kind);
    return PIPE_NEXT[kind] || null;
  }

  function esc(s) {
    if (host && host.esc) return host.esc(s);
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function cards() {
    return (host && host.state && host.state.cards) || [];
  }

  function edges() {
    if (!host || !host.state) return [];
    if (!Array.isArray(host.state.edges)) host.state.edges = [];
    return host.state.edges;
  }

  function currentBoard() {
    const store = (host && host.store) || (root.DB && root.DB.store);
    if (!store || !store.boards) return null;
    return store.boards.find((b) => b.id === store.currentId) || store.boards[0] || null;
  }

  function edgeKey(from, to) {
    return String(from) + ">" + String(to);
  }

  function collectEdges(board, list) {
    const out = [];
    const seen = new Set();
    function add(from, to) {
      if (from == null || to == null || String(from) === String(to)) return;
      const key = edgeKey(from, to);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ from, to });
    }
    (board && Array.isArray(board.edges) ? board.edges : []).forEach((e) => add(e.from, e.to));
    const canon = board && Array.isArray(board.edges);
    if (canon && (board.edges.length || (host && host.state && host.state._edgeBoard === board.id))) {
      return out;
    }
    (list || []).forEach((c) => {
      if (c.next != null) add(c.id, c.next);
      (c.links || []).forEach((to) => add(c.id, to));
    });
    return out;
  }

  function writeLinks(list, listEdges) {
    const items = list || cards();
    const eds = listEdges || edges();
    for (const c of items) {
      const outs = eds.filter((e) => String(e.from) === String(c.id)).map((e) => e.to);
      c.links = outs;
      c.next = outs.length ? outs[0] : null;
    }
  }

  function flushToBoard(board) {
    const b = board || currentBoard();
    if (!b) return;
    b.edges = edges().map((e) => ({ from: e.from, to: e.to }));
    writeLinks(b.cards || cards(), b.edges);
  }

  function hydrateFromBoard(board) {
    const b = board || currentBoard();
    const list = (b && b.cards) || cards();
    const collected = collectEdges(b, list);
    const st = (host && host.state) || (root.DB && root.DB.state);
    if (st) {
      st.edges = collected;
      st._edgeBoard = b ? b.id : null;
    }
    writeLinks(list, collected);
    selEdge = null;
  }

  function pruneEdges() {
    const ids = new Set(cards().map((c) => String(c.id)));
    if (!host || !host.state) return;
    host.state.edges = edges().filter((e) => ids.has(String(e.from)) && ids.has(String(e.to)));
    writeLinks(cards(), host.state.edges);
  }

  function link(from, to, silent) {
    if (from == null || to == null || String(from) === String(to)) return null;
    const list = cards();
    if (!list.some((c) => String(c.id) === String(from))) return null;
    if (!list.some((c) => String(c.id) === String(to))) return null;
    if (edges().some((e) => edgeKey(e.from, e.to) === edgeKey(from, to))) return null;
    const edge = { from, to };
    edges().push(edge);
    writeLinks(list, edges());
    flushToBoard();
    if (!silent) {
      drawWires();
      if (host && host.persist) host.persist();
    }
    return edge;
  }

  function unlink(from, to) {
    if (!host || !host.state) return false;
    const before = edges().length;
    host.state.edges = edges().filter((e) => edgeKey(e.from, e.to) !== edgeKey(from, to));
    if (selEdge && edgeKey(selEdge.from, selEdge.to) === edgeKey(from, to)) selEdge = null;
    writeLinks(cards(), host.state.edges);
    flushToBoard();
    drawWires();
    if (host.persist) host.persist();
    return edges().length !== before;
  }

  function unlinkIncident(id) {
    if (!host || !host.state || id == null) return 0;
    const sid = String(id);
    const before = edges().length;
    host.state.edges = edges().filter((e) => String(e.from) !== sid && String(e.to) !== sid);
    if (selEdge && (String(selEdge.from) === sid || String(selEdge.to) === sid)) selEdge = null;
    writeLinks(cards(), host.state.edges);
    flushToBoard();
    drawWires();
    if (host.persist) host.persist();
    return before - edges().length;
  }

  function selectEdge(edge) {
    selEdge = edge ? { from: edge.from, to: edge.to } : null;
    drawWires();
    return selEdge;
  }

  function selectedEdge() {
    return selEdge;
  }

  function cardLinkCount(id) {
    const sid = String(id);
    return edges().filter((e) => String(e.from) === sid || String(e.to) === sid).length;
  }

  function edgeAt(i) {
    return edges()[Number(i)] || null;
  }

  function pinEmpty(el) {
    if (!el) return;
    if (el.closest(".canvas") || el.closest("#canvas") || el.closest(".board")) {
      document.body.appendChild(el);
    }
    el.classList.add("hud-empty");
  }

  function syncEmpty(el, list) {
    const node = el || (host && host.empty) || document.getElementById("empty");
    if (!node) return;
    pinEmpty(node);
    const on = (list || cards()).length === 0 && !document.body.classList.contains("is-page");
    node.hidden = !on;
  }

  function cardById(id) {
    return cards().find((c) => String(c.id) === String(id)) || null;
  }

  function fan(card, side, index, total) {
    const mid = card.y + card.h / 2;
    if (total <= 1) return mid;
    const gap = Math.min(22, Math.max(12, (card.h - 28) / total));
    return mid + (index - (total - 1) / 2) * gap;
  }

  function endpoints(edge, list) {
    const items = list || cards();
    const from = items.find((c) => String(c.id) === String(edge.from));
    const to = items.find((c) => String(c.id) === String(edge.to));
    if (!from || !to) return null;
    const outs = items.filter(() => true);
    const outI = edges().filter((e) => String(e.from) === String(from.id)).findIndex((e) => edgeKey(e.from, e.to) === edgeKey(edge.from, edge.to));
    const inI = edges().filter((e) => String(e.to) === String(to.id)).findIndex((e) => edgeKey(e.from, e.to) === edgeKey(edge.from, edge.to));
    const outN = Math.max(1, edges().filter((e) => String(e.from) === String(from.id)).length);
    const inN = Math.max(1, edges().filter((e) => String(e.to) === String(to.id)).length);
    void outs;
    return {
      x1: from.x + from.w + 8,
      y1: fan(from, "out", Math.max(0, outI), outN),
      x2: to.x - 8,
      y2: fan(to, "in", Math.max(0, inI), inN),
    };
  }

  function curve(x1, y1, x2, y2) {
    const span = Math.max(48, Math.abs(x2 - x1) * 0.45);
    return `M ${x1} ${y1} C ${x1 + span} ${y1}, ${x2 - span} ${y2}, ${x2} ${y2}`;
  }

  function ensureWires(svg) {
    let node = svg || (host && host.wires) || document.getElementById("wires");
    const canvas = host && host.canvas;
    if (!node && canvas) {
      node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      node.setAttribute("class", "wires flow-wires");
      node.setAttribute("id", "wires");
      node.setAttribute("aria-hidden", "true");
      canvas.insertBefore(node, canvas.firstChild);
    }
    if (node) {
      node.classList.add("flow-wires");
      host && (host.wires = node);
    }
    return node;
  }

  function drawWires(svg, list) {
    const node = ensureWires(svg);
    if (!node) return;
    pruneEdges();
    const items = list || cards();
    const parts = [
      "<defs>",
      '<marker id="flow-arrow" viewBox="0 0 12 8" refX="11" refY="4" markerWidth="9" markerHeight="7" orient="auto">',
      '<path d="M0 0L12 4L0 8Z" fill="#111"/>',
      "</marker>",
      '<marker id="flow-arrow-sel" viewBox="0 0 12 8" refX="11" refY="4" markerWidth="9" markerHeight="7" orient="auto">',
      '<path d="M0 0L12 4L0 8Z" fill="#0d99ff"/>',
      "</marker>",
      "</defs>",
    ];
    if (linkDrag) {
      parts.push(
        `<path class="wire is-draft" d="${curve(linkDrag.x1, linkDrag.y1, linkDrag.x2, linkDrag.y2)}"/>`
      );
    }
    edges().forEach((edge, i) => {
      const p = endpoints(edge, items);
      if (!p) return;
      const on = selEdge && edgeKey(selEdge.from, selEdge.to) === edgeKey(edge.from, edge.to);
      const d = curve(p.x1, p.y1, p.x2, p.y2);
      const mark = on ? "url(#flow-arrow-sel)" : "url(#flow-arrow)";
      parts.push(`<path class="wire-hit" data-edge="${i}" d="${d}"/>`);
      parts.push(`<path class="wire${on ? " is-sel" : ""}" data-edge="${i}" marker-end="${mark}" d="${d}"/>`);
      const mx = (p.x1 + p.x2) / 2;
      const my = (p.y1 + p.y2) / 2;
      parts.push(`<g class="wire-unlink${on ? " is-on" : ""}" data-edge="${i}" aria-label="Disconnect" transform="translate(${mx},${my})">`);
      parts.push('<circle r="8" fill="#fff" stroke="#111" stroke-width="1.2"/>');
      parts.push('<path d="M-3.2-1.2h2.6M.6 1.2h2.6M-4.2.8A2.6 2.6 0 0 1-1.2-2.2M4.2-.8A2.6 2.6 0 0 1 1.2 2.2" fill="none" stroke="#111" stroke-width="1.25" stroke-linecap="round"/>');
      parts.push("</g>");
    });
    node.innerHTML = parts.join("");
  }

  function nextControl(card) {
    const next = nextKindFor(card.kind);
    if (!next) return "";
    const k = kinds();
    const label = (k && k.addLabel && k.addLabel(next)) || PIPE_LABEL[next];
    return `<button type="button" class="card-next" data-next="${card.id}" title="${esc(label)}" aria-label="${esc(label)}">+</button>`;
  }

  function portHtml(card) {
    return `
      <button type="button" class="flow-port in" data-port="in" data-id="${card.id}" aria-label="Incoming links"></button>
      <button type="button" class="flow-port out" data-port="out" data-id="${card.id}" aria-label="Drag to link" title="Drag to another card to link"></button>
    `;
  }

  function stackTop() {
    let max = 1;
    for (const c of cards()) {
      if (typeof c.z === "number" && c.z > max) max = c.z;
    }
    return max;
  }

  function applyStack(el, card) {
    if (!el || !card) return;
    if (card.z == null) card.z = 1;
    el.style.zIndex = String(card.z);
  }

  function bringToFront(card) {
    if (!card) return card;
    card.z = stackTop() + 1;
    const el = host && host.canvas && host.canvas.querySelector(`.card[data-id="${card.id}"]`);
    applyStack(el, card);
    return card;
  }

  function decorate(el, card) {
    if (!el || !card) return;
    if (!el.querySelector(".flow-port")) el.insertAdjacentHTML("beforeend", portHtml(card));
    if (nextKindFor(card.kind) && !el.querySelector(".card-next")) {
      el.insertAdjacentHTML("beforeend", nextControl(card));
    }
    applyStack(el, card);
  }

  function fillNote(el, card) {
    const editing = noteEditId === card.id;
    const text = (card.body && card.body.note) || "";
    el.classList.add("note");
    el.innerHTML = `
      <div class="card-bar"><span class="card-kind">Note</span></div>
      ${editing
        ? `<textarea class="note-text" data-note="${card.id}" placeholder="Write a note">${esc(text)}</textarea>`
        : `<div class="note-view${text ? "" : " is-empty"}" data-note-view="${card.id}">${text ? esc(text) : "Double-click to write"}</div>`}
      <span class="handle se" data-handle="se" aria-hidden="true"></span>
      ${portHtml(card)}
    `;
    if (editing) {
      const ta = el.querySelector("textarea");
      queueMicrotask(() => {
        if (!ta) return;
        ta.focus();
        const n = ta.value.length;
        try { ta.setSelectionRange(n, n); } catch (_) {}
      });
    }
  }

  function startNoteEdit(card) {
    if (!card || card.kind !== "note") return;
    noteEditId = card.id;
    const el = host && host.canvas && host.canvas.querySelector(`.card[data-id="${card.id}"]`);
    if (el) fillNote(el, card);
    else if (host && host.renderCards) host.renderCards();
  }

  function endNoteEdit(save) {
    if (noteEditId == null) return;
    const id = noteEditId;
    if (save !== false && host) {
      const ta = host.canvas.querySelector(`[data-note="${id}"]`);
      const card = cardById(id);
      if (ta && card) {
        card.body.note = ta.value;
        if (host.persist) host.persist();
      }
    }
    noteEditId = null;
    if (host && host.renderCards) host.renderCards();
  }

  function stemName(title) {
    if (host && host.stemName) return host.stemName(title);
    const raw = String(title || "").replace(/[^A-Za-z0-9_]+/g, "").replace(/(Table|Model|Repo|Service|Effect|Controller|s)$/i, "") || "Item";
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function addLayer(from, api) {
    const ctx = api || host;
    if (!ctx || !from || !ctx.place) return null;
    const next = nextKindFor(from.kind);
    if (!next) return null;
    const k = kinds();
    const already = edges().filter((e) => String(e.from) === String(from.id)).length;
    const card = ctx.place(next, {
      title: stemName(from.body && from.body.title) + ((k && k.suffix && k.suffix(next)) || PIPE_SUFFIX[next] || ""),
      x: from.x + from.w + 72,
      y: from.y + already * 36,
    });
    if (card) {
      link(from.id, card.id);
      bringToFront(card);
    }
    return card;
  }

  function placeNote(opts) {
    if (!host || !host.place) return null;
    return host.place("note", opts || {});
  }

  function canvasPt(ev) {
    if (root.Camera && typeof root.Camera.toWorld === "function") return root.Camera.toWorld(ev);
    const canvas = host && host.canvas;
    if (!canvas) return { x: ev.clientX, y: ev.clientY };
    const r = canvas.getBoundingClientRect();
    const z = (root.Camera && typeof root.Camera.zoom === "function") ? root.Camera.zoom() : 1;
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  }

  function cardAtPoint(ev) {
    const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
    for (const n of stack) {
      const card = n.closest && n.closest(".card");
      if (card) return cardById(card.dataset.id);
    }
    return null;
  }

  function injectStyle() {
    if (document.getElementById("flow-style")) return;
    const s = document.createElement("style");
    s.id = "flow-style";
    s.textContent = `
      .hud-empty {
        position: fixed !important;
        left: 72px;
        top: 68px;
        z-index: 7;
        width: min(380px, calc(100vw - 96px));
        pointer-events: none;
      }
      .hud-empty .btn { pointer-events: auto; }
      .note-view {
        flex: 1;
        min-height: 0;
        padding: 0 12px 12px;
        font: 14px/1.45 var(--sans, ui-sans-serif, system-ui, sans-serif);
        color: #111;
        white-space: pre-wrap;
        word-break: break-word;
        cursor: text;
      }
      .note-view.is-empty { color: #6b5a1e; }
      .card {
        isolation: isolate;
        overflow: visible;
      }
      .card .card-next,
      .card .flow-port,
      .card .handle { z-index: 1; }
      .wires, .wires.flow-wires { z-index: 0; pointer-events: none; }
      .wires.flow-wires .wire-hit { pointer-events: stroke; fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }
      .wires.flow-wires .wire-unlink {
        pointer-events: auto;
        opacity: 0;
        cursor: pointer;
      }
      .wires.flow-wires .wire-hit:hover + .wire + .wire-unlink,
      .wires.flow-wires .wire-unlink.is-on,
      .wires.flow-wires .wire-unlink:hover {
        opacity: 1;
      }
      .wires.flow-wires .wire-unlink:hover circle { fill: #111; }
      .wires.flow-wires .wire-unlink:hover path { stroke: #fff; }
      .wire { fill: none; stroke: #111; stroke-width: 1.6; stroke-linecap: round; pointer-events: none; }
      .wire.is-sel { stroke: #0d99ff; stroke-width: 2; }
      .wire.is-draft { stroke: #111; stroke-dasharray: 5 4; opacity: 0.7; pointer-events: none; }
      .flow-port {
        position: absolute;
        width: 16px;
        height: 16px;
        padding: 0;
        border: 1.5px solid #111;
        background: #fff;
        border-radius: 50%;
        z-index: 2;
        cursor: crosshair;
        pointer-events: auto;
      }
      .flow-port::after {
        content: "";
        position: absolute;
        inset: -10px;
      }
      .flow-port.out { right: -9px; top: 50%; transform: translateY(-50%); }
      .flow-port.in { left: -9px; top: 50%; transform: translateY(-50%); }
      .card:hover .flow-port, .card.is-sel .flow-port {
        box-shadow: 0 0 0 2px #fff;
      }
      .flow-port:hover, .flow-port.is-hot { background: #111; }
      .flow-port:focus-visible { outline: 2px solid #0d99ff; outline-offset: 2px; }
      .card.is-link-target { box-shadow: 0 0 0 2px #0d99ff; }
      .card .card-next { top: calc(50% - 28px); }
    `;
    document.head.appendChild(s);
  }

  function afterRender() {
    if (!host) return;
    const board = currentBoard();
    if (board && host.state._edgeBoard !== board.id) hydrateFromBoard(board);
    else pruneEdges();
    if (host.canvas) {
      host.canvas.querySelectorAll(".card").forEach((el) => {
        decorate(el, cardById(el.dataset.id));
      });
    }
    document.querySelectorAll(".card.is-link-target").forEach((n) => n.classList.remove("is-link-target"));
    syncEmpty(host.empty, host.state.cards);
    drawWires(host.wires, host.state.cards);
  }

  function startLink(fromId, ev) {
    const from = cardById(fromId);
    if (!from) return;
    const pt = canvasPt(ev);
    linkDrag = { from: from.id, x1: from.x + from.w + 8, y1: from.y + from.h / 2, x2: pt.x, y2: pt.y };
    selEdge = null;
    drawWires();
    try { ev.target.setPointerCapture(ev.pointerId); } catch (_) {
      try { (host.canvas || document).setPointerCapture(ev.pointerId); } catch (__) {}
    }
  }

  function moveLink(ev) {
    if (plusGesture && !linkDrag) {
      const dx = ev.clientX - plusGesture.x;
      const dy = ev.clientY - plusGesture.y;
      if (Math.hypot(dx, dy) >= 6) {
        plusGesture.dragged = true;
        startLink(plusGesture.id, ev);
      }
    }
    if (!linkDrag) return;
    ev.preventDefault();
    const pt = canvasPt(ev);
    linkDrag.x2 = pt.x;
    linkDrag.y2 = pt.y;
    const over = cardAtPoint(ev);
    document.querySelectorAll(".card.is-link-target").forEach((n) => n.classList.remove("is-link-target"));
    if (over && String(over.id) !== String(linkDrag.from)) {
      const el = host.canvas.querySelector(`.card[data-id="${over.id}"]`);
      if (el) el.classList.add("is-link-target");
    }
    drawWires();
  }

  function endLink(ev) {
    if (plusGesture && !plusGesture.dragged && !linkDrag) {
      const card = cardById(plusGesture.id);
      plusGesture = null;
      if (card) addLayer(card, host);
      return;
    }
    plusGesture = null;
    if (!linkDrag) return;
    const from = linkDrag.from;
    const over = ev ? cardAtPoint(ev) : null;
    linkDrag = null;
    document.querySelectorAll(".card.is-link-target").forEach((n) => n.classList.remove("is-link-target"));
    if (over && String(over.id) !== String(from)) link(from, over.id);
    else drawWires();
  }

  function bind(api) {
    const canvas = api.canvas;
    if (!canvas || bound) return;
    bound = true;

    canvas.addEventListener("click", (ev) => {
      const next = ev.target.closest("[data-next]");
      if (next) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const kill = ev.target.closest(".wire-unlink");
      if (kill) {
        ev.preventDefault();
        ev.stopPropagation();
        const edge = edges()[Number(kill.dataset.edge)];
        if (edge) unlink(edge.from, edge.to);
        return;
      }
      const hit = ev.target.closest(".wire-hit, .wire");
      if (hit && hit.dataset.edge != null) {
        ev.preventDefault();
        ev.stopPropagation();
        const edge = edges()[Number(hit.dataset.edge)];
        if (edge) {
          if (host.setSelection) host.setSelection([]);
          selectEdge(edge);
        }
      }
    }, true);

    canvas.addEventListener("pointerdown", (ev) => {
      if (!ev.target.closest("[data-edge]") && !ev.target.closest(".card")) {
        if (selEdge) {
          selEdge = null;
          drawWires();
        }
      }
      const node = ev.target.closest(".card");
      if (node) bringToFront(cardById(node.dataset.id));
      const port = ev.target.closest(".flow-port");
      if (port) {
        ev.preventDefault();
        ev.stopPropagation();
        startLink(port.dataset.id, ev);
        return;
      }
      const plus = ev.target.closest("[data-next]");
      if (plus) {
        ev.preventDefault();
        ev.stopPropagation();
        plusGesture = { id: plus.dataset.next, x: ev.clientX, y: ev.clientY, dragged: false };
        try { plus.setPointerCapture(ev.pointerId); } catch (_) {}
      }
    }, true);

    window.addEventListener("pointermove", moveLink);
    window.addEventListener("pointerup", (ev) => {
      if (plusGesture || linkDrag) {
        ev.stopPropagation();
        endLink(ev);
      }
    }, true);
    window.addEventListener("pointercancel", () => endLink());

    canvas.addEventListener("dblclick", (ev) => {
      const node = ev.target.closest(".card.note");
      if (!node) return;
      if (ev.target.closest("[data-next]") || ev.target.closest(".flow-port")) return;
      const card = cardById(node.dataset.id);
      if (!card) return;
      ev.preventDefault();
      ev.stopPropagation();
      startNoteEdit(card);
    }, true);

    canvas.addEventListener("input", (ev) => {
      const ta = ev.target.closest("[data-note]");
      if (!ta) return;
      const card = cardById(ta.dataset.note);
      if (card) {
        card.body.note = ta.value;
        if (api.persist) api.persist();
      }
    });

    canvas.addEventListener("focusout", (ev) => {
      if (!ev.target.closest("[data-note]")) return;
      if (ev.relatedTarget && ev.relatedTarget.closest(`[data-note="${noteEditId}"]`)) return;
      endNoteEdit(true);
    });

    window.addEventListener("keydown", (ev) => {
      if (ev.key !== "Backspace" && ev.key !== "Delete") return;
      if (!selEdge) return;
      const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
      if (typing) return;
      ev.preventDefault();
      ev.stopPropagation();
      unlink(selEdge.from, selEdge.to);
    }, true);
  }

  function attach(api) {
    host = api;
    if (host.state && !Array.isArray(host.state.edges)) host.state.edges = [];
    injectStyle();
    pinEmpty(api.empty);
    bind(api);
    hydrateFromBoard(currentBoard());
    const origRender = api.renderCards;
    if (origRender && !origRender._flowWrapped) {
      api.renderCards = function wrappedRender() {
        const out = origRender.apply(this, arguments);
        afterRender();
        return out;
      };
      api.renderCards._flowWrapped = true;
    }
    if (typeof api.setSelection === "function" && !api.setSelection._flowWrapped) {
      const origSel = api.setSelection;
      api.setSelection = function wrappedSel(ids) {
        if (ids && ids.length) selEdge = null;
        return origSel.apply(this, arguments);
      };
      api.setSelection._flowWrapped = true;
    }
    const origPaint = api.paintCard;
    if (origPaint && !origPaint._flowWrapped) {
      api.paintCard = function wrappedPaint(card) {
        const out = origPaint.apply(this, arguments);
        if (card && api.canvas) {
          applyStack(api.canvas.querySelector(`.card[data-id="${card.id}"]`), card);
        }
        drawWires(api.wires, api.state.cards);
        return out;
      };
      api.paintCard._flowWrapped = true;
    }
    afterRender();
    return api;
  }

  function boot() {
    const db = root.DB;
    if (!db || !db.canvas || (host && host.canvas === db.canvas)) return;
    attach({
      state: db.state,
      store: db.store,
      place: db.place,
      persist: db.persist,
      persistDoc: db.persistDoc,
      renderCards: db.renderCards,
      paintCard: db.paintCard,
      canvas: db.canvas,
      scroller: db.scroller,
      wires: document.getElementById("wires"),
      empty: document.getElementById("empty"),
      stemName: db.stemName,
      esc: db.esc,
    });
  }

  root.DataBasedFlow = {
    PIPE_NEXT,
    PIPE_LABEL,
    PIPE_SUFFIX,
    nextKindFor,
    nextControl,
    fillNote,
    startNoteEdit,
    endNoteEdit,
    addLayer,
    drawWires,
    syncEmpty,
    placeNote,
    attach,
    link,
    unlink,
    unlinkIncident,
    selectEdge,
    selectedEdge,
    cardLinkCount,
    edgeAt,
    flushToBoard,
    hydrateFromBoard,
    decorate,
    bringToFront,
    applyStack,
    boot,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
})(window);
