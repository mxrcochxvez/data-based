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

const ACTION_KINDS = ["db.read", "db.write", "http", "log", "queue", "throw", "assign", "call"];
const GATE_WORDS = new Set(["if", "else", "match", "when"]);

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
  effects: {
    lang: "effects",
    kinds: ACTION_KINDS,
    types: ACTION_KINDS,
    defaults: [""],
    fns: [""],
  },
};

const PIPE_NEXT = { schema: "repo", drizzle: "repo", prisma: "repo", repo: "logic", logic: "ctrl" };
const PIPE_LABEL = { repo: "Add repository", logic: "Add effects", ctrl: "Add controller" };
const PIPE_SUFFIX = { repo: "Repo", logic: "Effect", ctrl: "Controller" };

function flow() {
  return window.DataBasedFlow || null;
}

const $ = (id) => document.getElementById(id);

function announceGrant(msg) {
  const live = $("grant-live");
  if (!live) return;
  live.textContent = "";
  live.textContent = msg;
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

function markCardSel(el, on) {
  el.classList.toggle("is-sel", on);
  el.setAttribute("aria-selected", on ? "true" : "false");
}
const canvas = $("canvas");
const scroller = $("scroller");
const empty = $("empty");
const veil = $("veil");
const market = $("market");
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
  edges: [],
  sel: new Set(),
  nextId: 1,
  drag: null,
  pan: null,
  placeAt: { x: 88, y: 200 },
  camera: { pan: { x: 0, y: 0 }, zoom: 1 },
  dragged: false,
  editing: null,
};

const KEY = (window.Persist && window.Persist.KEY) || "databased.v1";

function uid() {
  return Math.random().toString(36).slice(2, 10);
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
  };
}

function loadStore() {
  const fromPersist = window.Persist && typeof window.Persist.readSync === "function"
    ? window.Persist.readSync()
    : null;
  const raw = fromPersist || (function () {
    try {
      return JSON.parse(localStorage.getItem("databased.v1") || localStorage.getItem(KEY) || "");
    } catch (_) {
      return null;
    }
  })();
  if (raw && Array.isArray(raw.boards) && raw.boards.length) {
    raw.boards.forEach((b) => {
      b.grants = b.grants && b.grants.length ? b.grants : [{ id: "owner", handle: "you", role: "owner" }];
    });
    if (raw.updatedAt == null) raw.updatedAt = 0;
    return raw;
  }
  const b = emptyBoard("Board");
  return { boards: [b], currentId: b.id, updatedAt: Date.now() };
}

const store = (window.Boards && window.Boards.store) || loadStore();

function currentBoard() {
  return store.boards.find((b) => b.id === store.currentId) || store.boards[0];
}

function normalizeCard(c) {
  if (window.Persist && typeof window.Persist.layoutCard === "function") {
    window.Persist.layoutCard(c);
  } else {
    const x = Number(c.x != null ? c.x : c.left);
    const y = Number(c.y != null ? c.y : c.top);
    const w = Number(c.w != null ? c.w : c.width);
    const h = Number(c.h != null ? c.h : c.height);
    c.x = Number.isFinite(x) ? x : 88;
    c.y = Number.isFinite(y) ? y : 200;
    c.w = Number.isFinite(w) ? w : (c.kind === "note" ? 200 : c.kind === "logic" ? 280 : 248);
    c.h = Number.isFinite(h) ? h : (c.kind === "note" ? 160 : 164);
    c.left = c.x;
    c.top = c.y;
    c.width = c.w;
    c.height = c.h;
  }
  c.next = c.next || null;
  c.prev = c.prev || null;
  c.links = Array.isArray(c.links) ? c.links : (c.next != null ? [c.next] : []);
  if (isSchema(c.kind) && c.body && c.body.fields) {
    c.body.fields = hydrateFields(c.kind, c.body.fields);
  }
  if (c.kind === "note" && c.body && c.body.note == null) c.body.note = "";
  if (c.kind === "logic" && c.body) {
    c.body.effects = normalizeFxList(c.body.effects);
    if (c.body.effectsSrc == null) c.body.effectsSrc = effectsText(c.body.effects);
  }
  return c;
}

function hydrateBoard(b) {
  store.currentId = b.id;
  state.cards = (b.cards || []).map(normalizeCard);
  state.nextId = b.nextId || 1;
  state.placeAt = b.placeAt || { x: 88, y: 200 };
  state.camera = (window.Camera && window.Camera.normalize)
    ? window.Camera.normalize(b.camera)
    : { pan: { x: (b.camera && b.camera.pan && b.camera.pan.x) || 0, y: (b.camera && b.camera.pan && b.camera.pan.y) || 0 }, zoom: (b.camera && b.camera.zoom) || 1 };
  state.sel = new Set();
  state.editing = null;
  if (window.Camera && typeof window.Camera.hydrate === "function") window.Camera.hydrate(b);
  if (flow() && typeof flow().hydrateFromBoard === "function") flow().hydrateFromBoard(b);
  else state.edges = Array.isArray(b.edges) ? b.edges.slice() : [];
}

function flushBoard() {
  const b = currentBoard();
  if (!b) return;
  if (window.Persist && typeof window.Persist.layoutCard === "function") {
    state.cards.forEach((c) => window.Persist.layoutCard(c));
  }
  b.cards = state.cards;
  b.nextId = state.nextId;
  b.placeAt = state.placeAt;
  if (window.Camera && typeof window.Camera.flush === "function") window.Camera.flush(b);
  else if (state.camera) b.camera = { pan: { x: state.camera.pan.x, y: state.camera.pan.y }, zoom: state.camera.zoom };
  if (flow() && typeof flow().flushToBoard === "function") flow().flushToBoard(b);
  else b.edges = Array.isArray(state.edges) ? state.edges : [];
}

function persistDoc() {
  flushBoard();
  store.updatedAt = Date.now();
  const doc = { boards: store.boards, currentId: store.currentId, updatedAt: store.updatedAt };
  return window.Persist && typeof window.Persist.snapshotDoc === "function"
    ? window.Persist.snapshotDoc(doc)
    : doc;
}

function persist() {
  if (window.Persist && typeof window.Persist.schedule === "function") {
    window.Persist.schedule(persistDoc);
    return;
  }
  try {
    localStorage.setItem("databased.v1", JSON.stringify(persistDoc()));
  } catch (_) {}
  try {
    if (window.DataBasedSync && typeof window.DataBasedSync.kick === "function") {
      window.DataBasedSync.kick();
    }
  } catch (_) {}
  const hook = (window.DB && window.DB.persistHook) || window.persistBoard;
  if (typeof hook === "function") hook();
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

function normalizeFxNode(n) {
  if (!n || typeof n !== "object") return { type: "action", kind: "log", target: "" };
  if (n.type === "if") {
    return {
      type: "if",
      cond: n.cond || "",
      then: normalizeFxList(n.then),
      else: normalizeFxList(n.else),
    };
  }
  if (n.type === "match") {
    const arms = Array.isArray(n.arms) && n.arms.length ? n.arms : [{ when: "", body: [] }];
    return {
      type: "match",
      field: n.field || "",
      arms: arms.map((a) => ({ when: (a && a.when) || "", body: normalizeFxList(a && a.body) })),
    };
  }
  return { type: "action", kind: n.kind || "log", target: n.target || "" };
}

function normalizeFxList(list) {
  return Array.isArray(list) ? list.map(normalizeFxNode) : [];
}

function effectsText(nodes, depth) {
  const pad = "  ".repeat(depth || 0);
  return normalizeFxList(nodes).map((n) => {
    if (n.type === "if") {
      let out = `${pad}if ${n.cond}`.trimEnd();
      if (n.then.length) out += "\n" + effectsText(n.then, (depth || 0) + 1);
      if (n.else.length) {
        out += `\n${pad}else`;
        out += "\n" + effectsText(n.else, (depth || 0) + 1);
      }
      return out;
    }
    if (n.type === "match") {
      let out = `${pad}match ${n.field}`.trimEnd();
      for (const arm of n.arms) {
        out += `\n${pad}  when ${arm.when}`.trimEnd();
        if (arm.body.length) out += "\n" + effectsText(arm.body, (depth || 0) + 2);
      }
      return out;
    }
    return `${pad}${n.kind} ${n.target || ""}`.trimEnd();
  }).join("\n");
}

function parseFxLines(text) {
  const lines = [];
  for (const raw of String(text || "").split("\n")) {
    const cut = raw.replace(/\t/g, "  ");
    if (!cut.trim() || cut.trim().startsWith("#")) continue;
    const pad = cut.match(/^ */)[0].length;
    lines.push({ level: Math.round(pad / 2), text: cut.trim() });
  }
  const parsed = parseFxSeq(lines, 0, 0);
  if (!parsed.ok) return parsed;
  if (parsed.i !== lines.length) return { ok: false, error: "Unexpected indent." };
  return { ok: true, rows: parsed.nodes };
}

function parseFxSeq(lines, i, level) {
  const nodes = [];
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.level < level) break;
    if (ln.level > level) return { ok: false, error: "Unexpected indent." };
    if (ln.text === "else" || ln.text.startsWith("when ")) break;
    if (ln.text.startsWith("if ")) {
      const thenR = parseFxSeq(lines, i + 1, level + 1);
      if (!thenR.ok) return thenR;
      i = thenR.i;
      let els = [];
      if (i < lines.length && lines[i].level === level && lines[i].text === "else") {
        const elseR = parseFxSeq(lines, i + 1, level + 1);
        if (!elseR.ok) return elseR;
        els = elseR.nodes;
        i = elseR.i;
      }
      nodes.push({ type: "if", cond: ln.text.slice(3).trim(), then: thenR.nodes, else: els });
      continue;
    }
    if (ln.text.startsWith("match ")) {
      i += 1;
      const arms = [];
      while (i < lines.length && lines[i].level === level + 1 && lines[i].text.startsWith("when ")) {
        const when = lines[i].text.slice(5).trim();
        const bodyR = parseFxSeq(lines, i + 1, level + 2);
        if (!bodyR.ok) return bodyR;
        arms.push({ when, body: bodyR.nodes });
        i = bodyR.i;
      }
      if (!arms.length) return { ok: false, error: "match needs a when arm." };
      nodes.push({ type: "match", field: ln.text.slice(6).trim(), arms });
      continue;
    }
    const bits = ln.text.split(/\s+/);
    const kind = bits[0];
    if (GATE_WORDS.has(kind) || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(kind)) {
      return { ok: false, error: `Unknown action “${kind}”.` };
    }
    nodes.push({ type: "action", kind, target: bits.slice(1).join(" ") });
    i += 1;
  }
  return { ok: true, nodes, i };
}

function parseEffects(text) {
  return parseFxLines(text);
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
    const effects = [
      {
        type: "if",
        cond: "email",
        then: [
          { type: "action", kind: "db.write", target: "users" },
          { type: "action", kind: "http", target: "POST /invite" },
        ],
        else: [{ type: "action", kind: "throw", target: "missing email" }],
      },
    ];
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
    return `<ul>${previewFx(card.body.effects).map((line) => `<li><code>${esc(line)}</code></li>`).join("")}</ul>`;
  }
  return `<p>${esc(card.body.note)}</p>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function previewFx(nodes) {
  const out = [];
  function walk(list) {
    for (const n of normalizeFxList(list)) {
      if (n.type === "if") {
        out.push(`if ${n.cond}`);
        walk(n.then);
        if (n.else.length) {
          out.push("else");
          walk(n.else);
        }
      } else if (n.type === "match") {
        out.push(`match ${n.field}`);
        for (const arm of n.arms) {
          out.push(`when ${arm.when}`);
          walk(arm.body);
        }
      } else {
        out.push(`${n.kind} ${n.target || ""}`.trim());
      }
    }
  }
  walk(nodes);
  return out.slice(0, 8);
}

function comboCell(name, value, list) {
  const labels = { types: "Type", defaults: "Default", fns: "Functions", kinds: "Action" };
  return `
    <div class="combo">
      <input type="text" name="${name}" value="${esc(value || "")}" data-combo="${list}" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="combo-pop" aria-haspopup="listbox" aria-label="${labels[list] || name}">
      <button type="button" class="combo-chev" tabindex="-1" aria-label="Options">▾</button>
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
    <div class="sheet-table grid" data-vendor="${vendor}">
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
    <div class="code-pane code" data-lang="${lang}">
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
    <section class="market-sec" id="sec-${sec.id}">
      <h3>${esc(sec.heading)}</h3>
      <ul class="market-list">
        ${sec.items.map((it) => `
          <li>
            <button type="button" class="offer" data-kind="${it.kind}">
              <span class="offer-name">${esc(it.name)}</span>
              <span class="offer-blurb">${esc(it.blurb)}</span>
              <span class="offer-vendor">${esc(it.vendor)}</span>
            </button>
          </li>
        `).join("")}
      </ul>
    </section>
  `).join("");
}

function hideTip() {
  const tip = $("tip");
  if (tip) tip.hidden = true;
}

function setMarketOpen(on) {
  veil.hidden = !on;
  veil.classList.toggle("hidden", !on);
  document.querySelectorAll("[aria-controls='market']").forEach((el) => {
    el.setAttribute("aria-expanded", on ? "true" : "false");
  });
  const house = $("house");
  if (house) house.setAttribute("aria-pressed", on ? "true" : "false");
  document.body.classList.toggle("is-market", on);
  hideTip();
}

function openMarket(section) {
  setMarketOpen(true);
  if (section && section !== "market" && section !== "canvas") {
    const node = document.getElementById(`sec-${section}`);
    if (node) node.scrollIntoView({ block: "start" });
  }
  const first = marketBody.querySelector(".offer");
  if (first) first.focus();
  else if (market) market.focus();
}

function closeMarket() {
  const wasOpen = veil && !veil.hidden;
  setMarketOpen(false);
  if (wasOpen) $("house")?.focus();
}

function nextKindFor(kind) {
  const f = flow();
  if (f && f.nextKindFor) return f.nextKindFor(kind);
  return PIPE_NEXT[kind] || null;
}

function cardNode(card) {
  const el = document.createElement("article");
  el.className = "card" + (state.sel.has(card.id) ? " is-sel" : "") + (card.kind === "note" ? " note" : "");
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.style.zIndex = String(card.z || 1);
  el.dataset.id = String(card.id);
  el.tabIndex = 0;
  el.setAttribute("aria-label", `${KIND[card.kind].label} ${card.body.title}`);
  el.setAttribute("aria-selected", state.sel.has(card.id) ? "true" : "false");
  const f = flow();
  const nextBtn = f && f.nextControl
    ? f.nextControl(card)
    : (nextKindFor(card.kind)
      ? `<button type="button" class="card-next" data-next="${card.id}" aria-label="${esc(PIPE_LABEL[nextKindFor(card.kind)])}">+</button>`
      : "");
  if (card.kind === "note") {
    if (f && f.fillNote) f.fillNote(el, card);
    else {
      el.innerHTML = `
        <div class="card-bar"><span class="card-kind">Note</span></div>
        <textarea class="note-text" data-note="${card.id}" placeholder="Write a note">${esc(card.body.note || "")}</textarea>
        <span class="handle se" data-handle="se" aria-hidden="true"></span>
      `;
    }
  } else {
    el.innerHTML = `
      <div class="card-bar">
        <span class="card-kind">${esc(KIND[card.kind].label)}</span>
        <span class="card-title">${esc(card.body.title)}</span>
        <button type="button" class="card-edit" data-edit="${card.id}">Edit</button>
      </div>
      <div class="card-body">${preview(card)}</div>
      ${nextBtn}
      <span class="handle se" data-handle="se" aria-hidden="true"></span>
    `;
  }
  if (f && f.decorate) f.decorate(el, card);
  return el;
}

function drawWires() {
  const f = flow();
  if (f && f.drawWires) {
    f.drawWires(wires, state.cards);
    return;
  }
  if (!wires) return;
  const parts = ['<defs><marker id="arrow" viewBox="0 0 10 7" refX="9" refY="3.5" markerWidth="8" markerHeight="6" orient="auto"><path d="M0 0L10 3.5L0 7Z" fill="#111"/></marker></defs>'];
  const seen = new Set();
  const bag = [];
  function addEdge(from, to) {
    if (from == null || to == null || String(from) === String(to)) return;
    const key = String(from) + ">" + String(to);
    if (seen.has(key)) return;
    seen.add(key);
    bag.push({ from, to });
  }
  (state.edges || []).forEach((e) => addEdge(e.from, e.to));
  for (const card of state.cards) {
    if (card.next != null) addEdge(card.id, card.next);
    (card.links || []).forEach((to) => addEdge(card.id, to));
  }
  for (const edge of bag) {
    const from = state.cards.find((c) => String(c.id) === String(edge.from));
    const to = state.cards.find((c) => String(c.id) === String(edge.to));
    if (!from || !to) continue;
    const x1 = from.x + from.w;
    const y1 = from.y + from.h / 2;
    const x2 = to.x;
    const y2 = to.y + to.h / 2;
    const mid = x1 + Math.max(40, (x2 - x1) / 2);
    parts.push(`<path class="wire" marker-end="url(#arrow)" d="M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}"/>`);
  }
  wires.innerHTML = parts.join("");
}

function showEmpty() {
  const f = flow();
  if (f && f.syncEmpty) {
    f.syncEmpty(empty, state.cards);
    return;
  }
  const on = state.cards.length === 0 && !document.body.classList.contains("is-page");
  empty.hidden = !on;
}

function renderCards() {
  showEmpty();
  canvas.querySelectorAll(".card").forEach((n) => n.remove());
  for (const card of state.cards) canvas.appendChild(cardNode(card));
  drawWires();
}

function paintCard(card) {
  const el = canvas.querySelector(`.card[data-id="${card.id}"]`);
  if (!el) return;
  el.style.left = card.x + "px";
  el.style.top = card.y + "px";
  el.style.width = card.w + "px";
  el.style.height = card.h + "px";
  el.style.zIndex = String(card.z || 1);
  el.classList.toggle("is-sel", state.sel.has(card.id));
  el.setAttribute("aria-selected", state.sel.has(card.id) ? "true" : "false");
  drawWires();
}

function selected() {
  return state.cards.find((c) => state.sel.has(c.id)) || null;
}

function selectedList() {
  return state.cards.filter((c) => state.sel.has(c.id));
}

function paintSel() {
  canvas.querySelectorAll(".card").forEach((n) => {
    markCardSel(n, state.sel.has(Number(n.dataset.id)));
  });
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
    z: (state.cards.reduce((m, c) => Math.max(m, c.z || 1), 1) + 1),
  };
  if (o.x == null && kind !== "note") {
    state.placeAt.x += 32;
    state.placeAt.y += 24;
  }
  state.cards.push(card);
  if (o.prev) {
    if (flow() && typeof flow().link === "function") flow().link(o.prev, card.id, true);
    else {
      const parent = state.cards.find((c) => c.id === o.prev);
      if (parent) {
        parent.links = (parent.links || []).concat(card.id);
        parent.next = parent.links[parent.links.length - 1];
      }
      state.edges = (state.edges || []).concat({ from: o.prev, to: card.id });
    }
  }
  state.sel = new Set([card.id]);
  closeMarket();
  renderCards();
  persist();
  return card;
}

function addLayer(from) {
  const f = flow();
  if (f && f.addLayer) {
    f.addLayer(from, { place, stemName, state });
    return;
  }
  const next = nextKindFor(from.kind);
  if (!next) return;
  const already = (state.edges || []).filter((e) => String(e.from) === String(from.id)).length;
  place(next, {
    title: stemName(from.body.title) + PIPE_SUFFIX[next],
    x: from.x + from.w + 72,
    y: from.y + already * 36,
    prev: from.id,
  });
}

function removeSel() {
  if (!state.sel.size) return;
  const ids = state.sel;
  for (const c of state.cards) {
    if (ids.has(c.next)) c.next = null;
    if (ids.has(c.prev)) c.prev = null;
    if (c.links) c.links = c.links.filter((id) => !ids.has(id));
  }
  state.cards = state.cards.filter((c) => !ids.has(c.id));
  state.edges = (state.edges || []).filter((e) => !ids.has(e.from) && !ids.has(e.to));
  state.sel = new Set();
  renderCards();
  persist();
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

function fxTools() {
  return `
    <div class="fx-tools">
      <button type="button" class="btn ghost add-fx-action" aria-label="Add action">+</button>
      <button type="button" class="text-btn add-fx-gate" data-gate="if">If</button>
      <button type="button" class="text-btn add-fx-gate" data-gate="match">Match</button>
    </div>
  `;
}

function fxAction(row) {
  return `
    <div class="fx-node row effect" data-kind="action">
      ${comboCell("ekind", row.kind || "log", "kinds")}
      <input type="text" name="etarget" value="${esc(row.target || "")}" placeholder="table, url, name, or message" aria-label="Action target">
      <button type="button" class="move up" aria-label="Move up">↑</button>
      <button type="button" class="move down" aria-label="Move down">↓</button>
      <button type="button" class="icon-x drop-fx" aria-label="Remove action">×</button>
    </div>
  `;
}

function fxArm(arm) {
  return `
    <div class="fx-branch" data-arm="when">
      <div class="fx-arm">
        <span>When</span>
        <input type="text" name="fwhen" value="${esc(arm.when || "")}" placeholder="value" aria-label="Match value">
        <button type="button" class="icon-x drop-fx-arm" aria-label="Remove arm">×</button>
      </div>
      <div class="fx-kids">${normalizeFxList(arm.body).map(fxNode).join("")}</div>
      ${fxTools()}
    </div>
  `;
}

function fxIf(node) {
  return `
    <div class="fx-node fx-gate" data-kind="if">
      <div class="row effect fx-head">
        <span class="fx-kw">If</span>
        <input type="text" name="fcond" value="${esc(node.cond || "")}" placeholder="email && invited" aria-label="If condition">
        <button type="button" class="move up" aria-label="Move up">↑</button>
        <button type="button" class="move down" aria-label="Move down">↓</button>
        <button type="button" class="icon-x drop-fx" aria-label="Remove gate">×</button>
      </div>
      <div class="fx-branch" data-arm="then">
        <div class="fx-arm">Then</div>
        <div class="fx-kids">${normalizeFxList(node.then).map(fxNode).join("")}</div>
        ${fxTools()}
      </div>
      <div class="fx-branch" data-arm="else">
        <div class="fx-arm">Else</div>
        <div class="fx-kids">${normalizeFxList(node.else).map(fxNode).join("")}</div>
        ${fxTools()}
      </div>
    </div>
  `;
}

function fxMatch(node) {
  const arms = node.arms && node.arms.length ? node.arms : [{ when: "", body: [] }];
  return `
    <div class="fx-node fx-gate" data-kind="match">
      <div class="row effect fx-head">
        <span class="fx-kw">Match</span>
        <input type="text" name="ffield" value="${esc(node.field || "")}" placeholder="field" aria-label="Match field">
        <button type="button" class="move up" aria-label="Move up">↑</button>
        <button type="button" class="move down" aria-label="Move down">↓</button>
        <button type="button" class="icon-x drop-fx" aria-label="Remove gate">×</button>
      </div>
      ${arms.map(fxArm).join("")}
      <button type="button" class="text-btn add-fx-arm">+ arm</button>
    </div>
  `;
}

function fxNode(node) {
  const n = normalizeFxNode(node);
  if (n.type === "if") return fxIf(n);
  if (n.type === "match") return fxMatch(n);
  return fxAction(n);
}

function fxTree(nodes) {
  return `
    <div class="fx-root" data-vendor="effects">
      <div class="fx-kids" id="fx-tree">${normalizeFxList(nodes).map(fxNode).join("")}</div>
      ${fxTools()}
    </div>
  `;
}

function readFxKids(el) {
  if (!el) return [];
  return [...el.children].filter((n) => n.classList.contains("fx-node")).map(readFxNode);
}

function readFxNode(node) {
  const kind = node.dataset.kind;
  if (kind === "if") {
    return {
      type: "if",
      cond: node.querySelector(':scope > .fx-head [name="fcond"]')?.value || "",
      then: readFxKids(node.querySelector(':scope > [data-arm="then"] > .fx-kids')),
      else: readFxKids(node.querySelector(':scope > [data-arm="else"] > .fx-kids')),
    };
  }
  if (kind === "match") {
    return {
      type: "match",
      field: node.querySelector(':scope > .fx-head [name="ffield"]')?.value || "",
      arms: [...node.querySelectorAll(':scope > [data-arm="when"]')].map((arm) => ({
        when: arm.querySelector('[name="fwhen"]')?.value || "",
        body: readFxKids(arm.querySelector(":scope > .fx-kids")),
      })),
    };
  }
  return {
    type: "action",
    kind: node.querySelector('[name="ekind"]')?.value || "log",
    target: node.querySelector('[name="etarget"]')?.value || "",
  };
}

function readEffects(box) {
  return readFxKids((box && box.querySelector("#fx-tree")) || $("fx-tree"));
}

function fxKidsFor(btn) {
  const branch = btn.closest(".fx-branch");
  if (branch) return branch.querySelector(":scope > .fx-kids");
  return $("fx-tree");
}

function setErr(msg) {
  parseErr.hidden = !msg;
  parseErr.textContent = msg || "";
}

function openEdit(card) {
  if (card.kind === "note") {
    const f = flow();
    if (f && f.startNoteEdit) f.startNoteEdit(card);
    else {
      const ta = canvas.querySelector(`[data-note="${card.id}"]`);
      if (ta) ta.focus();
    }
    return;
  }
  state.editing = card.id;
  state.sel = new Set([card.id]);
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
          <div>${fxTree(card.body.effects)}</div>
          <label class="field"><span>Effects source</span>${codeBox("effectsSrc", "effects", card.body.effectsSrc || effectsText(card.body.effects))}</label>
        </div>
      </section>
    `;
  } else {
    editBody.innerHTML = `
      <label class="field"><span>Name</span><input type="text" name="title" value="${esc(card.body.title)}"></label>
      <label class="field"><span>Notes</span><textarea name="note">${esc(card.body.note)}</textarea></label>
    `;
  }
  document.body.classList.add("is-modal");
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
  const list = $("fx-tree");
  if (!list || (document.activeElement && list.closest(".fx-root")?.contains(document.activeElement))) return;
  list.innerHTML = normalizeFxList(parsed.rows).map(fxNode).join("");
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
    if (pfx.ok) card.body.effects = pfx.rows;
    else {
      card.body.effects = readEffects(fxBox);
      card.body.effectsSrc = effectsText(card.body.effects);
    }
  } else if (card.kind !== "note") {
    const note = editBody.querySelector('[name="note"]');
    if (note) card.body.note = note.value || "";
  }
  state.editing = null;
  renderCards();
  persist();
}

function cardFromEvent(t) {
  const node = t.closest(".card");
  if (!node) return null;
  return state.cards.find((c) => String(c.id) === node.dataset.id) || null;
}

const comboPop = $("combo-pop");
let comboOpen = null;

function comboOpts(input) {
  const vendor = input.closest("[data-vendor]")?.dataset.vendor || "schema";
  const pack = VENDORS[vendor] || VENDORS.schema;
  return pack[input.dataset.combo] || [];
}

function viewBox() {
  const vv = window.visualViewport;
  if (!vv) return { left: 0, top: 0, width: innerWidth, height: innerHeight };
  return { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height };
}

function placeComboPop(combo) {
  if (!comboPop || !combo) return;
  const r = combo.getBoundingClientRect();
  const view = viewBox();
  const pad = 8;
  const width = Math.min(r.width, Math.max(120, view.width - pad * 2));
  comboPop.style.width = width + "px";
  comboPop.hidden = false;
  const roomBelow = view.top + view.height - r.bottom - pad;
  const roomAbove = r.top - view.top - pad;
  const maxH = Math.max(72, Math.min(180, Math.max(roomBelow, roomAbove)));
  comboPop.style.maxHeight = maxH + "px";
  const h = Math.min(maxH, comboPop.offsetHeight || maxH);
  let top = r.bottom - 1;
  if (top + h > view.top + view.height - pad) top = Math.max(view.top + pad, r.top - h + 1);
  let left = r.left;
  if (left + width > view.left + view.width - pad) left = view.left + view.width - width - pad;
  if (left < view.left + pad) left = view.left + pad;
  comboPop.style.top = top + "px";
  comboPop.style.left = left + "px";
}

function closeCombos() {
  if (comboOpen) {
    const input = comboOpen.querySelector("input");
    if (input) {
      input.setAttribute("aria-expanded", "false");
      input.removeAttribute("aria-activedescendant");
    }
  }
  comboOpen = null;
  if (!comboPop) return;
  comboPop.hidden = true;
  comboPop.innerHTML = "";
}

function syncComboActive(input) {
  if (!comboPop || !input) return;
  const on = comboPop.querySelector("li.is-on[data-val]");
  comboPop.querySelectorAll('[role="option"]').forEach((el) => {
    el.setAttribute("aria-selected", el === on ? "true" : "false");
  });
  if (on) {
    if (!on.id) on.id = "combo-opt-" + [...comboPop.children].indexOf(on);
    input.setAttribute("aria-activedescendant", on.id);
  } else input.removeAttribute("aria-activedescendant");
}

function openCombo(combo, filter) {
  if (!comboPop) return;
  if (comboOpen && comboOpen !== combo) {
    const prev = comboOpen.querySelector("input");
    if (prev) {
      prev.setAttribute("aria-expanded", "false");
      prev.removeAttribute("aria-activedescendant");
    }
  }
  comboOpen = combo;
  const input = combo.querySelector("input");
  if (input) {
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", "combo-pop");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-expanded", "true");
  }
  const q = String(filter ?? input.value).toLowerCase();
  const opts = comboOpts(input);
  const shown = opts.filter((o) => !q || String(o).toLowerCase().includes(q));
  comboPop.innerHTML = shown.length
    ? shown.map((o, i) => `<li role="option" id="combo-opt-${i}" data-val="${esc(o)}" aria-selected="false">${esc(o || "(none)")}</li>`).join("")
    : `<li class="is-empty">Keep typing a custom value.</li>`;
  comboPop.querySelector("li[data-val]")?.classList.add("is-on");
  syncComboActive(input);
  placeComboPop(combo);
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
  if (comboOpen) syncComboActive(comboOpen.querySelector("input"));
}

canvas.addEventListener("click", (ev) => {
  const next = ev.target.closest("[data-next]");
  if (next) {
    if (flow() && typeof flow().addLayer === "function") return;
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

function setSelection(ids) {
  const set = new Set(ids || []);
  state.sel = set;
  state.sels = set;
  paintSel();
}

window.DB = {
  $,
  state,
  store,
  canvas,
  scroller,
  empty,
  wires,
  editDlg,
  persist,
  persistHook: null,
  persistDoc,
  flushBoard,
  hydrateBoard,
  currentBoard,
  setSelection,
  renderCards,
  paintCard,
  paintSel,
  selected,
  selectedList,
  cardFromEvent,
  openEdit,
  openMarket,
  closeMarket,
  place,
  removeSel,
  renderBoardChrome,
  showEmpty,
  stemName,
  esc,
  normalizeCard,
};

if (typeof window.attachCamera === "function") {
  window.attachCamera({
    canvas,
    scroller,
    state,
    persist,
    world: $("world"),
    label: $("zoom-pct"),
    blocked: () => editDlg.open || document.body.classList.contains("is-modal") || document.body.classList.contains("is-page") || document.body.classList.contains("is-market"),
  });
}

if (typeof window.attachSelect === "function") {
  window.DataBasedSelect = window.attachSelect({
    canvas,
    scroller,
    state,
    persist,
    cardFromEvent,
    paintCard,
    setSelection,
    marquee: $("marquee"),
    blocked: () => editDlg.open || document.body.classList.contains("is-modal") || document.body.classList.contains("is-page") || document.body.classList.contains("is-market"),
  });
}

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
  $("select").setAttribute("aria-pressed", "true");
  $("pan").classList.remove("is-on");
  $("pan").setAttribute("aria-pressed", "false");
  canvas.classList.remove("is-pan");
});
$("pan").addEventListener("click", () => {
  state.tool = "pan";
  $("pan").classList.add("is-on");
  $("pan").setAttribute("aria-pressed", "true");
  $("select").classList.remove("is-on");
  $("select").setAttribute("aria-pressed", "false");
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
    if (comboOpen === combo) closeCombos();
    else openCombo(combo, "");
    return;
  }
  if (ev.target.dataset.addRow != null || ev.target.classList.contains("add-row") || ev.target.id === "add-field") {
    const grid = ev.target.closest("div")?.querySelector?.("tbody") || editBody.querySelector("tbody");
    const vendor = ev.target.closest("[data-vendor]") || ev.target.previousElementSibling;
    const pack = VENDORS[(vendor && vendor.dataset.vendor) || "schema"];
    const tbody = ev.target.closest(".split")?.querySelector("tbody") || editBody.querySelector("tbody");
    const y = editBody.scrollTop;
    tbody.insertAdjacentHTML("beforeend", gridRow({ name: "", type: pack.types[0], def: "", fns: "" }));
    editBody.scrollTop = y;
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
  if (ev.target.classList.contains("add-fx-action")) {
    const y = editBody.scrollTop;
    fxKidsFor(ev.target).insertAdjacentHTML("beforeend", fxAction({ type: "action", kind: "log", target: "" }));
    editBody.scrollTop = y;
    syncEffectsFromRows();
    return;
  }
  if (ev.target.classList.contains("add-fx-gate")) {
    const y = editBody.scrollTop;
    const gate = ev.target.dataset.gate === "match"
      ? fxMatch({ type: "match", field: "", arms: [{ when: "", body: [] }] })
      : fxIf({ type: "if", cond: "", then: [], else: [] });
    fxKidsFor(ev.target).insertAdjacentHTML("beforeend", gate);
    editBody.scrollTop = y;
    syncEffectsFromRows();
    return;
  }
  if (ev.target.classList.contains("add-fx-arm")) {
    const y = editBody.scrollTop;
    ev.target.insertAdjacentHTML("beforebegin", fxArm({ when: "", body: [] }));
    editBody.scrollTop = y;
    syncEffectsFromRows();
    return;
  }
  if (ev.target.classList.contains("drop-fx-arm")) {
    const gate = ev.target.closest(".fx-gate");
    const arms = gate ? gate.querySelectorAll(':scope > [data-arm="when"]') : [];
    if (arms.length > 1) ev.target.closest(".fx-branch").remove();
    syncEffectsFromRows();
    return;
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
    ev.target.closest(".fx-node")?.remove();
    syncEffectsFromRows();
    return;
  }
  if (ev.target.classList.contains("up") || ev.target.classList.contains("down")) {
    const row = ev.target.closest(".fx-node") || ev.target.closest(".row");
    const sibling = ev.target.classList.contains("up") ? row.previousElementSibling : row.nextElementSibling;
    if (sibling && sibling.classList.contains("fx-node")) {
      if (ev.target.classList.contains("up")) row.parentNode.insertBefore(row, sibling);
      else row.parentNode.insertBefore(sibling, row);
      syncEffectsFromRows();
    }
    return;
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
  if (t.name === "ekind" || t.name === "etarget" || t.name === "fcond" || t.name === "ffield" || t.name === "fwhen") syncEffectsFromRows();
  if (t.name === "effectsSrc") syncEffectsFromSource();
});

editBody.addEventListener("keydown", (ev) => {
  const combo = ev.target.closest(".combo");
  if (!combo || !comboPop) return;
  if (ev.key === "ArrowDown") {
    ev.preventDefault();
    if (comboPop.hidden || comboOpen !== combo) openCombo(combo, combo.querySelector("input").value);
    else moveCombo(comboPop, 1);
  }
  if (ev.key === "ArrowUp") {
    ev.preventDefault();
    if (!comboPop.hidden) moveCombo(comboPop, -1);
  }
  if (ev.key === "Enter" && !comboPop.hidden && comboOpen === combo) {
    const on = comboPop.querySelector("li.is-on[data-val]");
    if (on) {
      ev.preventDefault();
      pickCombo(combo, on.dataset.val);
    }
  }
  if (ev.key === "Escape") {
    ev.preventDefault();
    ev.stopPropagation();
    closeCombos();
  }
});

editBody.addEventListener("scroll", () => {
  if (comboOpen) {
    const box = editBody.getBoundingClientRect();
    const r = comboOpen.getBoundingClientRect();
    if (r.bottom < box.top || r.top > box.bottom) closeCombos();
    else placeComboPop(comboOpen);
  }
}, { passive: true });

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (comboOpen) placeComboPop(comboOpen);
  });
  window.visualViewport.addEventListener("scroll", () => {
    if (comboOpen) placeComboPop(comboOpen);
  });
}

if (comboPop) {
  comboPop.addEventListener("mousedown", (ev) => ev.preventDefault());
  comboPop.addEventListener("click", (ev) => {
    const opt = ev.target.closest("li[data-val]");
    if (opt && comboOpen) pickCombo(comboOpen, opt.dataset.val);
  });
}

document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".combo") && !ev.target.closest(".combo-pop")) closeCombos();
});

editDlg.addEventListener("close", () => {
  closeCombos();
  document.body.classList.remove("is-modal");
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
  if (scroller) scroller.setAttribute("aria-hidden", boards || invite ? "true" : "false");
  const tools = $("chrome-tools");
  if (tools) tools.setAttribute("aria-hidden", boards || invite ? "true" : "false");
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

if (!window.Boards) {
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
    announceGrant("Already on this board.");
    return;
  }
  b.grants.push({ id: uid(), handle, role: "granted" });
  persist();
  ev.target.reset();
  renderGrants(b.id);
  announceGrant("Granted access to " + handle);
});

$("grant-list").addEventListener("click", (ev) => {
  const btn = ev.target.closest("[data-revoke]");
  if (!btn) return;
  const b = currentBoard();
  const row = btn.closest("li");
  const who = row ? row.querySelector("span")?.textContent : "";
  b.grants = b.grants.filter((g) => g.id !== btn.dataset.revoke);
  persist();
  renderGrants(b.id);
  announceGrant(who ? "Removed " + who : "Access removed");
});

window.addEventListener("hashchange", route);
}

window.addEventListener("keydown", (ev) => {
  const typing = ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement || ev.target instanceof HTMLSelectElement;
  if (ev.key === "Escape") {
    if (comboOpen) {
      closeCombos();
      ev.preventDefault();
      return;
    }
    if (editDlg.open) {
      state.editing = null;
      editDlg.close();
    } else if ($("export") && $("export").open) {
      $("export").close();
    } else if (veil && !veil.hidden) {
      closeMarket();
    }
    return;
  }
  if (editDlg.open) {
    trapTab(ev, editDlg);
    return;
  }
  if ($("export") && $("export").open) {
    trapTab(ev, $("export"));
    return;
  }
  if (document.body.classList.contains("is-market")) {
    if (ev.key === "h" || ev.key === "H") {
      ev.preventDefault();
      closeMarket();
      return;
    }
    trapTab(ev, market);
    return;
  }
  if (typing) return;
  if (ev.key === "h" || ev.key === "H") openMarket("market");
  if (ev.key === "v" || ev.key === "V") $("select").click();
  if (ev.key === "n" || ev.key === "N") place("note");
  if (ev.key === "e" || ev.key === "E") {
    const card = selected();
    if (card) openEdit(card);
  }
  if (ev.key === "Backspace" || ev.key === "Delete") removeSel();
});

function bindTips() {
  const tip = $("tip");
  if (!tip) return;
  let timer = 0;
  let over = null;

  function placeTip(ev, el) {
    const label = el.getAttribute("aria-label");
    if (!label || document.body.classList.contains("is-market") || document.body.classList.contains("is-modal") || editDlg.open) {
      tip.hidden = true;
      return;
    }
    tip.textContent = label;
    tip.hidden = false;
    let x = ev && ev.clientX != null ? ev.clientX + 12 : el.getBoundingClientRect().right + 8;
    let y = ev && ev.clientY != null ? ev.clientY + 14 : el.getBoundingClientRect().bottom + 8;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = innerHeight - h - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  document.addEventListener("pointerover", (ev) => {
    const el = ev.target.closest(".tool, [data-tip]");
    if (!el || el === over) return;
    over = el;
    clearTimeout(timer);
    timer = setTimeout(() => placeTip(ev, el), 300);
  });
  document.addEventListener("pointermove", (ev) => {
    if (!over || tip.hidden) return;
    if (over.contains(ev.target) || ev.target === over) placeTip(ev, over);
  });
  document.addEventListener("pointerout", (ev) => {
    const el = ev.target.closest(".tool, [data-tip]");
    if (!el || el.contains(ev.relatedTarget)) return;
    if (el === over) {
      over = null;
      clearTimeout(timer);
      tip.hidden = true;
    }
  });
}

bindTips();
renderCatalog();
if (!window.Boards) {
  renderBoardChrome();
  renderCards();
  route();
} else {
  renderCards();
}

if (window.DataBasedFlow && window.DB) window.DataBasedFlow.attach(window.DB);
if (window.Boards && window.DB && typeof window.Boards.boot === "function") window.Boards.boot(window.DB);
