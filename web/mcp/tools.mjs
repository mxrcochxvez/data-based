import { createRequire } from "node:module";
import crypto from "node:crypto";
import {
  accessibleBoards,
  canOwn,
  cardPreview,
  emptyBoard,
  findAccessible,
  normalizeCamera,
  normalizeCard,
  putBoard,
  readStore,
  removeBoard,
  summarizeBoard,
} from "./store.mjs";
import { isSystemHandle } from "./access.mjs";
import { boardFromIngest, ingestSummary, normalizeIngest } from "./ingest.mjs";
import { boardPng } from "./render.mjs";
import { getJson, setJson } from "./backend.mjs";

const require = createRequire(import.meta.url);
const Export = require("../js/export.js");

async function readIngests(dataDir) {
  try {
    const raw = await getJson("ingests", dataDir);
    if (raw && Array.isArray(raw.items)) return raw;
  } catch (e) {
    if (e && e.status === 503) throw e;
  }
  return { items: [] };
}

async function writeIngests(dataDir, doc) {
  await setJson("ingests", dataDir, { items: (doc.items || []).slice(-40) });
}

async function saveIngest(dataDir, handle, spec) {
  const doc = await readIngests(dataDir);
  const id = "ing_" + crypto.randomBytes(6).toString("hex");
  doc.items.push({ id, handle, spec, createdAt: Date.now() });
  await writeIngests(dataDir, doc);
  return id;
}

async function loadIngest(dataDir, handle, id) {
  const doc = await readIngests(dataDir);
  return doc.items.find((x) => x.id === id && x.handle === handle) || null;
}

function textResult(obj) {
  return { content: [{ type: "text", text: typeof obj === "string" ? obj : JSON.stringify(obj, null, 2) }] };
}

function err(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function needBoard(ctx, boardId) {
  const store = await readStore(ctx.dataDir);
  if (boardId) {
    const board = findAccessible(store, ctx.handle, boardId);
    if (!board) return { error: err("Not allowed to access this board.") };
    return { store, board };
  }
  const mine = accessibleBoards(store, ctx.handle);
  return { store, board: mine[0] || null, mine };
}

const INGEST_PROPS = {
  name: { type: "string", description: "Board name. Do not invent a product name that is not in the repo." },
  tables: {
    type: "array",
    description: "Only tables/models that exist in the repo (Prisma/Drizzle/SQL).",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        kind: { type: "string", enum: ["prisma", "drizzle", "sql", "schema", "gql"] },
        source: { type: "string", description: "Vendor source as it appears in the repo." },
        file: { type: "string" },
        fields: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              def: { type: "string" },
              fns: { type: "string" },
            },
          },
        },
        aliases: { type: "array", items: { type: "string" } },
      },
    },
  },
  modules: {
    type: "array",
    description: "Repo / DAL folders or modules that exist.",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        path: { type: "string" },
        kind: { type: "string", enum: ["repo", "dal", "module", "service", "logic", "ctrl"] },
        note: { type: "string" },
      },
    },
  },
  effects: {
    type: "array",
    description: "Services / use-cases / effect boxes that exist.",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        input: { type: "array", items: { type: "object" } },
        output: { type: "array", items: { type: "object" } },
        effects: { type: "array" },
        note: { type: "string" },
        inputSrc: { type: "string" },
        outputSrc: { type: "string" },
        effectsSrc: { type: "string" },
      },
    },
  },
  routers: {
    type: "array",
    description: "HTTP routers / controllers that exist.",
    items: {
      type: "object",
      properties: {
        name: { type: "string" },
        path: { type: "string" },
        method: { type: "string" },
        note: { type: "string" },
      },
    },
  },
  edges: {
    type: "array",
    description: "Many-to-many arrows. from/to are card names (table, module, effect, router).",
    items: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["from", "to"],
    },
  },
  notes: {
    type: "array",
    items: {
      type: "object",
      properties: {
        title: { type: "string" },
        text: { type: "string" },
      },
    },
  },
  files: {
    type: "array",
    description: "Optional compact dump. Prefer structured tables/modules. Schema files may be parsed; do not send a whole monorepo.",
    items: {
      type: "object",
      properties: {
        path: { type: "string" },
        kind: { type: "string" },
        content: { type: "string" },
      },
    },
  },
};

export const TOOL_DEFS = [
  {
    name: "list_boards",
    description: "List boards the MCP key's user can access (owned or board-invited). A system-user key sees all boards.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_board",
    description: "Get one accessible board as databased.v1 JSON (cards with x,y,w,h, camera, edges, grants).",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
    },
  },
  {
    name: "create_board",
    description: "Create an empty board owned by the key's user.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
    },
  },
  {
    name: "delete_board",
    description: "Delete a board. Owner grant required.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
      required: ["board_id"],
    },
  },
  {
    name: "update_board",
    description: "Edit an accessible board: name, replace cards/edges, or patch_cards by id.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "string" },
        name: { type: "string" },
        cards: { type: "array", description: "Full card list. Keep x,y,w,h (or left/top/width/height) per card." },
        edges: { type: "array", description: "Full edge list replacement [{from,to}]." },
        patch_cards: { type: "array", description: "Upsert cards by id. Layout fields x,y,w,h are preserved." },
        camera: {
          type: "object",
          description: "Board camera: pan {x,y} and zoom.",
          properties: {
            zoom: { type: "number" },
            pan: {
              type: "object",
              properties: { x: { type: "number" }, y: { type: "number" } },
            },
          },
        },
      },
      required: ["board_id"],
    },
  },
  {
    name: "list_cards",
    description: "List cards on an accessible board.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
    },
  },
  {
    name: "upsert_note",
    description: "Create or update a note card on an accessible board.",
    inputSchema: {
      type: "object",
      properties: {
        board_id: { type: "string" },
        card_id: { type: "number" },
        title: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
        text: { type: "string" },
      },
    },
  },
  {
    name: "export_agent_prompt",
    description: "Return the same pstack-flavored Markdown as web/js/export.js for an accessible board.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
    },
  },
  {
    name: "get_board_image",
    description: "PNG of an accessible board, rasterized from board JSON (cards + arrows). Also returns a fetch URL that accepts the same MCP key.",
    inputSchema: {
      type: "object",
      properties: { board_id: { type: "string" } },
    },
  },
  {
    name: "ingest_codebase",
    description: "Accept architecture facts the client agent extracted from a repo. Data Based does not clone git. Send only what exists: tables, modules, effects, routers, edges, notes, and/or a compact files[] dump of schema sources. Returns ingest_id + preview. Do not invent tables that are not in the repo.",
    inputSchema: { type: "object", properties: INGEST_PROPS },
  },
  {
    name: "create_board_from_ingest",
    description: "Create a new board the key's user owns from an ingest_id or an inline ingest payload. Places cards in table → repo → effect → controller columns and wires provided edges (many-to-many).",
    inputSchema: {
      type: "object",
      properties: Object.assign({ ingest_id: { type: "string" } }, INGEST_PROPS),
    },
  },
];

function applyCardPatch(board, patch) {
  if (!patch || typeof patch !== "object") return;
  const id = patch.id != null ? patch.id : board.nextId++;
  const i = board.cards.findIndex((c) => String(c.id) === String(id));
  const prev = i >= 0 ? board.cards[i] : {
    id,
    kind: patch.kind || "note",
    x: 88,
    y: 200,
    w: 248,
    h: 164,
    z: id,
    body: {},
    links: [],
    next: null,
    prev: null,
  };
  const next = normalizeCard({
    ...patch,
    id,
    body: Object.assign({}, prev.body || {}, patch.body || {}),
  }, prev);
  if (i >= 0) board.cards[i] = next;
  else board.cards.push(next);
  if (typeof id === "number" && id >= board.nextId) board.nextId = id + 1;
}

async function callTool(name, args, ctx) {
  const a = args && typeof args === "object" ? args : {};

  if (name === "list_boards") {
    const store = await readStore(ctx.dataDir);
    return textResult({
      boards: accessibleBoards(store, ctx.handle).map((b) => {
        const row = summarizeBoard(b);
        const g = (b.grants || []).find((x) => String(x.handle).toLowerCase() === ctx.handle);
        row.role = (g && g.role) || (isSystemHandle(ctx.handle) ? "system" : "granted");
        return row;
      }),
    });
  }

  if (name === "get_board") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!found.board) return err("No accessible board.");
    return textResult(found.board);
  }

  if (name === "create_board") {
    const board = emptyBoard(a.name || "Board", ctx.handle);
    await putBoard(ctx.dataDir, board);
    return textResult({ id: board.id, name: board.name });
  }

  if (name === "delete_board") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!canOwn(found.board, ctx.handle)) return err("Owner grant required to delete this board.");
    await removeBoard(ctx.dataDir, found.board.id);
    return textResult({ deleted: found.board.id });
  }

  if (name === "update_board") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    const board = found.board;
    if (a.name) board.name = String(a.name);
    if (a.camera) board.camera = normalizeCamera(a.camera, board.camera);
    if (Array.isArray(a.cards)) {
      const prevById = new Map((board.cards || []).map((c) => [String(c && c.id), c]));
      board.cards = a.cards.map((c) => normalizeCard(c, prevById.get(String(c && c.id))));
    }
    if (Array.isArray(a.edges)) board.edges = a.edges.map((e) => ({ from: e.from, to: e.to }));
    if (Array.isArray(a.patch_cards)) a.patch_cards.forEach((p) => applyCardPatch(board, p));
    await putBoard(ctx.dataDir, board);
    return textResult({ id: board.id, name: board.name, cards: board.cards.length, edges: (board.edges || []).length });
  }

  if (name === "list_cards") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!found.board) return err("No accessible board.");
    return textResult({ board_id: found.board.id, cards: (found.board.cards || []).map(cardPreview) });
  }

  if (name === "upsert_note") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!found.board) return err("No accessible board.");
    const board = found.board;
    const existing = a.card_id != null
      ? board.cards.find((c) => String(c.id) === String(a.card_id))
      : null;
    if (existing) {
      existing.kind = "note";
      existing.body = existing.body || {};
      if (a.title != null) existing.body.title = String(a.title);
      if (a.text != null) existing.body.note = String(a.text);
      if (a.x != null) existing.x = a.x;
      if (a.y != null) existing.y = a.y;
      if (a.w != null) existing.w = a.w;
      if (a.h != null) existing.h = a.h;
      await putBoard(ctx.dataDir, board);
      return textResult({ id: existing.id, updated: true });
    }
    const id = board.nextId++;
    const notes = board.cards.filter((c) => c.kind === "note").length;
    board.cards.push({
      id,
      kind: "note",
      x: a.x != null ? a.x : 88 + notes * 28,
      y: a.y != null ? a.y : 380 + notes * 20,
      w: a.w != null ? a.w : 200,
      h: a.h != null ? a.h : 160,
      z: id,
      body: { title: a.title || "Note", note: a.text || "" },
      links: [],
      next: null,
      prev: null,
    });
    await putBoard(ctx.dataDir, board);
    return textResult({ id, created: true });
  }

  if (name === "export_agent_prompt") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!found.board) return err("No accessible board.");
    const md = Export.buildPrompt(found.board);
    return {
      content: [{ type: "text", text: md }],
    };
  }

  if (name === "get_board_image") {
    const found = await needBoard(ctx, a.board_id);
    if (found.error) return found.error;
    if (!found.board) return err("No accessible board.");
    const png = boardPng(found.board);
    const origin = ctx.origin || "http://127.0.0.1:8765";
    const url = origin + "/mcp/boards/" + found.board.id + "/image";
    return {
      content: [
        { type: "image", data: png.toString("base64"), mimeType: "image/png" },
        { type: "text", text: "PNG also at " + url + " (Authorization: Bearer <mcp-key> or ?key=)." },
      ],
    };
  }

  if (name === "ingest_codebase") {
    const spec = normalizeIngest(a);
    if (!spec.tables.length && !spec.modules.length && !spec.effects.length && !spec.routers.length && !spec.notes.length) {
      return err("Nothing to ingest. Send tables[], modules[], effects[], routers[], notes[], and/or files[] extracted from the repo. Do not invent tables.");
    }
    const ingest_id = await saveIngest(ctx.dataDir, ctx.handle, spec);
    return textResult({
      ingest_id,
      summary: ingestSummary(spec),
      preview: {
        tables: spec.tables.map((t) => t.name),
        modules: spec.modules.map((m) => m.name),
        effects: spec.effects.map((e) => e.name),
        routers: spec.routers.map((r) => r.name),
        notes: spec.notes.map((n) => n.title),
        edges: spec.edges,
      },
    });
  }

  if (name === "create_board_from_ingest") {
    let spec = null;
    if (a.ingest_id) {
      const row = await loadIngest(ctx.dataDir, ctx.handle, a.ingest_id);
      if (!row) return err("ingest_id not found for this key.");
      spec = row.spec;
    } else {
      spec = normalizeIngest(a);
    }
    if (!spec || (!spec.tables.length && !spec.modules.length && !spec.effects.length && !spec.routers.length && !spec.notes.length)) {
      return err("Provide ingest_id or the same payload as ingest_codebase.");
    }
    const { board } = boardFromIngest(spec, ctx.handle);
    await putBoard(ctx.dataDir, board);
    return textResult({
      board_id: board.id,
      name: board.name,
      cards: board.cards.length,
      edges: board.edges.length,
      layout: "table → repo → effect → controller; notes below tables",
    });
  }

  return err("Unknown tool: " + name);
}

export async function handleToolCall(name, args, ctx) {
  try {
    return await callTool(name, args, ctx);
  } catch (e) {
    return err(e && e.message ? e.message : "tool failed");
  }
}
