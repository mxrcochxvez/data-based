(function (root) {
  const INK = 'fill="none" stroke="#111" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"';
  const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  const ordered = [];
  const byId = new Map();

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
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

  function inner(src, openCh, closeCh) {
    const open = src.indexOf(openCh);
    const close = src.lastIndexOf(closeCh);
    if (open < 0 || close <= open) return null;
    return src.slice(open + 1, close);
  }

  function inkMark(path) {
    return `<span class="offer-mark is-ink" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  }

  function fail(error) {
    return { ok: false, error };
  }

  function okRows(rows, title, key) {
    const out = { ok: true, title };
    out[key] = rows;
    return out;
  }

  const MARKS = {
    note: inkMark(`<path ${INK} d="M6 4.5h9.5L18.5 8v11.5H6V4.5Zm9.5 0V8H18.5"/>`),
    mind: inkMark(`<path ${INK} d="M12 4.5 19 9v6l-7 4.5L5 15V9l7-4.5Z"/><path ${INK} d="M12 9v6M9 12h6"/>`),
    schema: inkMark(`<ellipse ${INK} cx="12" cy="7" rx="7" ry="2.4"/><path ${INK} d="M5 7v10c0 1.4 3.1 2.4 7 2.4s7-1 7-2.4V7"/><path ${INK} d="M5 12c0 1.4 3.1 2.4 7 2.4s7-1 7-2.4"/>`),
    drizzle: `<span class="offer-mark is-drizzle" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#111" d="M7.2 5.2c2.1-2.4 5.6-2.6 7.9-.4 1.8 1.7 2.2 4.3 1.2 6.5l-4.1 8.2a2 2 0 0 1-3.6 0L4.5 11.3c-1-2.2-.6-4.8 1.2-6.5  .5-.4 1-.8 1.5-1.1Zm4.8 3.1c.7 0 1.3.6 1.3 1.4v.2c0 .7-.6 1.3-1.3 1.3s-1.3-.6-1.3-1.3v-.2c0-.8.6-1.4 1.3-1.4Zm0 4.6c.7 0 1.3.6 1.3 1.3v.3c0 .7-.6 1.3-1.3 1.3s-1.3-.6-1.3-1.3v-.3c0-.7.6-1.3 1.3-1.3Z"/></svg></span>`,
    prisma: `<span class="offer-mark is-prisma" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#fff" d="M16.9 2.1 4.6 21.4c-.4.7.2 1.6 1 1.6h7.4c.6 0 1.1-.3 1.3-.9L19.8 3.4c.4-.8-.2-1.7-1.1-1.7h-1.8Z"/></svg></span>`,
    logic: inkMark(`<path ${INK} d="M7 5h10v4h-4v10H11V9H7V5Z"/>`),
    ctrl: inkMark(`<path ${INK} d="M5 8h14v3H5V8Zm0 5h14v3H5v-3Zm0 5h14v3H5v-3Z"/>`),
    repo: inkMark(`<path ${INK} d="M4.5 8.5h6l1.5 2h7.5v8.5h-15V8.5Zm0 0V7l2.2-2h4.2l1.1 1.5"/>`),
    gql: `<span class="offer-mark is-gql" aria-hidden="true"><svg viewBox="0 0 24 24"><g fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><path d="M12 3.8 20 8.4v7.2L12 20.2 4 15.6V8.4L12 3.8Z"/><path d="M12 3.8v16.4M4.2 8.5l15.6 7M19.8 8.5l-15.6 7"/></g><circle cx="12" cy="3.8" r="1.45" fill="#fff"/><circle cx="20" cy="8.4" r="1.45" fill="#fff"/><circle cx="20" cy="15.6" r="1.45" fill="#fff"/><circle cx="12" cy="20.2" r="1.45" fill="#fff"/><circle cx="4" cy="15.6" r="1.45" fill="#fff"/><circle cx="4" cy="8.4" r="1.45" fill="#fff"/></svg></span>`,
    kysely: inkMark(`<path ${INK} d="M7 5h10v3H13v11H11V8H7V5Z"/>`),
    convex: inkMark(`<path ${INK} d="M12 4.5 19.5 9v6L12 19.5 4.5 15V9L12 4.5Z"/>`),
    zod: inkMark(`<path ${INK} d="M12 3.8 20 12l-8 8.2L4 12l8-8.2Z"/>`),
    proto: inkMark(`<path ${INK} d="M8 5h8l4 7-4 7H8l-4-7 4-7Z"/>`),
    trpc: inkMark(`<path ${INK} d="M5 6.5h14v3H5v-3Zm0 5h14v3H5v-3Zm0 5h9v3H5v-3Z"/>`),
    hono: inkMark(`<path ${INK} d="M6 18c2-6 3.2-10 6-13 2.8 3 4 7 6 13"/><path ${INK} d="M8.5 13h7"/>`),
    openapi: inkMark(`<circle ${INK} cx="12" cy="12" r="7.2"/><path ${INK} d="M12 8v8M8.5 10.5h7M8.5 13.5h7"/>`),
  };

  function parseHttpRoutes(src) {
    const text = String(src || "").trim();
    if (!text) return fail("Need METHOD /path.");
    const chunks = text.split(/\n\s*\n/);
    const routes = [];
    let i = 0;
    while (i < chunks.length) {
      const lines = chunks[i].split("\n");
      const head = (lines[0] || "").match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\s+HTTP\/[\d.]+)?/i);
      if (!head) {
        i += 1;
        continue;
      }
      let status = "200";
      for (const line of lines.slice(1)) {
        const sm = line.match(/^Status:\s*(\S+)/i);
        if (sm) status = sm[1];
      }
      let handler = "";
      if (i + 1 < chunks.length && !/^(GET|POST|PUT|PATCH|DELETE)\s+/i.test(chunks[i + 1])) {
        handler = chunks[i + 1].trim();
        i += 2;
      } else {
        i += 1;
      }
      routes.push({ method: head[1].toUpperCase(), path: head[2], status, handler });
    }
    return routes.length ? okRows(routes, "", "routes") : fail("Need METHOD /path.");
  }

  function httpSource(routes) {
    return (routes || []).map((r) => {
      const method = String(r.method || "GET").toUpperCase();
      const path = r.path || "/";
      const status = r.status || "200";
      const handler = String(r.handler || "").trim();
      return `${method} ${path} HTTP/1.1\nStatus: ${status}${handler ? "\n\n" + handler : ""}`;
    }).join("\n\n");
  }

  function parseNoteRoutes(note) {
    const text = String(note || "").trim();
    if (!text) return [];
    const m = text.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)(?:\s*→\s*(.*))?/i);
    if (!m) return [];
    const rest = m[3] || "";
    const sm = rest.match(/return\s+(\d+)/i);
    return [{
      method: m[1].toUpperCase(),
      path: m[2],
      status: sm ? sm[1] : "200",
      handler: rest.replace(/,?\s*return\s+\d+/i, "").trim() || rest,
    }];
  }

  function parseNoteEntries(note) {
    return String(note || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean).map((name) => ({
      name: ident(name, "method"),
      sig: "()",
    }));
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
        const body = inner(src, "(", ")");
        if (!head || body == null) return fail("Need a CREATE TABLE ( … ) block.");
        const fields = [];
        for (const part of splitTop(body)) {
          const bits = part.trim().replace(/,$/, "").split(/\s+/);
          if (bits.length < 2) continue;
          fields.push({ name: bits[0].replace(/"/g, ""), type: bits[1], extra: bits.slice(2).join(" ") });
        }
        if (!fields.length) return fail("No columns found in the table body.");
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
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need a pgTable / mysqlTable / sqliteTable({ … }) definition.");
        const fields = [];
        for (const part of splitTop(body)) {
          const m = part.trim().replace(/,$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([a-zA-Z]+)\(\s*["']?([^"')]+)?["']?\s*\)(.*)$/);
          if (!m) continue;
          fields.push({ name: m[1], type: m[2], extra: m[4].replace(/^\./, "").trim() });
        }
        if (!fields.length) return fail("No column helpers found in the table object.");
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
          const innerDef = (raw.match(/^@default\((.*)\)$/) || [])[1];
          const def = raw ? `@default(${innerDef != null ? innerDef : raw})` : "";
          const extra = [row.fns, def].filter(Boolean).join(" ");
          const pad = row.name.length < 6 ? " ".repeat(6 - row.name.length) : " ";
          return `  ${row.name}${pad}${row.type}${extra ? " " + extra : ""}`;
        }).join("\n");
        return `model ${name} {\n${cols}\n}`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/model\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need a Prisma model Name { … } block.");
        const fields = [];
        for (const line of body.split("\n")) {
          const t = line.trim();
          if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
          const bits = t.split(/\s+/);
          if (bits.length < 2) continue;
          fields.push({ name: bits[0], type: bits[1], extra: bits.slice(2).join(" ") });
        }
        if (!fields.length) return fail("No fields found in the model.");
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
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need a GraphQL type Name { … } block.");
        const fields = [];
        for (const line of body.split("\n")) {
          const t = line.trim().replace(/,$/, "");
          if (!t || t.startsWith("#")) continue;
          const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^\s]+)(.*)$/);
          if (!m) continue;
          fields.push({ name: m[1], type: m[2], extra: m[3].trim() });
        }
        if (!fields.length) return fail("No fields found in the type.");
        return { ok: true, title: head[1], fields: hydrateFields("gql", fields) };
      },
    },
    kysely: {
      rawLabel: "Kysely",
      lang: "typescript",
      generate(title, fields) {
        const name = modelName(title).replace(/Table$/, "") + "Table";
        const cols = fields.map((f) => `  ${f.name || "col"}: ${f.type || "string"};`).join("\n");
        return `import type { Generated } from "kysely";\n\nexport interface ${name} {\n${cols}\n}\n`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/interface\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need a Kysely interface { … }.");
        const fields = [];
        for (const line of body.split("\n")) {
          const m = line.trim().replace(/;$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
          if (!m) continue;
          fields.push({ name: m[1], type: m[2].trim(), def: "", fns: "" });
        }
        if (!fields.length) return fail("No columns found in the interface.");
        return { ok: true, title: head[1].replace(/Table$/, ""), fields };
      },
    },
    convex: {
      rawLabel: "Convex",
      lang: "typescript",
      generate(title, fields) {
        const table = sqlIdent(title);
        const cols = fields.map((f) => {
          const t = f.type || "v.string()";
          const call = t.startsWith("v.") ? t : `v.${t}()`;
          return `    ${f.name || "col"}: ${call},`;
        }).join("\n");
        return `import { defineSchema, defineTable } from "convex/server";\nimport { v } from "convex/values";\n\nexport default defineSchema({\n  ${table}: defineTable({\n${cols}\n  }),\n});\n`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*defineTable\s*\(/);
        const start = src.indexOf("defineTable(");
        const body = start >= 0 ? inner(src.slice(start), "{", "}") : null;
        if (!head || body == null) return fail("Need name: defineTable({ … }).");
        const fields = [];
        for (const part of splitTop(body)) {
          const m = part.trim().replace(/,$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
          if (!m) continue;
          fields.push({ name: m[1], type: m[2].trim(), def: "", fns: "" });
        }
        if (!fields.length) return fail("No columns found in defineTable.");
        return { ok: true, title: head[1], fields };
      },
    },
    zod: {
      rawLabel: "Zod",
      lang: "typescript",
      generate(title, fields) {
        const name = modelName(title);
        const cols = fields.map((f) => {
          const raw = String(f.type || "string").replace(/^z\./, "");
          const core = /\(/.test(raw) ? raw : `${raw}()`;
          const chain = String(f.fns || "").replace(/^\./, "");
          return `  ${f.name || "field"}: z.${core}${chain ? "." + chain : ""},`;
        }).join("\n");
        return `export const ${name} = z.object({\n${cols}\n});`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*z\.object\s*\(/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need z.object({ … }).");
        const fields = [];
        for (const part of splitTop(body)) {
          const m = part.trim().replace(/,$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\.([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)(.*)$/);
          if (!m) continue;
          fields.push({
            name: m[1],
            type: m[2],
            def: "",
            fns: m[4].replace(/^\./, "").trim(),
          });
        }
        if (!fields.length) return fail("No fields found in the object.");
        return { ok: true, title: head[1], fields };
      },
    },
    proto: {
      rawLabel: "Protocol Buffers",
      lang: "protobuf",
      generate(title, fields) {
        const name = modelName(title);
        const cols = fields.map((f, i) => `  ${f.type || "string"} ${f.name || "field"} = ${i + 1};`).join("\n");
        return `syntax = "proto3";\n\nmessage ${name} {\n${cols}\n}\n`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/message\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need a message Name { … } block.");
        const fields = [];
        for (const line of body.split("\n")) {
          const m = line.trim().match(/^(repeated\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\d+;?$/);
          if (!m) continue;
          fields.push({ name: m[3], type: (m[1] ? "repeated " : "") + m[2], def: "", fns: "" });
        }
        if (!fields.length) return fail("No fields found in the message.");
        return { ok: true, title: head[1], fields };
      },
    },
    ctrl: {
      rawLabel: "HTTP",
      lang: "http",
      generate(_title, routes) {
        return httpSource(routes);
      },
      parse(text) {
        return parseHttpRoutes(text);
      },
    },
    trpc: {
      rawLabel: "tRPC",
      lang: "typescript",
      generate(title, routes) {
        const name = ident(title, "app").replace(/Router$/, "") + "Router";
        const body = (routes || []).map((r) => {
          const proc = ident(String(r.path || r.handler || "call").replace(/^\//, ""), "call");
          const kind = /^get$/i.test(r.method) ? "query" : "mutation";
          const comment = r.handler ? `    /* ${r.handler} */\n` : "";
          return `  ${proc}: publicProcedure.${kind}(async () => {\n${comment}    return {};\n  }),`;
        }).join("\n");
        return `import { router, publicProcedure } from "../trpc";\n\nexport const ${name} = router({\n${body}\n});\n`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*router\s*\(/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need router({ … }).");
        const routes = [];
        const re = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*publicProcedure\.(query|mutation)\s*\(\s*async\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\)/g;
        let m;
        while ((m = re.exec(body))) {
          const comment = (m[3].match(/\/\*\s*([\s\S]*?)\s*\*\//) || [])[1] || "";
          routes.push({
            method: m[2] === "query" ? "GET" : "POST",
            path: "/" + m[1],
            status: m[2] === "query" ? "200" : "201",
            handler: comment.trim(),
          });
        }
        if (!routes.length) return fail("No publicProcedure calls found.");
        return { ok: true, title: head[1].replace(/Router$/, ""), routes };
      },
    },
    hono: {
      rawLabel: "Hono",
      lang: "typescript",
      generate(_title, routes) {
        const lines = (routes || []).map((r) => {
          const method = String(r.method || "get").toLowerCase();
          const path = r.path || "/";
          const status = r.status || "200";
          return `app.${method}("${path}", (c) => c.json({}, ${status}));`;
        });
        return `import { Hono } from "hono";\n\nconst app = new Hono();\n${lines.join("\n")}\nexport default app;\n`;
      },
      parse(text) {
        const src = String(text || "");
        if (!/new\s+Hono\s*\(/.test(src)) return fail("Need new Hono().");
        const routes = [];
        const re = /app\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']\s*,\s*\(c\)\s*=>\s*c\.json\(\s*\{\s*\}\s*,\s*(\d+)\s*\)\s*\)/gi;
        let m;
        while ((m = re.exec(src))) {
          routes.push({ method: m[1].toUpperCase(), path: m[2], status: m[3], handler: "" });
        }
        if (!routes.length) return fail("Need app.get/post(path, handler).");
        return { ok: true, title: "app", routes };
      },
    },
    openapi: {
      rawLabel: "OpenAPI",
      lang: "yaml",
      generate(_title, routes) {
        const byPath = new Map();
        for (const r of routes || []) {
          const p = r.path || "/";
          if (!byPath.has(p)) byPath.set(p, []);
          byPath.get(p).push(r);
        }
        let yaml = "paths:\n";
        for (const [p, list] of byPath) {
          yaml += `  ${p}:\n`;
          for (const r of list) {
            const method = String(r.method || "get").toLowerCase();
            const summary = r.handler || "ok";
            const status = r.status || "200";
            yaml += `    ${method}:\n      summary: ${summary}\n      responses:\n        "${status}":\n          description: ${summary}\n`;
          }
        }
        return yaml;
      },
      parse(text) {
        const src = String(text || "");
        if (!/^\s*paths\s*:/m.test(src)) return fail("Need an OpenAPI paths: document.");
        const routes = [];
        let path = "/";
        let method = "GET";
        let handler = "";
        for (const raw of src.split("\n")) {
          const pathM = raw.match(/^\s{2}(\/\S*?):\s*$/);
          if (pathM) {
            path = pathM[1];
            continue;
          }
          const methodM = raw.match(/^\s{4}(get|post|put|patch|delete)\s*:\s*$/i);
          if (methodM) {
            method = methodM[1].toUpperCase();
            handler = "";
            continue;
          }
          const sumM = raw.match(/^\s+summary:\s*(.+)\s*$/);
          if (sumM) handler = sumM[1].trim();
          const stM = raw.match(/^\s+"?(\d{3})"?\s*:\s*$/);
          if (stM) routes.push({ method, path, status: stM[1], handler });
        }
        if (!routes.length) return fail("Need at least one path method.");
        return { ok: true, title: "api", routes };
      },
    },
    repo: {
      rawLabel: "TypeScript",
      lang: "typescript",
      generate(title, entries) {
        const name = modelName(title).replace(/Repo$/, "") + "Repo";
        const body = (entries || []).map((e) => {
          const sig = e.sig || "()";
          return sig.startsWith("(") ? `  ${e.name}${sig};` : `  ${e.name}(${sig});`;
        }).join("\n");
        return `export interface ${name} {\n${body}\n}\n`;
      },
      parse(text) {
        const src = String(text || "");
        const head = src.match(/interface\s+([A-Za-z_][A-Za-z0-9_]*)/);
        const body = inner(src, "{", "}");
        if (!head || body == null) return fail("Need an interface { … }.");
        const entries = [];
        for (const line of body.split("\n")) {
          const m = line.trim().replace(/;$/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)(\(.*\).*)$/);
          if (!m) continue;
          entries.push({ name: m[1], sig: m[2] });
        }
        if (!entries.length) return fail("No methods found in the interface.");
        return { ok: true, title: head[1].replace(/Repo$/, ""), entries };
      },
    },
  };

  function define(spec) {
    if (!spec || !spec.kind) throw new Error("kind spec needs kind");
    if (byId.has(spec.kind)) throw new Error("duplicate kind " + spec.kind);
    const tile = spec.tile || "ink";
    if (tile !== "ink" && spec.kind !== "prisma" && spec.kind !== "drizzle" && spec.kind !== "gql") {
      throw new Error("vendor tile not allowed on " + spec.kind);
    }
    const family = spec.family;
    if (!["table", "type", "route", "list", "effect", "note"].includes(family)) {
      throw new Error("unknown family " + family);
    }
    const full = {
      inline: false,
      pipeNext: null,
      addLabel: "",
      suffix: "",
      layer: "note",
      section: "maps",
      vendor: "data-based",
      tags: [],
      size: { w: 248, h: 164 },
      vocab: { types: [""], defaults: [""], fns: [""] },
      lang: { id: "text", rawLabel: "Text" },
      tile,
      mark: MARKS[spec.kind] || MARKS.note,
      ...spec,
    };
    byId.set(full.kind, full);
    ordered.push(full);
    return full;
  }

  function idFields(kind) {
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
    if (kind === "kysely") {
      return [
        { name: "id", type: "Generated<string>", def: "", fns: "" },
        { name: "email", type: "string", def: "", fns: "" },
      ];
    }
    if (kind === "convex") {
      return [
        { name: "id", type: "v.string()", def: "", fns: "" },
        { name: "email", type: "v.string()", def: "", fns: "" },
      ];
    }
    if (kind === "zod") {
      return [
        { name: "id", type: "string", def: "", fns: "uuid()" },
        { name: "email", type: "string", def: "", fns: "email()" },
      ];
    }
    if (kind === "proto") {
      return [
        { name: "id", type: "string", def: "", fns: "" },
        { name: "email", type: "string", def: "", fns: "" },
      ];
    }
    return [
      { name: "id", type: "uuid", def: "", fns: "primary key" },
      { name: "email", type: "text", def: "", fns: "not null unique" },
    ];
  }

  function defaultRoute() {
    return [{ method: "POST", path: "/users", status: "201", handler: "create user" }];
  }

  function codedBlank(spec) {
    if (spec.family === "table" || spec.family === "type") {
      const fields = idFields(spec.kind);
      return { title: spec.title, fields, source: spec.generate(spec.title, fields) };
    }
    if (spec.family === "route") {
      const routes = defaultRoute();
      return { title: spec.title, routes, source: spec.generate(spec.title, routes), note: "" };
    }
    if (spec.family === "list") {
      const entries = [
        { name: "findById", sig: "(id: string): Promise<User | null>" },
        { name: "save", sig: "(user: User): Promise<void>" },
        { name: "list", sig: "(): Promise<User[]>" },
      ];
      return { title: spec.title, entries, source: spec.generate(spec.title, entries), note: "" };
    }
    if (spec.kind === "note") return { title: "Note", note: "" };
    if (spec.kind === "mind") {
      const note = "What has to be true?";
      return { title: spec.title, note, source: note };
    }
    return { title: spec.title, note: "" };
  }

  define({
    kind: "note",
    family: "note",
    inline: true,
    name: "Note",
    label: "Note",
    blurb: "A sticky on the board. Plain text.",
    section: "maps",
    layer: "note",
    tags: ["sticky", "text"],
    title: "Note",
    size: { w: 200, h: 160 },
    blank: () => codedBlank(byId.get("note")),
  });
  define({
    kind: "mind",
    family: "note",
    name: "Idea card",
    label: "Mind map",
    blurb: "A titled note for a decision or an open question.",
    section: "maps",
    layer: "note",
    tags: ["decision", "markdown", "idea"],
    title: "Untitled idea",
    size: { w: 228, h: 140 },
    lang: { id: "markdown", rawLabel: "Markdown" },
    blank: () => codedBlank(byId.get("mind")),
  });

  const tableVocab = {
    schema: {
      types: ["uuid", "text", "integer", "boolean", "timestamptz", "varchar"],
      defaults: ["", "gen_random_uuid()", "now()", "true", "false"],
      fns: ["", "primary key", "not null", "unique", "not null unique", "primary key not null"],
    },
    drizzle: {
      types: ["uuid", "text", "varchar", "serial", "integer", "boolean", "timestamp", "jsonb"],
      defaults: ["", "defaultRandom()", "defaultNow()", "default(true)", "default(false)"],
      fns: ["", "primaryKey()", "notNull()", "unique()", "primaryKey().notNull()", "notNull().unique()"],
    },
    prisma: {
      types: ["String", "Int", "Boolean", "DateTime", "Json", "Decimal", "Float", "BigInt", "Bytes"],
      defaults: ["", "uuid()", "cuid()", "now()", "autoincrement()", "true", "false"],
      fns: ["", "@id", "@unique", "@updatedAt", "@id @unique"],
    },
    kysely: {
      types: ["Generated<string>", "string", "number", "boolean", "Date", "Generated<number>"],
      defaults: [""],
      fns: [""],
    },
    convex: {
      types: ["v.string()", "v.number()", "v.boolean()", "v.id(\"users\")", "v.array(v.string())"],
      defaults: [""],
      fns: [""],
    },
  };

  function addTable(kind, name, label, blurb, vendor, tile, tags) {
    const pack = LANG[kind];
    define({
      kind,
      family: "table",
      name,
      label,
      blurb,
      vendor,
      tile: tile || "ink",
      section: "db",
      layer: "table",
      tags,
      title: kind === "prisma" ? "User" : "users",
      pipeNext: "repo",
      vocab: tableVocab[kind],
      lang: { id: pack.lang, rawLabel: pack.rawLabel },
      generate: pack.generate,
      parse: pack.parse,
      blank: () => codedBlank(byId.get(kind)),
    });
  }

  addTable("schema", "SQL table", "SQL table", "CREATE TABLE with typed columns.", "data-based", "ink", ["sql", "table"]);
  addTable("drizzle", "Drizzle table", "Drizzle", "pgTable in TypeScript.", "Drizzle", "drizzle", ["drizzle", "orm"]);
  addTable("prisma", "Prisma model", "Prisma", "A model block from schema.prisma.", "Prisma", "prisma", ["prisma", "orm"]);
  addTable("kysely", "Kysely table", "Kysely", "Typed Kysely table interface.", "Kysely", "ink", ["kysely", "query builder"]);
  addTable("convex", "Convex table", "Convex", "defineTable with Convex validators.", "Convex", "ink", ["convex", "backend"]);

  define({
    kind: "logic",
    family: "effect",
    name: "Effect",
    label: "Effect",
    blurb: "Input type, output type, and the effects inside the box.",
    section: "logic",
    layer: "logic",
    tags: ["effects", "use case"],
    title: "onSignup",
    pipeNext: "ctrl",
    addLabel: "",
    suffix: "",
    size: { w: 280, h: 164 },
    lang: { id: "effects", rawLabel: "Effects" },
    blank() {
      return {
        title: "onSignup",
        input: [{ name: "userId", type: "string", def: "", fns: "" }, { name: "email", type: "string", def: "", fns: "" }],
        output: [{ name: "ok", type: "boolean", def: "", fns: "" }],
        effects: [
          {
            type: "if",
            cond: "email",
            then: [
              { type: "action", kind: "db.write", target: "users" },
              { type: "action", kind: "http", target: "POST /invite" },
            ],
            else: [{ type: "action", kind: "throw", target: "missing email" }],
          },
        ],
        inputSrc: "type Input = {\n  userId: string\n  email: string\n}",
        outputSrc: "type Output = {\n  ok: boolean\n}",
        effectsSrc: "if email\n  db.write users\n  http POST /invite\nelse\n  throw missing email",
      };
    },
  });

  function addRoute(kind, name, label, blurb, vendor, tags, section) {
    const pack = LANG[kind];
    define({
      kind,
      family: "route",
      name,
      label,
      blurb,
      vendor,
      section: section || "api",
      layer: "controller",
      tags,
      title: kind === "ctrl" ? "CreateUser" : "users",
      vocab: { types: METHODS, defaults: ["200", "201", "204", "400", "404"], fns: [""] },
      lang: { id: pack.lang, rawLabel: pack.rawLabel },
      generate: pack.generate,
      parse: pack.parse,
      blank: () => codedBlank(byId.get(kind)),
    });
  }

  addRoute("ctrl", "Controller", "Controller", "An HTTP entry that owns a use-case.", "data-based", ["http", "controller"], "logic");
  addRoute("trpc", "tRPC router", "tRPC", "publicProcedure query and mutation routes.", "tRPC", ["trpc", "rpc"]);
  addRoute("hono", "Hono route", "Hono", "app.get / app.post on a Hono app.", "Hono", ["hono", "http"]);
  addRoute("openapi", "OpenAPI path", "OpenAPI", "YAML paths with methods and responses.", "OpenAPI", ["openapi", "swagger", "yaml"]);

  define({
    kind: "repo",
    family: "list",
    name: "Repo layout",
    label: "Repository",
    blurb: "Folders and the boundary they protect.",
    section: "repo",
    layer: "dal",
    tags: ["repository", "dal"],
    title: "src/modules",
    pipeNext: "logic",
    lang: { id: "typescript", rawLabel: "TypeScript" },
    vocab: { types: [""], defaults: [""], fns: [""] },
    generate: LANG.repo.generate,
    parse: LANG.repo.parse,
    blank: () => codedBlank(byId.get("repo")),
  });

  function addType(kind, name, label, blurb, vendor, tile, tags, vocab) {
    const pack = LANG[kind];
    define({
      kind,
      family: "type",
      name,
      label,
      blurb,
      vendor,
      tile: tile || "ink",
      section: "api",
      layer: "api",
      tags,
      title: "User",
      vocab,
      lang: { id: pack.lang, rawLabel: pack.rawLabel },
      generate: pack.generate,
      parse: pack.parse,
      blank: () => codedBlank(byId.get(kind)),
    });
  }

  addType("gql", "GraphQL type", "GraphQL", "An object type in SDL.", "GraphQL", "gql", ["graphql", "sdl"], {
    types: ["ID", "String", "Int", "Float", "Boolean", "ID!", "String!"],
    defaults: [""],
    fns: ["", "!", "[]"],
  });
  addType("zod", "Zod object", "Zod", "z.object with a chain per field.", "Zod", "ink", ["zod", "validation", "schema"], {
    types: ["string", "number", "boolean", "date", "unknown"],
    defaults: [""],
    fns: ["", "optional()", "nullable()", "email()", "uuid()", "min(1)"],
  });
  addType("proto", "Protobuf message", "Protobuf", "A proto3 message with numbered fields.", "Protocol Buffers", "ink", ["protobuf", "grpc"], {
    types: ["string", "int32", "int64", "bool", "bytes", "double"],
    defaults: [""],
    fns: ["", "repeated"],
  });

  byId.get("repo").addLabel = "Add repository";
  byId.get("repo").suffix = "Repo";
  byId.get("logic").addLabel = "Add effects";
  byId.get("logic").suffix = "Effect";
  byId.get("ctrl").addLabel = "Add controller";
  byId.get("ctrl").suffix = "Controller";

  const fallback = {
    kind: "unknown",
    family: "note",
    inline: false,
    name: "Card",
    label: "Card",
    blurb: "",
    vendor: "data-based",
    section: "maps",
    layer: "note",
    tags: [],
    title: "Untitled",
    tile: "ink",
    size: { w: 248, h: 164 },
    vocab: { types: [""], defaults: [""], fns: [""] },
    lang: { id: "text", rawLabel: "Notes" },
    mark: MARKS.note,
    pipeNext: null,
    addLabel: "",
    suffix: "",
    generate: () => "",
    parse: () => fail("No source grammar."),
    blank: () => ({ title: "Untitled", note: "" }),
  };

  function spec(kind) {
    return byId.get(kind) || { ...fallback, kind: kind || "unknown", label: kind || "Card", name: kind || "Card" };
  }

  function rowsOf(spec, body) {
    if (spec.family === "route") return body.routes || [];
    if (spec.family === "list") return body.entries || [];
    return body.fields || [];
  }

  function hydrate(kind, body) {
    const s = spec(kind);
    const b = body && typeof body === "object" ? Object.assign({}, body) : {};
    if (!b.title) b.title = s.title;
    if (s.family === "table" || s.family === "type") {
      if (b.source) {
        const parsed = s.parse(b.source);
        if (parsed.ok) {
          b.fields = parsed.fields;
          if (parsed.title) b.title = parsed.title;
        }
      }
      if (!Array.isArray(b.fields)) b.fields = idFields(s.kind);
      else b.fields = hydrateFields(s.kind, b.fields);
      if (!b.source) b.source = s.generate(b.title, b.fields);
      return b;
    }
    if (s.family === "route") {
      if (b.source) {
        const parsed = s.parse(b.source);
        if (parsed.ok) {
          b.routes = parsed.routes;
          if (parsed.title) b.title = parsed.title;
        }
      }
      if (!Array.isArray(b.routes) || !b.routes.length) b.routes = parseNoteRoutes(b.note).length ? parseNoteRoutes(b.note) : defaultRoute();
      if (!b.source) b.source = s.generate(b.title, b.routes);
      if (b.note == null) b.note = "";
      return b;
    }
    if (s.family === "list") {
      if (b.source) {
        const parsed = s.parse(b.source);
        if (parsed.ok) {
          b.entries = parsed.entries;
          if (parsed.title) b.title = parsed.title;
        }
      }
      if (!Array.isArray(b.entries) || !b.entries.length) {
        const fromNote = parseNoteEntries(b.note);
        b.entries = fromNote.length ? fromNote : [
          { name: "findById", sig: "()" },
          { name: "save", sig: "()" },
          { name: "list", sig: "()" },
        ];
      }
      if (!b.source) b.source = s.generate(b.title, b.entries);
      if (b.note == null) b.note = "";
      return b;
    }
    if (s.kind === "mind") {
      if (b.note == null) b.note = "";
      if (b.source == null) b.source = b.note;
      return b;
    }
    if (s.kind === "note" && b.note == null) b.note = "";
    return b;
  }

  function preview(card) {
    const s = spec(card && card.kind);
    const body = (card && card.body) || {};
    if (s.kind === "note" || s.inline) return "";
    if (s.family === "table" || s.family === "type") {
      return `<ul>${(body.fields || []).map((f) => `<li>${esc(f.name)} <code>${esc(f.type)}</code></li>`).join("")}</ul>`;
    }
    if (s.family === "route") {
      return `<ul>${(body.routes || []).map((r) => `<li><code>${esc(r.method)} ${esc(r.path)}</code></li>`).join("")}</ul>`;
    }
    if (s.family === "list") {
      return `<ul>${(body.entries || []).map((e) => `<li><code>${esc(e.name)}</code></li>`).join("")}</ul>`;
    }
    if (s.family === "effect") return "";
    return `<p>${esc(body.note || "")}</p>`;
  }

  function search(q) {
    const needle = String(q || "").trim().toLowerCase();
    if (!needle) return ordered.slice();
    return ordered.filter((s) => {
      const hay = [s.kind, s.name, s.label, s.vendor, s.blurb, s.lang.id, ...(s.tags || [])].join(" ").toLowerCase();
      return hay.includes(needle);
    });
  }

  function generate(kind, title, rows) {
    const s = spec(kind);
    if (typeof s.generate === "function") return s.generate(title, rows);
    return "";
  }

  function parse(kind, src) {
    const s = spec(kind);
    if (typeof s.parse === "function") return s.parse(src);
    return fail("No source grammar.");
  }

  function check() {
    const errors = [];
    for (const s of ordered) {
      if (s.family === "effect" || s.family === "note") continue;
      const body = s.blank();
      const rows = rowsOf(s, body);
      const src = generate(s.kind, body.title, rows);
      const parsed = parse(s.kind, src);
      if (!parsed.ok) errors.push(s.kind + ": " + parsed.error);
      else {
        const got = parsed.fields || parsed.routes || parsed.entries || [];
        if (got.length !== rows.length) errors.push(s.kind + ": row count " + got.length + " != " + rows.length);
      }
    }
    return errors;
  }

  const api = {
    all() { return ordered.slice(); },
    spec,
    family(kind) { return spec(kind).family; },
    blank(kind) { return spec(kind).blank(); },
    preview,
    hydrate,
    search,
    pipeNext(kind) { return spec(kind).pipeNext || null; },
    addLabel(kind) { return spec(kind).addLabel || ("Add " + spec(kind).label); },
    suffix(kind) { return spec(kind).suffix || ""; },
    size(kind) { return spec(kind).size; },
    markHtml(kind) { return spec(kind).mark; },
    generate,
    parse,
    vocab(kind) { return spec(kind).vocab; },
    lang(kind) { return spec(kind).lang; },
    label(kind) { return spec(kind).label; },
    layer(kind) { return spec(kind).layer; },
    check,
  };

  root.DataBasedKinds = api;
  root.Kinds = api;
})(typeof window !== "undefined" ? window : globalThis);
