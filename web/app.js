const CATALOG = [
  {
    id: "maps",
    heading: "Notes",
    items: [
      { kind: "note", name: "Note", blurb: "A sticky on the board. Plain text.", vendor: "data-based" },
      { kind: "mind", name: "Idea card", blurb: "A titled note for a decision or an open question.", vendor: "data-based" },
    ],
  },
  {
    id: "db",
    heading: "Databases",
    items: [
      { kind: "schema", name: "SQL table", blurb: "CREATE TABLE with typed columns.", vendor: "data-based" },
      { kind: "drizzle", name: "Drizzle table", blurb: "pgTable in TypeScript.", vendor: "Drizzle" },
      { kind: "prisma", name: "Prisma model", blurb: "A model block from schema.prisma.", vendor: "Prisma" },
    ],
  },
  {
    id: "logic",
    heading: "Business logic",
    items: [
      { kind: "logic", name: "Effect", blurb: "Input type, output type, and the effects inside the box.", vendor: "data-based" },
      { kind: "ctrl", name: "Controller", blurb: "An HTTP entry that owns a use-case.", vendor: "data-based" },
    ],
  },
  {
    id: "repo",
    heading: "Repository",
    items: [
      { kind: "repo", name: "Repo layout", blurb: "Folders and the boundary they protect.", vendor: "data-based" },
    ],
  },
  {
    id: "api",
    heading: "APIs",
    items: [
      { kind: "gql", name: "GraphQL type", blurb: "An object type in SDL.", vendor: "GraphQL" },
    ],
  },
];

const KIND = {
  note: { label: "Note", title: "Note" },
  mind: { label: "Mind map", title: "Untitled idea" },
  schema: { label: "SQL table", title: "users" },
  drizzle: { label: "Drizzle", title: "users" },
  prisma: { label: "Prisma", title: "User" },
  logic: { label: "Effect", title: "onSignup" },
  ctrl: { label: "Controller", title: "CreateUser" },
  repo: { label: "Repository", title: "src/modules" },
  gql: { label: "GraphQL", title: "User" },
};

const EFFECT_KINDS = ["db.read", "db.write", "http", "log", "queue", "throw"];

const VENDORS = {
  schema: {
    lang: "sql",
    types: ["uuid", "text", "integer", "boolean", "timestamptz", "varchar"],
    defaults: ["", "gen_random_uuid()", "now()", "true", "false"],
    fns: ["", "primary key", "not null", "unique", "not null unique", "primary key not null"],
  },
  drizzle: {
    lang: "typescript",
    types: ["uuid", "text", "varchar", "serial", "integer", "boolean", "timestamp", "jsonb"],
    defaults: ["", "defaultRandom()", "defaultNow()", "default(true)", "default(false)"],
    fns: ["", "primaryKey()", "notNull()", "unique()", "primaryKey().notNull()", "notNull().unique()"],
  },
  prisma: {
    lang: "prisma",
    types: ["String", "Int", "Boolean", "DateTime", "Json", "Decimal", "Float", "BigInt", "Bytes"],
    defaults: ["", "uuid()", "cuid()", "now()", "autoincrement()", "true", "false"],
    fns: ["", "@id", "@unique", "@updatedAt", "@id @unique"],
  },
  gql: {
    lang: "graphql",
    types: ["ID", "String", "Int", "Float", "Boolean", "ID!", "String!"],
    defaults: [""],
    fns: ["", "!", "[]"],
  },
  type: {
    lang: "typescript",
    types: ["string", "number", "boolean", "Date", "unknown"],
    defaults: [""],
    fns: ["", "?"],
  },
};

const PIPE_NEXT = { schema: "repo", drizzle: "repo", prisma: "repo", repo: "logic", logic: "ctrl" };
const PIPE_LABEL = { repo: "Add repository", logic: "Add effects", ctrl: "Add controller" };
const PIPE_SUFFIX = { repo: "Repo", logic: "Effect", ctrl: "Controller" };

const $ = (id) => document.getElementById(id);
const canvas = $("canvas");
const scroller = $("scroller");
const empty = $("empty");
const veil = $("veil");
const marketBody = $("market-body");
const editDlg = $("edit");
const editBody = $("edit-body");
const editTitle = $("edit-title");
const editKind = $("edit-kind");
const parseErr = $("parse-err");
const wires = $("wires");

const state = {
  tool: "select",
  cards: [],
  sel: null,
  nextId: 1,
  drag: null,
  pan: null,
  placeAt: { x: 88, y: 200 },
  dragged: false,
  editing: null,
};

const KEY = "data-based.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyBoard(name) {
  return {
    id: uid(),
    name: name || "Board",
    cards: [],
    nextId: 1,
    placeAt: { x: 88, y: 200 },
    grants: [{ id: "owner", handle: "you", role: "owner" }],
  };
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "");
    if (raw && Array.isArray(raw.boards) && raw.boards.length) {
      raw.boards.forEach((b) => {
        b.grants = b.grants && b.grants.length ? b.grants : [{ id: "owner", handle: "you", role: "owner" }];
      });
      return raw;
    }
  } catch (_) {}
  const b = emptyBoard("Board");
  return { boards: [b], currentId: b.id };
}

const store = loadStore();

function currentBoard() {
  return store.boards.find((b) => b.id === store.currentId) || store.boards[0];
}

function normalizeCard(c) {
  c.next = c.next || null;
  c.prev = c.prev || null;
  if (isSchema(c.kind) && c.body && c.body.fields) {
    c.body.fields = hydrateFields(c.kind, c.body.fields);
  }
  if (c.kind === "note" && c.body && c.body.note == null) c.body.note = "";
  return c;
}

function hydrateBoard(b) {
  store.currentId = b.id;
  state.cards = (b.cards || []).map(normalizeCard);
  state.nextId = b.nextId || 1;
  state.placeAt = b.placeAt || { x: 88, y: 200 };
  state.sel = null;
  state.editing = null;
}

function flushBoard() {
  const b = currentBoard();
  if (!b) return;
  b.cards = state.cards;
  b.nextId = state.nextId;
  b.placeAt = state.placeAt;
}

function persist() {
  flushBoard();
  localStorage.setItem(KEY, JSON.stringify({ boards: store.boards, currentId: store.currentId }));
}

hydrateBoard(currentBoard());

function isSchema(kind) {
  return kind === "schema" || kind === "drizzle" || kind === "prisma" || kind === "gql";
}

function isTable(kind) {
  return kind === "schema" || kind === "drizzle" || kind === "prisma";
}

function ident(name, fallback) {
  return String(name || "").replace(/[^A-Za-z0-9_]+/g, "") || fallback;
}

function sqlIdent(name) {
  return String(name || "table").replace(/[^A-Za-z0-9_]+/g, "_").toLowerCase() || "table";
}

function modelName(title) {
  const raw = ident(title, "Model");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function stemName(title) {
  const raw = ident(String(title || "").replace(/(Table|Model|Repo|Service|Effect|Controller|s)$/i, ""), "Item");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function fieldLine(f) {
  const def = f.def || "";
  const fns = f.fns || "";
  let extra = f.extra || "";
  if (def || fns) extra = [fns, def ? "default " + def : ""].filter(Boolean).join(" ");
  return { name: f.name || "col", type: f.type || "text", extra, def, fns };
}

function splitExtra(kind, extra) {
  const e = extra || "";
  if (kind === "prisma") {
    const dm = e.match(/@default\(([^)]*)\)/);
    return { def: dm ? dm[1] : "", fns: e.replace(/@default\([^)]*\)/g, "").trim() };
  }
  if (kind === "drizzle") {
    const parts = e.split(".").map((s) => s.trim()).filter(Boolean);
    return {
      def: parts.filter((p) => /^default/i.test(p)).join("."),
      fns: parts.filter((p) => !/^default/i.test(p)).join("."),
    };
  }
  if (kind === "schema") {
    const dm = e.match(/\bdefault\s+(\S+)/i);
    return { def: dm ? dm[1] : "", fns: e.replace(/\bdefault\s+\S+/i, "").trim() };
  }
  return { def: "", fns: e };
}

function hydrateFields(kind, fields) {
  return (fields || []).map((f) => {
    const split = splitExtra(kind, f.extra || "");
    return { name: f.name, type: f.type, def: f.def || split.def, fns: f.fns || split.fns, extra: f.extra || "" };
  });
}

const LANG = {
  schema: {
    rawLabel: "SQL",
    lang: "sql",
    generate(title, fields) {
      const cols = fields.map((f) => {
        const row = fieldLine(f);
        const tail = [row.fns, row.def ? "default " + row.def : row.extra].filter(Boolean).join(" ");
        return `  ${row.name} ${row.type}${tail ? " " + tail : ""}`;
      }).join(",\n");
      return `create table ${sqlIdent(title)} (\n${cols}\n);`;
    },
    parse(text) {
      const src = String(text || "");
      const head = src.match(/create\s+table\s+([A-Za-z0-9_."]+)/i);
      const open = src.indexOf("(");
      const close = src.lastIndexOf(")");
      if (!head || open < 0 || close <= open) return { ok: false, error: "Need a CREATE TABLE ( … ) block." };
      const fields = [];
      for (const part of splitTop(src.slice(open + 1, close))) {
        const bits = part.trim().replace(/,$/, "").split(/\s+/);
        if (bits.length < 2) continue;
        fields.push({ name: bits[0].replace(/"/g, ""), type: bits[1], extra: bits.slice(2).join(" ") });
      }
      if (!fields.length) return { ok: false, error: "No columns found in the table body." };
      return { ok: true, title: head[1].replace(/"/g, ""), fields: hydrateFields("schema", fields) };
    },
  },
  drizzle: {
    rawLabel: "Drizzle",
    lang: "typescript",
    generate(title, fields) {
      const table = sqlIdent(title);
      const cols = fields.map((f) => {
        const row = fieldLine(f);
        const call = drizzleCall(row.type, row.name);
        const chain = [row.fns, row.def].filter(Boolean).join(".");
        return `  ${row.name}: ${call}${chain ? "." + chain.replace(/^\.+/, "") : ""},`;
      }).join("\n");
      return `export const ${table} = pgTable("${table}", {\n${cols}\n});`;
    },
    parse(text) {
      const src = String(text || "");
      const head = src.match(/(?:export\s+const\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(pgTable|mysqlTable|sqliteTable)\(\s*["']([^"']+)["']/);
      const open = src.indexOf("{");
      const close = src.lastIndexOf("}");
      if (!head || open < 0 || close <= open) return { ok: false, error: "Need a pgTable / mysqlTable / sqliteTable({ … }) definition." };
      const fields = [];
      for (const part of splitTop(src.slice(open + 1, close))) {
        const m = part.trim().replace(/,$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([a-zA-Z]+)\(\s*["']?([^"')]+)?["']?\s*\)(.*)$/);
        if (!m) continue;
        fields.push({ name: m[1], type: m[2], extra: m[4].replace(/^\./, "").trim() });
      }
      if (!fields.length) return { ok: false, error: "No column helpers found in the table object." };
      return { ok: true, title: head[3] || head[1], fields: hydrateFields("drizzle", fields) };
    },
  },
  prisma: {
    rawLabel: "Prisma",
    lang: "prisma",
    generate(title, fields) {
      const name = modelName(title);
      const cols = fields.map((f) => {
        const row = fieldLine(f);
        const raw = String(row.def || "").trim();
        const inner = (raw.match(/^@default\((.*)\)$/) || [])[1];
        const def = raw ? `@default(${inner != null ? inner : raw})` : "";
        const extra = [row.fns, def].filter(Boolean).join(" ");
        const pad = row.name.length < 6 ? " ".repeat(6 - row.name.length) : " ";
        return `  ${row.name}${pad}${row.type}${extra ? " " + extra : ""}`;
      }).join("\n");
      return `model ${name} {\n${cols}\n}`;
    },
    parse(text) {
      const src = String(text || "");
      const head = src.match(/model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
      const open = src.indexOf("{");
      const close = src.lastIndexOf("}");
      if (!head || open < 0 || close <= open) return { ok: false, error: "Need a Prisma model Name { … } block." };
      const fields = [];
      for (const line of src.slice(open + 1, close).split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
        const bits = t.split(/\s+/);
        if (bits.length < 2) continue;
        fields.push({ name: bits[0], type: bits[1], extra: bits.slice(2).join(" ") });
      }
      if (!fields.length) return { ok: false, error: "No fields found in the model." };
      return { ok: true, title: head[1], fields: hydrateFields("prisma", fields) };
    },
  },
  gql: {
    rawLabel: "GraphQL SDL",
    lang: "graphql",
    generate(title, fields) {
      const name = modelName(title);
      const cols = fields.map((f) => {
        const row = fieldLine(f);
        return `  ${row.name}: ${row.type}${row.fns ? " " + row.fns : ""}`;
      }).join("\n");
      return `type ${name} {\n${cols}\n}`;
    },
    parse(text) {
      const src = String(text || "");
      const head = src.match(/type\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
      const open = src.indexOf("{");
      const close = src.lastIndexOf("}");
      if (!head || open < 0 || close <= open) return { ok: false, error: "Need a GraphQL type Name { … } block." };
      const fields = [];
      for (const line of src.slice(open + 1, close).split("\n")) {
        const t = line.trim().replace(/,$/, "");
        if (!t || t.startsWith("#")) continue;
        const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\s]+)(.*)$/);
        if (!m) continue;
        fields.push({ name: m[1], type: m[2], extra: m[3].trim() });
      }
      if (!fields.length) return { ok: false, error: "No fields found in the type." };
      return { ok: true, title: head[1], fields: hydrateFields("gql", fields) };
    },
  },
};

function drizzleCall(type, name) {
  const t = type || "text";
  if (/[()]/.test(t) && /^[a-zA-Z]+/.test(t)) return t.includes("(") ? t : `${t}("${name}")`;
  return `${t}("${name}")`;
}

function splitTop(src) {
  const out = [];
  let buf = "";
  let depth = 0;
  for (const ch of src) {
    if (ch === "(" || ch === "{" || ch === "[") depth += 1;
    if (ch === ")" || ch === "}" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (buf.trim()) out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out;
}

function typeExpr(label, fields) {
  const rows = fields.map((f) => `  ${f.name || "field"}: ${f.type || "string"}`).join("\n");
  return `type ${label} = {\n${rows}\n}`;
}

function parseTypeExpr(text) {
  const src = String(text || "");
  const open = src.indexOf("{");
  const close = src.lastIndexOf("}");
  if (open < 0 || close <= open) return { ok: false, error: "Need a type { name: type } expression." };
  const fields = [];
  for (const line of src.slice(open + 1, close).split(/[\n,]/)) {
    const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;]+?)\s*;?$/);
    if (!m) continue;
    fields.push({ name: m[1], type: m[2].trim(), def: "", fns: "" });
  }
  if (!fields.length) return { ok: false, error: "No properties found in the type." };
  return { ok: true, title: (src.match(/type\s+([A-Za-z_][A-Za-z0-9_]*)/) || [])[1], fields };
}

function effectsText(rows) {
  return rows.map((r) => `${r.kind || "log"} ${r.target || ""}`.trim()).join("\n");
}

function parseEffects(text) {
  const rows = [];
  for (const line of String(text || "").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const bits = t.split(/\s+/);
    if (!EFFECT_KINDS.includes(bits[0])) return { ok: false, error: `Unknown effect “${bits[0]}”. Use ${EFFECT_KINDS.join(", ")}.` };
    rows.push({ kind: bits[0], target: bits.slice(1).join(" ") });
  }
  return { ok: true, rows };
}

function defaultFields(kind) {
  if (kind === "prisma") {
    return [
      { name: "id", type: "String", def: "uuid()", fns: "@id" },
      { name: "email", type: "String", def: "", fns: "@unique" },
    ];
  }
  if (kind === "drizzle") {
    return [
      { name: "id", type: "uuid", def: "defaultRandom()", fns: "primaryKey()" },
      { name: "email", type: "text", def: "", fns: "notNull().unique()" },
    ];
  }
  if (kind === "gql") {
    return [
      { name: "id", type: "ID!", def: "", fns: "" },
      { name: "email", type: "String!", def: "", fns: "" },
    ];
  }
  return [
    { name: "id", type: "uuid", def: "", fns: "primary key" },
    { name: "email", type: "text", def: "", fns: "not null unique" },
  ];
}

function blank(kind) {
  const meta = KIND[kind];
  if (kind === "note") return { title: "Note", note: "" };
  if (isSchema(kind)) {
    const fields = defaultFields(kind);
    return { title: meta.title, fields, source: LANG[kind].generate(meta.title, fields) };
  }
  if (kind === "logic") {
    const input = [{ name: "userId", type: "string", def: "", fns: "" }, { name: "email", type: "string", def: "", fns: "" }];
    const output = [{ name: "ok", type: "boolean", def: "", fns: "" }];
    const effects = [{ kind: "db.write", target: "users" }, { kind: "http", target: "POST /invite" }];
    return {
      title: meta.title,
      input,
      output,
      effects,
      inputSrc: typeExpr("Input", input),
      outputSrc: typeExpr("Output", output),
      effectsSrc: effectsText(effects),
    };
  }
  if (kind === "ctrl") return { title: meta.title, note: "POST /users → create user, return 201" };
  if (kind === "repo") return { title: meta.title, note: "findById, save, list" };
  return { title: meta.title, note: "What has to be true?" };
}

function preview(card) {
  if (card.kind === "note") return "";
  if (isSchema(card.kind)) {
    return `<ul>${card.body.fields.map((f) => `<li>${esc(f.name)} <code>${esc(f.type)}</code></li>`).join("")}</ul>`;
  }
  if (card.kind === "logic") {
    return `<ul>${card.body.effects.map((e) => `<li><code>${esc(e.kind)}</code> ${esc(e.target || "")}</li>`).join("")}</ul>`;
  }
  return `<p>${esc(card.body.note)}</p>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function comboCell(name, value, list) {
  return `
    <div class="combo">
      <input type="text" name="${name}" value="${esc(value || "")}" data-combo="${list}" autocomplete="off">
      <button type="button" class="combo-chev" tabindex="-1" aria-label="Options">▾</button>
      <ul class="combo-list" hidden></ul>
    </div>
  `;
}

function gridRow(f) {
  return `
    <tr>
      <td><input type="text" name="fname" value="${esc(f.name || "")}" placeholder="name"></td>
      <td>${comboCell("ftype", f.type, "types")}</td>
      <td>${comboCell("fdef", f.def, "defaults")}</td>
      <td>${comboCell("ffns", f.fns, "fns")}</td>
      <td class="kill"><button type="button" class="icon-x drop-field" aria-label="Remove field">×</button></td>
    </tr>
  `;
}

function fieldGrid(fields, vendor) {
  return `
    <div class="grid" data-vendor="${vendor}">
      <table>
        <thead>
          <tr><th>Name</th><th>Type</th><th>Default</th><th>Functions</th><th></th></tr>
        </thead>
        <tbody>${fields.map(gridRow).join("")}</tbody>
      </table>
    </div>
    <button type="button" class="btn ghost add-row" data-add-row>+</button>
  `;
}

function codeBox(name, lang, value) {
  return `
    <div class="code" data-lang="${lang}">
      <pre class="code-hi" aria-hidden="true"><code></code></pre>
      <textarea name="${name}" spellcheck="false">${esc(value || "")}</textarea>
    </div>
  `;
}

function paintCode(ta) {
  const box = ta.closest(".code");
  if (!box) return;
  const lang = box.dataset.lang || "typescript";
  const code = box.querySelector("code");
  const html = window.Highlight ? window.Highlight.toHtml(lang, ta.value) : esc(ta.value);
  code.innerHTML = html + "\n";
}

function paintAllCode(root) {
  (root || editBody).querySelectorAll(".code textarea").forEach(paintCode);
}

function bindCodeScroll(root) {
  (root || editBody).querySelectorAll(".code textarea").forEach((ta) => {
    paintCode(ta);
    ta.addEventListener("scroll", () => {
      const hi = ta.previousElementSibling;
      hi.scrollTop = ta.scrollTop;
      hi.scrollLeft = ta.scrollLeft;
    });
  });
}

function setTa(ta, value) {
  if (!ta || document.activeElement === ta) return;
  ta.value = value;
  paintCode(ta);
}

function renderCatalog() {
  marketBody.innerHTML = CATALOG.map((sec) => `
    <section class="section" id="sec-${sec.id}">
      <h3>${esc(sec.heading)}</h3>
      ${sec.items.map((it) => `
        <button type="button" class="offer" data-kind="${it.kind}">
          <div class="offer-name">${esc(it.name)}</div>
          <div class="offer-blurb">${esc(it.blurb)}</div>
          <div class="offer-vendor">${esc(it.vendor)}</div>
        </button>
      `).join("")}
    </section>
  `).join("");
}

function openMarket(section) {
  veil.hidden = false;
  veil.classList.remove("hidden");
  if (section && section !== "market" && section !== "canvas") {
    const node = document.getElementById(`sec-${section}`);
    if (node) node.scrollIntoView({ block: "start" });
  }
}

function closeMarket() {
  veil.hidden = true;
  veil.classList.add("hidden");
}

function nextKindFor(kind) {
  return PIPE_NEXT[kind] || null;
}

function cardNode(card) {
  const el = document.createElement("article");
  el.className = "card" + (state.sel === card.id ? " is-sel" : "") + (card.kind === "note" ? " note" : "");
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.dataset.id = String(card.id);
  el.tabIndex = 0;
  el.setAttribute("aria-label", `${KIND[card.kind].label} ${card.body.title}`);
  const next = nextKindFor(card.kind);
  const nextBtn = next && !card.next
    ? `<button type="button" class="card-next" data-next="${card.id}" title="${PIPE_LABEL[next]}">+</button>`
    : "";
  if (card.kind === "note") {
    el.innerHTML = `
      <div class="card-bar"><span class="card-kind">Note</span></div>
      <textarea class="note-text" data-note="${card.id}" placeholder="Write a note">${esc(card.body.note || "")}</textarea>
      <span class="handle se" data-handle="se"></span>
    `;
  } else {
    el.innerHTML = `
      <div class="card-bar">
        <span class="card-kind">${esc(KIND[card.kind].label)}</span>
        <span class="card-title">${esc(card.body.title)}</span>
        <button type="button" class="card-edit" data-edit="${card.id}">Edit</button>
      </div>
      <div class="card-body">${preview(card)}</div>
      ${nextBtn}
      <span class="handle se" data-handle="se"></span>
    `;
  }
  return el;
}

function drawWires() {
  if (!wires) return;
  const parts = ['<defs><marker id="arrow" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><path d="M0 0L10 3.5L0 7Z" fill="#111"/></marker></defs>'];
  for (const card of state.cards) {
    if (!card.next) continue;
    const to = state.cards.find((c) => c.id === card.next);
    if (!to) continue;
    const x1 = card.x + card.w;
    const y1 = card.y + card.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const mid = x1 + Math.max(40, (x2 - x1) / 2);
    parts.push(`<path class="wire" marker-end="url(#arrow)" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"/>`);
  }
  wires.innerHTML = parts.join("");
}

function showEmpty() {
  const on = state.cards.length === 0 && !document.body.classList.contains("is-page");
  empty.hidden = !on;
}

function renderCards() {
  showEmpty();
  canvas.querySelectorAll(".card").forEach((n) => n.remove());
  for (const card of state.cards) canvas.appendChild(cardNode(card));
  drawWires();
  persist();
}

function paintCard(card) {
  const el = canvas.querySelector(`.card[data-id="${card.id}"]`);
  if (!el) return;
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.classList.toggle("is-sel", state.sel === card.id);
  drawWires();
}

function selected() {
  return state.cards.find((c) => c.id === state.sel) || null;
}

function place(kind, opts) {
  const o = opts || {};
  const body = blank(kind);
  if (o.title) body.title = o.title;
  const noteCount = state.cards.filter((c) => c.kind === "note").length;
  const card = {
    id: state.nextId++,
    kind,
    x: o.x != null ? o.x : (kind === "note" ? 88 + noteCount * 28 : state.placeAt.x),
    y: o.y != null ? o.y : (kind === "note" ? 380 + noteCount * 20 : state.placeAt.y),
    w: kind === "note" ? 200 : kind === "logic" ? 280 : 248,
    h: kind === "note" ? 160 : 164,
    body,
    next: null,
    prev: o.prev || null,
  };
  if (o.x == null && kind !== "note") {
    state.placeAt.x += 32;
    state.placeAt.y += 24;
  }
  state.cards.push(card);
  if (o.prev) {
    const parent = state.cards.find((c) => c.id === o.prev);
    if (parent) parent.next = card.id;
  }
  state.sel = card.id;
  closeMarket();
  renderCards();
  return card;
}

function addLayer(from) {
  const next = nextKindFor(from.kind);
  if (!next) return;
  if (from.next && state.cards.some((c) => c.id === from.next)) return;
  const title = stemName(from.body.title) + PIPE_SUFFIX[next];
  place(next, { title, x: from.x + from.w + 72, y: from.y, prev: from.id });
}

function removeSel() {
  if (state.sel == null) return;
  const id = state.sel;
  for (const c of state.cards) {
    if (c.next === id) c.next = null;
    if (c.prev === id) c.prev = null;
  }
  state.cards = state.cards.filter((c) => c.id !== id);
  state.sel = null;
  renderCards();
}

function readFields(box) {
  const rows = [...box.querySelectorAll("tbody tr")];
  if (rows.length) {
    return rows.map((row) => ({
      name: (row.querySelector('[name="fname"]') || {}).value || "col",
      type: (row.querySelector('[name="ftype"]') || {}).value || "text",
      def: (row.querySelector('[name="fdef"]') || {}).value || "",
      fns: (row.querySelector('[name="ffns"]') || {}).value || "",
    }));
  }
  const names = [...box.querySelectorAll('[name="fname"]')];
  const types = [...box.querySelectorAll('[name="ftype"]')];
  return names.map((n, i) => ({
    name: n.value || "col",
    type: types[i] ? types[i].value || "text" : "text",
    def: "",
    fns: "",
  }));
}

function effectRow(row) {
  const opts = EFFECT_KINDS.map((k) => `<option value="${k}" ${k === row.kind ? "selected" : ""}>${k}</option>`).join("");
  return `
    <div class="row effect">
      <select name="ekind">${opts}</select>
      <input type="text" name="etarget" value="${esc(row.target || "")}" placeholder="table, url, or message">
      <button type="button" class="move up" aria-label="Move up">↑</button>
      <button type="button" class="move down" aria-label="Move down">↓</button>
      <button type="button" class="icon-x drop-fx" aria-label="Remove effect">×</button>
    </div>
  `;
}

function readEffects(box) {
  const kinds = [...box.querySelectorAll('[name="ekind"]')];
  const targets = [...box.querySelectorAll('[name="etarget"]')];
  return kinds.map((k, i) => ({ kind: k.value, target: targets[i] ? targets[i].value : "" }));
}

function setErr(msg) {
  parseErr.hidden = !msg;
  parseErr.textContent = msg || "";
}

function openEdit(card) {
  if (card.kind === "note") {
    const ta = canvas.querySelector(`[data-note="${card.id}"]`);
    if (ta) ta.focus();
    return;
  }
  state.editing = card.id;
  state.sel = card.id;
  editTitle.textContent = card.body.title;
  editKind.textContent = KIND[card.kind].label;
  setErr("");
  if (isSchema(card.kind)) {
    const lang = LANG[card.kind];
    const parsed = lang.parse(card.body.source);
    const source = parsed.ok ? card.body.source : lang.generate(card.body.title, card.body.fields);
    editBody.innerHTML = `
      <label class="field"><span>Name</span><input type="text" name="title" value="${esc(card.body.title)}"></label>
      <div class="split">
        <div>${fieldGrid(card.body.fields, card.kind)}</div>
        <label class="field"><span>${esc(lang.rawLabel)}</span>${codeBox("source", lang.lang, source)}</label>
      </div>
    `;
  } else if (card.kind === "logic") {
    editBody.innerHTML = `
      <label class="field"><span>Name</span><input type="text" name="title" value="${esc(card.body.title)}"></label>
      <section class="block" data-slot="input">
        <h3>Input type</h3>
        <div class="split">
          <div>${fieldGrid(card.body.input, "type")}</div>
          <label class="field"><span>Type expression</span>${codeBox("inputSrc", "typescript", card.body.inputSrc)}</label>
        </div>
      </section>
      <section class="block" data-slot="output">
        <h3>Output type</h3>
        <div class="split">
          <div>${fieldGrid(card.body.output, "type")}</div>
          <label class="field"><span>Type expression</span>${codeBox("outputSrc", "typescript", card.body.outputSrc)}</label>
        </div>
      </section>
      <section class="block" data-slot="effects">
        <h3>Effects in the box</h3>
        <div class="split">
          <div>
            <div id="fx-list">${card.body.effects.map(effectRow).join("")}</div>
            <button type="button" class="btn ghost" id="add-fx">Add effect</button>
          </div>
          <label class="field"><span>Effects list</span>${codeBox("effectsSrc", "effects", card.body.effectsSrc)}</label>
        </div>
      </section>
    `;
  } else {
    editBody.innerHTML = `
      <label class="field"><span>Name</span><input type="text" name="title" value="${esc(card.body.title)}"></label>
      <label class="field"><span>Notes</span><textarea name="note">${esc(card.body.note)}</textarea></label>
    `;
  }
  editDlg.showModal();
  bindCodeScroll(editBody);
}

function editingCard() {
  return state.cards.find((c) => c.id === state.editing) || selected();
}

function syncSchemaFromFields() {
  const card = editingCard();
  if (!card || !isSchema(card.kind)) return;
  const title = editBody.querySelector('[name="title"]').value || card.body.title;
  const fields = readFields(editBody);
  setTa(editBody.querySelector('[name="source"]'), LANG[card.kind].generate(title, fields));
  setErr("");
}

function syncSchemaFromSource() {
  const card = editingCard();
  if (!card || !isSchema(card.kind)) return;
  const ta = editBody.querySelector('[name="source"]');
  paintCode(ta);
  const parsed = LANG[card.kind].parse(ta.value);
  if (!parsed.ok) {
    setErr(parsed.error);
    return;
  }
  setErr("");
  const title = editBody.querySelector('[name="title"]');
  if (parsed.title && document.activeElement !== title) title.value = parsed.title;
  const tbody = editBody.querySelector("tbody");
  if (!tbody || (document.activeElement && tbody.contains(document.activeElement))) return;
  tbody.innerHTML = parsed.fields.map(gridRow).join("");
}

function syncTypeSlot(slot, label) {
  const box = editBody.querySelector(`[data-slot="${slot}"]`);
  if (!box) return;
  const fields = readFields(box);
  setTa(box.querySelector("textarea"), typeExpr(label, fields));
}

function syncTypeFromSource(slot) {
  const box = editBody.querySelector(`[data-slot="${slot}"]`);
  if (!box) return;
  const ta = box.querySelector("textarea");
  paintCode(ta);
  const parsed = parseTypeExpr(ta.value);
  if (!parsed.ok) {
    setErr(parsed.error);
    return;
  }
  setErr("");
  const tbody = box.querySelector("tbody");
  if (!tbody || (document.activeElement && tbody.contains(document.activeElement))) return;
  tbody.innerHTML = parsed.fields.map(gridRow).join("");
}

function syncEffectsFromRows() {
  const box = editBody.querySelector('[data-slot="effects"]');
  if (!box) return;
  setTa(box.querySelector("textarea"), effectsText(readEffects(box)));
}

function syncEffectsFromSource() {
  const box = editBody.querySelector('[data-slot="effects"]');
  if (!box) return;
  const ta = box.querySelector("textarea");
  paintCode(ta);
  const parsed = parseEffects(ta.value);
  if (!parsed.ok) {
    setErr(parsed.error);
    return;
  }
  setErr("");
  const list = $("fx-list");
  if (document.activeElement && list.contains(document.activeElement)) return;
  list.innerHTML = parsed.rows.map(effectRow).join("");
}

function saveEdit() {
  const card = editingCard();
  if (!card) return;
  const titleEl = editBody.querySelector('[name="title"]');
  if (titleEl) card.body.title = titleEl.value || card.body.title;
  if (isSchema(card.kind)) {
    card.body.fields = readFields(editBody);
    card.body.source = editBody.querySelector('[name="source"]').value;
    const parsed = LANG[card.kind].parse(card.body.source);
    if (parsed.ok) {
      card.body.fields = parsed.fields;
      if (parsed.title) card.body.title = parsed.title;
    }
  } else if (card.kind === "logic") {
    const inputBox = editBody.querySelector('[data-slot="input"]');
    const outputBox = editBody.querySelector('[data-slot="output"]');
    const fxBox = editBody.querySelector('[data-slot="effects"]');
    card.body.inputSrc = inputBox.querySelector("textarea").value;
    card.body.outputSrc = outputBox.querySelector("textarea").value;
    card.body.effectsSrc = fxBox.querySelector("textarea").value;
    const pin = parseTypeExpr(card.body.inputSrc);
    const pout = parseTypeExpr(card.body.outputSrc);
    const pfx = parseEffects(card.body.effectsSrc);
    card.body.input = pin.ok ? pin.fields : readFields(inputBox);
    card.body.output = pout.ok ? pout.fields : readFields(outputBox);
    card.body.effects = pfx.ok ? pfx.rows : readEffects(fxBox);
  } else if (card.kind !== "note") {
    const note = editBody.querySelector('[name="note"]');
    if (note) card.body.note = note.value || "";
  }
  state.editing = null;
  renderCards();
}

function cardFromEvent(t) {
  const node = t.closest(".card");
  if (!node) return null;
  return state.cards.find((c) => String(c.id) === node.dataset.id) || null;
}

function comboOpts(input) {
  const vendor = input.closest("[data-vendor]")?.dataset.vendor || "schema";
  const pack = VENDORS[vendor] || VENDORS.schema;
  return pack[input.dataset.combo] || [];
}

function closeCombos(except) {
  editBody.querySelectorAll(".combo-list").forEach((list) => {
    if (except && except.contains(list)) return;
    list.hidden = true;
  });
}

function openCombo(combo, filter) {
  const input = combo.querySelector("input");
  const list = combo.querySelector(".combo-list");
  const q = String(filter ?? input.value).toLowerCase();
  const opts = comboOpts(input);
  const shown = opts.filter((o) => !q || String(o).toLowerCase().includes(q));
  list.innerHTML = shown.length
    ? shown.map((o) => `<li role="option" data-val="${esc(o)}">${esc(o || "(none)")}</li>`).join("")
    : `<li class="is-empty">Keep typing a custom value.</li>`;
  list.hidden = false;
  list.querySelector("li[data-val]")?.classList.add("is-on");
}

function pickCombo(combo, value) {
  const input = combo.querySelector("input");
  input.value = value;
  closeCombos();
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function moveCombo(list, dir) {
  const items = [...list.querySelectorAll("li[data-val]")];
  if (!items.length) return;
  const i = items.findIndex((el) => el.classList.contains("is-on"));
  items.forEach((el) => el.classList.remove("is-on"));
  const next = items[Math.max(0, Math.min(items.length - 1, (i < 0 ? 0 : i) + dir))];
  next.classList.add("is-on");
  next.scrollIntoView({ block: "nearest" });
}

canvas.addEventListener("click", (ev) => {
  const next = ev.target.closest("[data-next]");
  if (next) {
    const card = state.cards.find((c) => String(c.id) === next.dataset.next);
    if (card) addLayer(card);
    return;
  }
  const edit = ev.target.closest("[data-edit]");
  if (!edit) return;
  const card = state.cards.find((c) => String(c.id) === edit.dataset.edit);
  if (card) openEdit(card);
});

canvas.addEventListener("input", (ev) => {
  const ta = ev.target.closest("[data-note]");
  if (!ta) return;
  const card = state.cards.find((c) => String(c.id) === ta.dataset.note);
  if (card) {
    card.body.note = ta.value;
    persist();
  }
});

canvas.addEventListener("pointerdown", (ev) => {
  if (ev.target.closest(".note-text")) {
    const card = cardFromEvent(ev.target);
    if (card) {
      state.sel = card.id;
      paintCard(card);
    }
    return;
  }
  if (ev.target.closest(".btn") || ev.target.closest("[data-edit]") || ev.target.closest("[data-next]")) return;
  if (state.tool === "pan") {
    state.pan = { x: ev.clientX, y: ev.clientY, sl: scroller.scrollLeft, st: scroller.scrollTop };
    scroller.setPointerCapture(ev.pointerId);
    return;
  }
  const handle = ev.target.closest(".handle");
  const card = cardFromEvent(ev.target);
  state.dragged = false;
  if (handle && card) {
    state.sel = card.id;
    state.drag = { mode: "resize", id: card.id, x: ev.clientX, y: ev.clientY, w: card.w, h: card.h };
    paintCard(card);
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
    return;
  }
  if (card) {
    state.sel = card.id;
    state.drag = { mode: "move", id: card.id, x: ev.clientX, y: ev.clientY, left: card.x, top: card.y, armed: false };
    document.querySelectorAll(".card").forEach((n) => n.classList.toggle("is-sel", n.dataset.id === String(card.id)));
    try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
    return;
  }
  state.sel = null;
  document.querySelectorAll(".card").forEach((n) => n.classList.remove("is-sel"));
});

canvas.addEventListener("pointermove", (ev) => {
  if (state.pan) {
    scroller.scrollLeft = state.pan.sl - (ev.clientX - state.pan.x);
    scroller.scrollTop = state.pan.st - (ev.clientY - state.pan.y);
    return;
  }
  if (!state.drag) return;
  const dx = ev.clientX - state.drag.x;
  const dy = ev.clientY - state.drag.y;
  if (!state.drag.armed && state.drag.mode === "move" && Math.hypot(dx, dy) < 6) return;
  state.drag.armed = true;
  if (Math.hypot(dx, dy) >= 6) state.dragged = true;
  const card = state.cards.find((c) => c.id === state.drag.id);
  if (!card) return;
  if (state.drag.mode === "move") {
    card.x = Math.max(8, state.drag.left + dx);
    card.y = Math.max(8, state.drag.top + dy);
  } else {
    card.w = Math.max(160, state.drag.w + dx);
    card.h = Math.max(100, state.drag.h + dy);
  }
  paintCard(card);
});

function endDrag() {
  if (state.drag) persist();
  state.drag = null;
  state.pan = null;
}

canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
scroller.addEventListener("pointerup", endDrag);

canvas.addEventListener("dblclick", (ev) => {
  if (state.dragged) return;
  if (ev.target.closest("[data-edit]") || ev.target.closest("[data-next]")) return;
  const card = cardFromEvent(ev.target);
  if (!card) return;
  if (card.kind === "note") {
    ev.target.closest(".note-text")?.focus();
    return;
  }
  openEdit(card);
});

$("house").addEventListener("click", () => openMarket("market"));
$("empty-open").addEventListener("click", () => openMarket("market"));
$("note-tool").addEventListener("click", () => place("note"));
$("market-close").addEventListener("click", closeMarket);
veil.addEventListener("click", (ev) => {
  if (ev.target === veil) closeMarket();
});

$("select").addEventListener("click", () => {
  state.tool = "select";
  $("select").classList.add("is-on");
  $("pan").classList.remove("is-on");
  canvas.classList.remove("is-pan");
});
$("pan").addEventListener("click", () => {
  state.tool = "pan";
  $("pan").classList.add("is-on");
  $("select").classList.remove("is-on");
  canvas.classList.add("is-pan");
});

document.querySelectorAll("[data-nav]").forEach((btn) => {
  btn.addEventListener("click", () => openMarket(btn.dataset.nav));
});

marketBody.addEventListener("click", (ev) => {
  const offer = ev.target.closest(".offer");
  if (!offer) return;
  place(offer.dataset.kind);
});

$("edit-cancel").addEventListener("click", () => {
  state.editing = null;
  editDlg.close();
});
$("edit-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  saveEdit();
  editDlg.close();
});

editBody.addEventListener("click", (ev) => {
  if (ev.target.classList.contains("combo-chev")) {
    const combo = ev.target.closest(".combo");
    const list = combo.querySelector(".combo-list");
    if (list.hidden) openCombo(combo, "");
    else closeCombos();
    return;
  }
  const opt = ev.target.closest(".combo-list li[data-val]");
  if (opt) {
    pickCombo(opt.closest(".combo"), opt.dataset.val);
    return;
  }
  if (ev.target.dataset.addRow != null || ev.target.classList.contains("add-row") || ev.target.id === "add-field") {
    const grid = ev.target.closest("div")?.querySelector?.("tbody") || editBody.querySelector("tbody");
    const vendor = ev.target.closest("[data-vendor]") || ev.target.previousElementSibling;
    const pack = VENDORS[(vendor && vendor.dataset.vendor) || "schema"];
    const tbody = ev.target.closest(".split")?.querySelector("tbody") || editBody.querySelector("tbody");
    tbody.insertAdjacentHTML("beforeend", gridRow({ name: "", type: pack.types[0], def: "", fns: "" }));
    if (editingCard() && isSchema(editingCard().kind)) syncSchemaFromFields();
    else {
      const slot = ev.target.closest(".block");
      if (slot) syncTypeSlot(slot.dataset.slot, slot.dataset.slot === "input" ? "Input" : "Output");
    }
  }
  if (ev.target.classList.contains("add-type")) {
    const tbody = ev.target.closest("div").querySelector("tbody");
    tbody.insertAdjacentHTML("beforeend", gridRow({ name: "", type: "string", def: "", fns: "" }));
    const slot = ev.target.closest(".block").dataset.slot;
    syncTypeSlot(slot, slot === "input" ? "Input" : "Output");
  }
  if (ev.target.id === "add-fx") {
    $("fx-list").insertAdjacentHTML("beforeend", effectRow({ kind: "log", target: "" }));
    syncEffectsFromRows();
  }
  if (ev.target.classList.contains("drop-field")) {
    ev.target.closest("tr").remove();
    if (editingCard() && isSchema(editingCard().kind)) syncSchemaFromFields();
    else {
      const slot = ev.target.closest(".block");
      if (slot) syncTypeSlot(slot.dataset.slot, slot.dataset.slot === "input" ? "Input" : "Output");
    }
  }
  if (ev.target.classList.contains("drop-fx")) {
    ev.target.closest(".row").remove();
    syncEffectsFromRows();
  }
  if (ev.target.classList.contains("up") || ev.target.classList.contains("down")) {
    const row = ev.target.closest(".row");
    const sibling = ev.target.classList.contains("up") ? row.previousElementSibling : row.nextElementSibling;
    if (sibling) {
      if (ev.target.classList.contains("up")) row.parentNode.insertBefore(row, sibling);
      else row.parentNode.insertBefore(sibling, row);
      syncEffectsFromRows();
    }
  }
});

editBody.addEventListener("input", (ev) => {
  const t = ev.target;
  if (t.dataset.combo) {
    const combo = t.closest(".combo");
    if (combo) openCombo(combo, t.value);
  }
  if (t.name === "source") {
    syncSchemaFromSource();
    return;
  }
  if (t.name === "fname" || t.name === "ftype" || t.name === "fdef" || t.name === "ffns" || t.name === "title") {
    if (editingCard() && isSchema(editingCard().kind)) syncSchemaFromFields();
    const slot = t.closest(".block");
    if (slot && (slot.dataset.slot === "input" || slot.dataset.slot === "output")) {
      syncTypeSlot(slot.dataset.slot, slot.dataset.slot === "input" ? "Input" : "Output");
    }
  }
  if (t.name === "inputSrc") syncTypeFromSource("input");
  if (t.name === "outputSrc") syncTypeFromSource("output");
  if (t.name === "ekind" || t.name === "etarget") syncEffectsFromRows();
  if (t.name === "effectsSrc") syncEffectsFromSource();
});

editBody.addEventListener("keydown", (ev) => {
  const combo = ev.target.closest(".combo");
  if (!combo) return;
  const list = combo.querySelector(".combo-list");
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (list.hidden) openCombo(combo, combo.querySelector("input").value);
    else moveCombo(list, 1);
  }
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (!list.hidden) moveCombo(list, -1);
  }
  if (ev.key === "Enter" && !list.hidden) {
    const on = list.querySelector("li.is-on[data-val]");
    if (on) {
      ev.preventDefault();
      pickCombo(combo, on.dataset.val);
    }
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    closeCombos();
  }
});

document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".combo")) closeCombos();
});

function renderBoardChrome() {
  const b = currentBoard();
  $("board-name").textContent = b.name;
  $("invite-link").href = "#/invite/" + b.id;
}

function renderBoardList() {
  $("board-list").innerHTML = store.boards.map((b) => `
    <li>
      <a href="#/" data-open="${b.id}">${esc(b.name)}</a>
      <span class="role">${b.cards.length} cards</span>
      <a href="#/invite/${b.id}">Invite</a>
    </li>
  `).join("");
}

function renderGrants(id) {
  const b = store.boards.find((x) => x.id === id) || currentBoard();
  $("invite-title").textContent = "Invite · " + b.name;
  $("invite-back").href = "#/";
  $("grant-list").innerHTML = b.grants.map((g) => `
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
  $("screen-boards").hidden = !boards;
  $("screen-invite").hidden = !invite;
  document.body.classList.toggle("is-page", boards || invite);
  showEmpty();
  if (boards) renderBoardList();
  if (invite) renderGrants(inviteId || currentBoard().id);
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
        renderCards();
        renderBoardChrome();
      }
    }
    showView("invite", inv[1]);
    return;
  }
  showView("canvas");
}

$("board-list").addEventListener("click", (ev) => {
  const open = ev.target.closest("[data-open]");
  if (!open) return;
  ev.preventDefault();
  const b = store.boards.find((x) => x.id === open.dataset.open);
  if (!b) return;
  flushBoard();
  hydrateBoard(b);
  persist();
  renderCards();
  renderBoardChrome();
  location.hash = "#/";
});

$("new-board").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const name = new FormData(ev.target).get("name").toString().trim();
  if (!name) return;
  flushBoard();
  const b = emptyBoard(name);
  store.boards.push(b);
  hydrateBoard(b);
  persist();
  renderCards();
  renderBoardChrome();
  ev.target.reset();
  location.hash = "#/";
});

$("grant-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const handle = new FormData(ev.target).get("handle").toString().trim().toLowerCase();
  const err = $("grant-err");
  err.hidden = true;
  if (!handle) return;
  const b = currentBoard();
  if (b.grants.some((g) => g.handle === handle)) {
    err.hidden = false;
    err.textContent = "Already on this board.";
    return;
  }
  b.grants.push({ id: uid(), handle, role: "granted" });
  persist();
  ev.target.reset();
  renderGrants(b.id);
});

$("grant-list").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-revoke]");
  if (!btn) return;
  const b = currentBoard();
  b.grants = b.grants.filter((g) => g.id !== btn.dataset.revoke);
  persist();
  renderGrants(b.id);
});

window.addEventListener("hashchange", route);

window.addEventListener("keydown", (ev) => {
  const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
  if (ev.key === "Escape") {
    if (editDlg.open) {
      state.editing = null;
      editDlg.close();
    } else closeMarket();
    return;
  }
  if (typing) return;
  if (ev.key === "h" || ev.key === "H") openMarket("market");
  if (ev.key === "v" || ev.key === "V") $("select").click();
  if (ev.key === "n" || ev.key === "N") place("note");
  if (ev.key === " " && !editDlg.open) {
    ev.preventDefault();
    $("pan").click();
  }
  if (ev.key === "e" || ev.key === "E") {
    const card = selected();
    if (card) openEdit(card);
  }
  if (ev.key === "Backspace" || ev.key === "Delete") removeSel();
});

renderCatalog();
renderBoardChrome();
renderCards();
route();
