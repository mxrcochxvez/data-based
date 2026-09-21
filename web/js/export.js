(function (global) {
  const KIND_LABEL = {
    note: "Note",
    mind: "Mind map",
    schema: "SQL table",
    drizzle: "Drizzle",
    prisma: "Prisma",
    logic: "Effect",
    ctrl: "Controller",
    repo: "Repository",
    gql: "GraphQL",
  };

  const LAYER = {
    schema: "table",
    drizzle: "table",
    prisma: "table",
    repo: "dal",
    logic: "logic",
    ctrl: "controller",
    gql: "api",
    note: "note",
    mind: "note",
  };

  const LAYER_RANK = { table: 0, dal: 1, logic: 2, controller: 3, api: 4, note: 5 };
  const LANG = { schema: "sql", drizzle: "typescript", prisma: "prisma", gql: "graphql" };

  function $(id) {
    return document.getElementById(id);
  }

  function layerOf(kind) {
    return LAYER[kind] || "note";
  }

  function labelOf(kind) {
    return KIND_LABEL[kind] || kind || "card";
  }

  function cardTitle(card) {
    const body = card && card.body;
    if (!body) return "untitled";
    if (card.kind === "note") return String(body.title || "Note");
    return String(body.title || labelOf(card.kind));
  }

  function slug(name) {
    const s = String(name || "board")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    return s || "board";
  }

  function filenameFor(board) {
    return "data-based-" + slug(board && board.name) + ".md";
  }

  function cell(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
  }

  function fence(lang, src) {
    const body = String(src || "").replace(/\n+$/, "");
    return "```" + (lang || "") + "\n" + (body || "(empty)") + "\n```";
  }

  function fxLines(nodes, depth) {
    const pad = "  ".repeat(depth || 0);
    return (Array.isArray(nodes) ? nodes : []).map((n) => {
      if (!n || typeof n !== "object") return "";
      if (n.type === "if") {
        let out = (pad + "if " + (n.cond || "")).trimEnd();
        if (n.then && n.then.length) out += "\n" + fxLines(n.then, (depth || 0) + 1);
        if (n.else && n.else.length) {
          out += "\n" + pad + "else";
          out += "\n" + fxLines(n.else, (depth || 0) + 1);
        }
        return out;
      }
      if (n.type === "match") {
        let out = (pad + "match " + (n.field || "")).trimEnd();
        for (const arm of n.arms || []) {
          out += "\n" + (pad + "  when " + ((arm && arm.when) || "")).trimEnd();
          if (arm && arm.body && arm.body.length) out += "\n" + fxLines(arm.body, (depth || 0) + 2);
        }
        return out;
      }
      return (pad + (n.kind || "log") + " " + (n.target || "")).trimEnd();
    }).filter(Boolean).join("\n");
  }

  function fieldTable(fields) {
    const rows = Array.isArray(fields) ? fields : [];
    if (!rows.length) return "_No fields._";
    const lines = [
      "| name | type | default | functions |",
      "| --- | --- | --- | --- |",
    ];
    for (const f of rows) {
      lines.push("| " + [
        cell(f.name || "col"),
        cell(f.type || ""),
        cell(f.def || ""),
        cell(f.fns || f.extra || ""),
      ].join(" | ") + " |");
    }
    return lines.join("\n");
  }

  function collectEdges(board) {
    const out = [];
    const seen = new Set();
    function add(from, to) {
      if (from == null || to == null || String(from) === String(to)) return;
      const key = String(from) + ">" + String(to);
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ from, to });
    }
    (board && Array.isArray(board.edges) ? board.edges : []).forEach((e) => add(e.from, e.to));
    (board && Array.isArray(board.cards) ? board.cards : []).forEach((c) => {
      if (c.next != null) add(c.id, c.next);
      (c.links || []).forEach((to) => add(c.id, to));
    });
    return out;
  }

  function snapshot() {
    const db = global.DB;
    if (db && typeof db.flushBoard === "function") {
      try { db.flushBoard(); } catch (_) {}
    }
    if (db && typeof db.currentBoard === "function") {
      const live = db.currentBoard();
      if (live) return live;
    }
    if (db && db.state) {
      return {
        id: "live",
        name: "Board",
        cards: db.state.cards || [],
        edges: db.state.edges || [],
      };
    }
    const persist = global.Persist && typeof global.Persist.readSync === "function"
      ? global.Persist.readSync()
      : null;
    const fromLs = persist || (function () {
      try {
        return JSON.parse(localStorage.getItem("databased.v1") || "");
      } catch (_) {
        return null;
      }
    })();
    if (fromLs && Array.isArray(fromLs.boards) && fromLs.boards.length) {
      return fromLs.boards.find((b) => b.id === fromLs.currentId) || fromLs.boards[0];
    }
    return { name: "Board", cards: [], edges: [] };
  }

  function mermaidId(id) {
    return "n" + String(id).replace(/[^A-Za-z0-9_]/g, "_");
  }

  function mermaidLabel(card) {
    const title = cardTitle(card).replace(/["\[\]]/g, "");
    return title + " · " + layerOf(card.kind);
  }

  function topoOrder(cards, edges) {
    const ids = cards.map((c) => String(c.id));
    const byId = new Map(cards.map((c) => [String(c.id), c]));
    const incoming = new Map(ids.map((id) => [id, 0]));
    const outs = new Map(ids.map((id) => [id, []]));
    for (const e of edges) {
      const a = String(e.from);
      const b = String(e.to);
      if (!incoming.has(a) || !incoming.has(b)) continue;
      incoming.set(b, incoming.get(b) + 1);
      outs.get(a).push(b);
    }
    const ready = ids
      .filter((id) => incoming.get(id) === 0)
      .sort((a, b) => {
        const ca = byId.get(a);
        const cb = byId.get(b);
        const ra = LAYER_RANK[layerOf(ca.kind)] ?? 9;
        const rb = LAYER_RANK[layerOf(cb.kind)] ?? 9;
        if (ra !== rb) return ra - rb;
        return (ca.x - cb.x) || (ca.y - cb.y);
      });
    const out = [];
    const seen = new Set();
    while (ready.length) {
      const id = ready.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(byId.get(id));
      for (const nxt of outs.get(id) || []) {
        incoming.set(nxt, incoming.get(nxt) - 1);
        if (incoming.get(nxt) === 0) ready.push(nxt);
      }
    }
    for (const c of cards) {
      if (!seen.has(String(c.id))) out.push(c);
    }
    return out;
  }

  function specBlock(card) {
    const body = card.body || {};
    const kind = card.kind;
    const layer = layerOf(kind);
    const lines = [];
    lines.push("### " + cardTitle(card));
    lines.push("");
    lines.push("- id: `" + card.id + "`");
    lines.push("- kind: `" + kind + "` (" + labelOf(kind) + ")");
    lines.push("- layer: `" + layer + "`");
    if (kind === "note" || kind === "mind" || kind === "ctrl" || kind === "repo") {
      lines.push("");
      lines.push(String(body.note || "").trim() || "_No notes._");
      return lines.join("\n");
    }
    if (kind === "schema" || kind === "drizzle" || kind === "prisma" || kind === "gql") {
      lines.push("");
      lines.push("**Fields**");
      lines.push("");
      lines.push(fieldTable(body.fields));
      lines.push("");
      lines.push("**Vendor source**");
      lines.push("");
      lines.push(fence(LANG[kind] || "", body.source || ""));
      return lines.join("\n");
    }
    if (kind === "logic") {
      lines.push("");
      lines.push("**Input type**");
      lines.push("");
      lines.push(body.inputSrc ? fence("typescript", body.inputSrc) : fieldTable(body.input));
      lines.push("");
      lines.push("**Output type**");
      lines.push("");
      lines.push(body.outputSrc ? fence("typescript", body.outputSrc) : fieldTable(body.output));
      lines.push("");
      lines.push("**Effects / gates**");
      lines.push("");
      const dsl = String(body.effectsSrc || "").trim() || fxLines(body.effects);
      lines.push(fence("effects", dsl));
      return lines.join("\n");
    }
    lines.push("");
    lines.push(String(body.note || body.source || "").trim() || "_No spec._");
    return lines.join("\n");
  }

  function buildPrompt(board) {
    const name = (board && board.name) || "Board";
    const cards = (board && Array.isArray(board.cards) ? board.cards : []).slice();
    const edges = collectEdges({ cards, edges: board && board.edges });
    const byId = new Map(cards.map((c) => [String(c.id), c]));
    const ordered = topoOrder(cards, edges);

    const nodeRows = [
      "| id | layer | kind | name |",
      "| --- | --- | --- | --- |",
    ].concat(ordered.map((c) => (
      "| " + [cell(c.id), cell(layerOf(c.kind)), cell(labelOf(c.kind)), cell(cardTitle(c))].join(" | ") + " |"
    )));

    const edgeRows = edges.length
      ? [
        "| from | from name | to | to name |",
        "| --- | --- | --- | --- |",
      ].concat(edges.map((e) => {
        const from = byId.get(String(e.from));
        const to = byId.get(String(e.to));
        return "| " + [
          cell(e.from),
          cell(from ? cardTitle(from) : "?"),
          cell(e.to),
          cell(to ? cardTitle(to) : "?"),
        ].join(" | ") + " |";
      }))
      : ["_No edges. Cards are disconnected. Do not invent a unique pipeline._"];

    const mermaid = ["```mermaid", "flowchart LR"];
    if (!cards.length) mermaid.push("  empty[\"empty board\"]");
    for (const c of ordered) {
      mermaid.push("  " + mermaidId(c.id) + "[\"" + mermaidLabel(c) + "\"]");
    }
    for (const e of edges) {
      if (!byId.has(String(e.from)) || !byId.has(String(e.to))) continue;
      mermaid.push("  " + mermaidId(e.from) + " --> " + mermaidId(e.to));
    }
    mermaid.push("```");

    const byLayer = { table: [], dal: [], logic: [], controller: [], api: [], note: [] };
    for (const c of ordered) {
      const layer = layerOf(c.kind);
      (byLayer[layer] || byLayer.note).push(c);
    }

    const orderLines = [];
    const steps = [
      ["table", "Tables / schemas (Prisma, SQL, Drizzle)"],
      ["dal", "DAL / repositories"],
      ["logic", "Effects (input, output, gates)"],
      ["controller", "Controllers / HTTP entries"],
      ["api", "GraphQL types"],
      ["note", "Honor notes as constraints, not leftover copy"],
    ];
    let n = 1;
    for (const [key, label] of steps) {
      const list = byLayer[key];
      if (!list.length) continue;
      orderLines.push(n + ". **" + label + "**: " + list.map((c) => "`" + cardTitle(c) + "`").join(", "));
      n += 1;
    }
    if (!orderLines.length) orderLines.push("1. The board is empty. Do not invent a product. Ask what to place, or stop.");

    const notes = cards.filter((c) => c.kind === "note" || c.kind === "mind");
    const noteBlock = notes.length
      ? notes.map((c) => {
        const text = String((c.body && c.body.note) || "").trim();
        return "- **" + cardTitle(c) + "** (`" + c.id + "`): " + (text || "_empty_");
      }).join("\n")
      : "_No notes on this board._";

    return [
      "# Implement this data-based board",
      "",
      "You are an implementation agent working **outside** the data-based app. This file is the spec for board **" + name + "**.",
      "",
      "## Goal",
      "",
      "Build the software drawn on this board. Cards, kinds, schemas, effects/gates, notes, names, and edges are the requirements.",
      "Do not infer a product that is not written here. If a decision is missing, leave it open or ask. Do not fill gaps with a guessed feature set.",
      "",
      "## Architecture graph",
      "",
      "Intended flow is **table → dal → logic → controller**.",
      "Edges are a **bag**, many-to-many. Many tables can feed one repo. One effect can serve many controllers. Do **not** collapse this into unique 1:1 chains.",
      "",
      "### Nodes",
      "",
      nodeRows.join("\n"),
      "",
      "### Edges",
      "",
      edgeRows.join("\n"),
      "",
      "### Graph",
      "",
      mermaid.join("\n"),
      "",
      "## Node specs",
      "",
      ordered.length ? ordered.map(specBlock).join("\n\n") : "_No cards._",
      "",
      "## Notes and constraints",
      "",
      noteBlock,
      "",
      "- Implement only named cards and their edges.",
      "- Vendor source (Prisma / SQL / Drizzle / GraphQL) is canonical when present.",
      "- Effect DSL is the allowed side-effect set and the gate structure (`if` / `else` / `match` / `when`). Do not add hidden I/O.",
      "- Controller and repo notes are the contract, not decoration.",
      "- Keep existing project laws / proofs green if the repo has them. Do not weaken a law to make a feature fit.",
      "",
      "## Suggested implementation order",
      "",
      orderLines.join("\n"),
      "",
      "Finish one node (or one small edge bag) and verify it before starting the next.",
      "",
      "## Operating rules",
      "",
      "These are pstack-flavored rules for the receiving agent. Follow them while implementing.",
      "",
      "1. **Don't infer product.** The board is the product surface. No extra screens, fields, endpoints, or copy unless a card states them.",
      "2. **Edge bags, not unique chains.** Honor every edge. Do not assume each table has exactly one repo, or each effect one controller.",
      "3. **Name the data shape first.** Types, tables, and effect I/O before procedure. Encode the domain in a structure, not scattered conditionals.",
      "4. **Small diffs.** Smallest change that satisfies the next node. No speculative layers. Subtract dead weight before adding.",
      "5. **Prove it.** Done means the real artifact works (running API, query, or UI), not that it compiles. Reproduce, then fix the root cause.",
      "6. **Sequence into verifiable units.** One checkable slice per step. Do not stack unverified work.",
      "7. **Laws stay true.** If the host repo has laws, proofs, or a verify skill, run them. Do not invent a parallel architecture to dodge them.",
      "8. **Guards at the boundary.** Parse and validate at the controller / HTTP edge. Trust internal types after that.",
      "9. **No is allowed.** If a card contradicts another, stop and name the conflict. Do not silently pick a winner.",
      "",
    ].join("\n");
  }

  function downloadMarkdown(name, text) {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyText(text, ta) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => {
        if (!ta) return false;
        ta.focus();
        ta.select();
        return document.execCommand("copy");
      });
    }
    if (ta) {
      ta.focus();
      ta.select();
      document.execCommand("copy");
    }
    return Promise.resolve();
  }

  function trapTab(ev, root) {
    if (ev.key !== "Tab" || !root) return;
    const nodes = [...root.querySelectorAll("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")]
      .filter((el) => !el.disabled && !el.hidden && el.offsetParent);
    if (!nodes.length) {
      ev.preventDefault();
      root.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const inside = root.contains(document.activeElement);
    if (ev.shiftKey && (!inside || document.activeElement === first)) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && (!inside || document.activeElement === last)) {
      ev.preventDefault();
      first.focus();
    }
  }

  function bind() {
    const dlg = $("export");
    const ta = $("export-text");
    const openBtn = $("export-open");
    const copyBtn = $("export-copy");
    const dlBtn = $("export-download");
    const live = $("export-live");
    if (!dlg || !ta) return;

    function current() {
      const board = snapshot();
      return { board, text: buildPrompt(board), filename: filenameFor(board) };
    }

    function paint() {
      const { board, text, filename } = current();
      ta.value = text;
      dlg.dataset.filename = filename;
      const lead = $("export-lead");
      if (lead) {
        lead.textContent = "Paste into Cursor, Claude, or Codex outside this app. File: " + filename;
      }
      if (dlBtn) dlBtn.setAttribute("aria-label", "Download " + filename);
      return { board, text, filename };
    }

    function open() {
      paint();
      document.body.classList.add("is-modal");
      if (openBtn) openBtn.setAttribute("aria-expanded", "true");
      if (typeof dlg.showModal === "function") dlg.showModal();
      else dlg.setAttribute("open", "");
      ta.focus();
      ta.select();
    }

    function close() {
      if (dlg.open) dlg.close();
    }

    if (openBtn) openBtn.addEventListener("click", open);
    document.querySelectorAll("[data-export-open]").forEach((el) => {
      el.addEventListener("click", open);
    });

    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        const { text } = paint();
        Promise.resolve(copyText(text, ta)).then(() => {
          copyBtn.textContent = "Copied";
          if (live) live.textContent = "Copied to clipboard";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
            if (live) live.textContent = "";
          }, 1400);
        });
      });
    }

    if (dlBtn) {
      dlBtn.addEventListener("click", () => {
        const { text, filename } = paint();
        downloadMarkdown(filename, text);
        if (live) live.textContent = "Downloaded " + filename;
      });
    }

    dlg.addEventListener("close", () => {
      const overlay = ["screen-boards", "screen-invite", "screen-people", "screen-mcp"].some((id) => {
        const el = $(id);
        return el && el.open;
      });
      const edit = $("edit");
      if ((!edit || !edit.open) && !overlay) document.body.classList.remove("is-modal");
      if (openBtn) openBtn.setAttribute("aria-expanded", "false");
      if (copyBtn) copyBtn.textContent = "Copy";
      if (live) live.textContent = "";
    });

    document.addEventListener("keydown", (ev) => {
      if (!dlg.open) return;
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopPropagation();
        close();
        return;
      }
      trapTab(ev, dlg);
    }, true);

    global.DataBasedExport = {
      open,
      close,
      snapshot,
      buildPrompt,
      filenameFor,
      downloadMarkdown,
      collectEdges,
    };
  }

  const exported = { buildPrompt, filenameFor, collectEdges };
  global.DataBasedExport = Object.assign(global.DataBasedExport || {}, exported);
  if (typeof module !== "undefined" && module.exports) module.exports = exported;

  if (global.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
})(typeof window !== "undefined" ? window : globalThis);
