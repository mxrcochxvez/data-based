import { emptyBoard } from "./store.mjs";

const KIND = {
  table: "schema",
  sql: "schema",
  schema: "schema",
  drizzle: "drizzle",
  prisma: "prisma",
  gql: "gql",
  graphql: "gql",
  repo: "repo",
  dal: "repo",
  module: "repo",
  service: "logic",
  effect: "logic",
  logic: "logic",
  router: "ctrl",
  controller: "ctrl",
  ctrl: "ctrl",
  note: "note",
  mind: "mind",
  kysely: "kysely",
  convex: "convex",
  zod: "zod",
  proto: "proto",
  protobuf: "proto",
  trpc: "trpc",
  hono: "hono",
  openapi: "openapi",
};

const COL_X = { schema: 88, drizzle: 88, prisma: 88, repo: 388, logic: 688, ctrl: 988, gql: 988, note: 88, mind: 88 };
const SIZE = {
  schema: { w: 248, h: 164 },
  drizzle: { w: 248, h: 164 },
  prisma: { w: 248, h: 164 },
  gql: { w: 248, h: 164 },
  repo: { w: 248, h: 164 },
  logic: { w: 280, h: 164 },
  ctrl: { w: 248, h: 164 },
  note: { w: 200, h: 160 },
  mind: { w: 228, h: 140 },
};

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function text(v) {
  return String(v == null ? "" : v).trim();
}

function mapKind(raw, fallback) {
  const k = String(raw || "").toLowerCase();
  return KIND[k] || fallback || "note";
}

function slug(s) {
  return text(s).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parsePrisma(src) {
  const out = [];
  const re = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const fields = [];
    for (const line of m[2].split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      const parts = t.split(/\s+/);
      if (parts.length < 2) continue;
      fields.push({
        name: parts[0],
        type: parts[1],
        def: "",
        fns: /@id/.test(t) ? "@id" : /@unique/.test(t) ? "@unique" : "",
      });
    }
    out.push({
      name: m[1],
      kind: "prisma",
      fields,
      source: "model " + m[1] + " {\n" + m[2].replace(/\s+$/, "") + "\n}",
    });
  }
  return out;
}

function parseSql(src) {
  const out = [];
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?["'`]?(\w+)["'`]?\s*\(([\s\S]*?)\)\s*;/gi;
  let m;
  while ((m = re.exec(src))) {
    const fields = [];
    for (const part of m[2].split(",")) {
      const t = part.trim();
      if (!t || /^(primary|unique|constraint|foreign|check)\b/i.test(t)) continue;
      const bits = t.split(/\s+/);
      if (bits.length < 2) continue;
      fields.push({
        name: bits[0].replace(/["'`]/g, ""),
        type: bits[1],
        def: "",
        fns: /primary\s+key/i.test(t) ? "primary key" : /not\s+null/i.test(t) ? "not null" : "",
      });
    }
    out.push({
      name: m[1],
      kind: "schema",
      fields,
      source: "create table " + m[1] + " (\n  " + fields.map((f) => f.name + " " + f.type + (f.fns ? " " + f.fns : "")).join(",\n  ") + "\n);",
    });
  }
  return out;
}

function parseDrizzle(src) {
  const out = [];
  const re = /(?:export\s+const\s+)?(\w+)\s*=\s*(pgTable|mysqlTable|sqliteTable)\(\s*["']([^"']+)["']\s*,\s*\{([\s\S]*?)\}\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const fields = [];
    const body = m[4];
    const fr = /(\w+)\s*:\s*(\w+)\s*\(\s*["']?([^"'\) ,]*)/g;
    let f;
    while ((f = fr.exec(body))) {
      fields.push({ name: f[3] || f[1], type: f[2], def: "", fns: "" });
    }
    out.push({
      name: m[3],
      kind: "drizzle",
      fields,
      source: m[0],
    });
  }
  return out;
}

function generateSource(kind, title, fields) {
  const rows = asArray(fields);
  if (kind === "prisma") {
    const body = rows.map((f) => "  " + (f.name || "col") + " " + (f.type || "String") + (f.fns ? " " + f.fns : "")).join("\n");
    return "model " + title + " {\n" + (body || "  id String @id") + "\n}";
  }
  if (kind === "drizzle") {
    const cols = rows.map((f) => "  " + (f.name || "col") + ": " + (f.type || "text") + "(\"" + (f.name || "col") + "\")").join(",\n");
    return "export const " + title + " = pgTable(\"" + title + "\", {\n" + (cols || "  id: uuid(\"id\")") + "\n});";
  }
  if (kind === "gql") {
    const cols = rows.map((f) => "  " + (f.name || "field") + ": " + (f.type || "String")).join("\n");
    return "type " + title + " {\n" + (cols || "  id: ID!") + "\n}";
  }
  const cols = rows.map((f) => "  " + (f.name || "col") + " " + (f.type || "text") + (f.fns ? " " + f.fns : "")).join(",\n");
  return "create table " + title + " (\n" + (cols || "  id uuid primary key") + "\n);";
}

function fieldList(raw) {
  return asArray(raw).map((f) => ({
    name: text(f && f.name) || "col",
    type: text(f && (f.type || f.ty)) || "",
    def: text(f && (f.def || f.default)),
    fns: text(f && (f.fns || f.extra || f.modifiers)),
  }));
}

function tablesFromFiles(files) {
  const out = [];
  for (const file of asArray(files)) {
    const p = text(file.path || file.name).toLowerCase();
    const src = text(file.content || file.source || file.text);
    if (!src) continue;
    if (p.endsWith(".prisma") || /schema\.prisma/.test(p) || file.kind === "prisma") {
      out.push(...parsePrisma(src));
    } else if (p.endsWith(".sql") || file.kind === "sql" || file.kind === "schema") {
      out.push(...parseSql(src));
    } else if (/drizzle/i.test(p) || file.kind === "drizzle") {
      out.push(...parseDrizzle(src));
    } else {
      const parsed = parsePrisma(src);
      if (parsed.length) out.push(...parsed);
      else {
        const sql = parseSql(src);
        if (sql.length) out.push(...sql);
        else out.push(...parseDrizzle(src));
      }
    }
  }
  return out;
}

function uniqueName(used, name) {
  let base = text(name) || "untitled";
  let n = base;
  let i = 2;
  while (used.has(slug(n))) {
    n = base + " " + i;
    i += 1;
  }
  used.add(slug(n));
  return n;
}

export function normalizeIngest(payload) {
  const src = payload && typeof payload === "object" ? payload : {};
  const used = new Set();
  const tables = [];
  const seenTable = new Set();

  function addTable(t) {
    if (!t) return;
    const name = uniqueName(used, t.name || t.title);
    const key = slug(name);
    if (seenTable.has(key) && tables.find((x) => slug(x.name) === key)) return;
    seenTable.add(key);
    const kind = mapKind(t.kind || t.vendor, "schema");
    const tableKind = kind === "drizzle" || kind === "prisma" || kind === "gql" ? kind : "schema";
    const fields = fieldList(t.fields);
    tables.push({
      name,
      kind: tableKind,
      fields,
      source: text(t.source) || generateSource(tableKind, name, fields),
      file: text(t.file || t.path),
      aliases: asArray(t.aliases).map(text).filter(Boolean),
    });
  }

  asArray(src.tables).forEach(addTable);
  if (!tables.length) tablesFromFiles(src.files).forEach(addTable);

  const modules = asArray(src.modules).map((m) => ({
    name: uniqueName(used, m.name || m.title || m.path),
    kind: mapKind(m.kind, "repo"),
    path: text(m.path || m.file),
    note: text(m.note || m.blurb || (m.path ? m.path : "")),
  }));

  const routers = asArray(src.routers || src.controllers).map((r) => ({
    name: uniqueName(used, r.name || r.title || ((r.method || "") + " " + (r.path || "")).trim()),
    path: text(r.path || r.file),
    method: text(r.method),
    note: text(r.note || [r.method, r.path].filter(Boolean).join(" ")),
  }));

  const effects = asArray(src.effects || src.services).map((e) => ({
    name: uniqueName(used, e.name || e.title),
    input: fieldList(e.input),
    output: fieldList(e.output),
    effects: asArray(e.effects || e.steps),
    note: text(e.note),
    inputSrc: text(e.inputSrc),
    outputSrc: text(e.outputSrc),
    effectsSrc: text(e.effectsSrc),
  }));

  const notes = asArray(src.notes).map((n) => ({
    title: text(n.title || n.name) || "Note",
    text: text(n.text || n.note || n.body),
  }));

  const edges = asArray(src.edges).map((e) => ({
    from: text(e.from || e.source),
    to: text(e.to || e.target),
  })).filter((e) => e.from && e.to);

  return {
    name: text(src.name) || "Ingested board",
    tables,
    modules,
    routers,
    effects,
    notes,
    edges,
  };
}

function fxNodes(list) {
  return asArray(list).map((n) => {
    if (typeof n === "string") {
      const [kind, ...rest] = n.split(/\s+/);
      return { type: "action", kind: kind || "log", target: rest.join(" ") };
    }
    if (n && n.type === "if") {
      return { type: "if", cond: text(n.cond), then: fxNodes(n.then), else: fxNodes(n.else) };
    }
    return { type: "action", kind: text(n.kind || n.type) || "log", target: text(n.target || n.name) };
  });
}

function makeCard(id, kind, title, x, y, bodyExtra) {
  const size = SIZE[kind] || SIZE.repo;
  return {
    id,
    kind,
    x,
    y,
    w: size.w,
    h: size.h,
    z: id,
    next: null,
    prev: null,
    links: [],
    body: Object.assign({ title }, bodyExtra || {}),
  };
}

function aliasesOf(item, kind) {
  const names = [item.name, item.title, item.path];
  if (item.aliases) names.push(...item.aliases);
  if (item.method && item.path) names.push(item.method + " " + item.path);
  return names.filter(Boolean).map((n) => kind + ":" + slug(n)).concat(names.filter(Boolean).map((n) => slug(n)));
}

export function boardFromIngest(normalized, handle) {
  const spec = normalizeIngest(normalized);
  const board = emptyBoard(spec.name, handle);
  const cards = [];
  const index = new Map();
  let nextId = 1;
  const stacks = { schema: 0, drizzle: 0, prisma: 0, repo: 0, logic: 0, ctrl: 0, gql: 0, note: 0, mind: 0 };

  function place(kind) {
    const col = kind === "note" || kind === "mind" ? "note" : kind;
    const i = stacks[col] || 0;
    stacks[col] = i + 1;
    const yBase = (kind === "note" || kind === "mind")
      ? 200 + Math.max(stacks.schema, stacks.drizzle, stacks.prisma, 0) * 200 + 40
      : 200;
    return { x: COL_X[kind] || 88, y: yBase + i * 200 };
  }

  function remember(card, item, kind) {
    cards.push(card);
    for (const key of aliasesOf(item, kind)) {
      if (key && !index.has(key)) index.set(key, card.id);
    }
    index.set(String(card.id), card.id);
    index.set(slug(card.body.title), card.id);
  }

  for (const t of spec.tables) {
    const pos = place(t.kind);
    const card = makeCard(nextId++, t.kind, t.name, pos.x, pos.y, {
      fields: t.fields,
      source: t.source,
    });
    remember(card, t, t.kind);
  }
  for (const m of spec.modules) {
    const kind = m.kind === "logic" || m.kind === "ctrl" ? m.kind : "repo";
    const pos = place(kind);
    const card = makeCard(nextId++, kind, m.name, pos.x, pos.y, {
      note: m.note || m.path || "",
    });
    remember(card, m, kind);
  }
  for (const e of spec.effects) {
    const pos = place("logic");
    const card = makeCard(nextId++, "logic", e.name, pos.x, pos.y, {
      input: e.input,
      output: e.output,
      effects: fxNodes(e.effects),
      inputSrc: e.inputSrc,
      outputSrc: e.outputSrc,
      effectsSrc: e.effectsSrc,
      note: e.note,
    });
    remember(card, e, "logic");
  }
  for (const r of spec.routers) {
    const pos = place("ctrl");
    const card = makeCard(nextId++, "ctrl", r.name, pos.x, pos.y, {
      note: r.note || [r.method, r.path].filter(Boolean).join(" "),
    });
    remember(card, r, "ctrl");
  }
  for (const n of spec.notes) {
    const pos = place("note");
    const card = makeCard(nextId++, "note", n.title, pos.x, pos.y, {
      title: n.title,
      note: n.text,
    });
    remember(card, n, "note");
  }

  function resolve(name) {
    const raw = text(name);
    if (!raw) return null;
    if (index.has(raw)) return index.get(raw);
    const s = slug(raw);
    if (index.has(s)) return index.get(s);
    const tagged = raw.toLowerCase().replace(/\s+/g, "");
    if (index.has(tagged)) return index.get(tagged);
    return null;
  }

  const edges = [];
  const seen = new Set();
  for (const e of spec.edges) {
    const from = resolve(e.from);
    const to = resolve(e.to);
    if (from == null || to == null || from === to) continue;
    const key = from + ">" + to;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from, to });
  }

  for (const c of cards) {
    const outs = edges.filter((e) => e.from === c.id).map((e) => e.to);
    c.links = outs;
    c.next = outs.length ? outs[0] : null;
  }

  board.cards = cards;
  board.edges = edges;
  board.nextId = nextId;
  board.placeAt = { x: 88, y: 200 + cards.length * 4 };
  return { board, spec };
}

export function ingestSummary(spec) {
  return {
    name: spec.name,
    tables: spec.tables.length,
    modules: spec.modules.length,
    effects: spec.effects.length,
    routers: spec.routers.length,
    notes: spec.notes.length,
    edges: spec.edges.length,
  };
}
