import path from "node:path";
import crypto from "node:crypto";
import { getJson, setJson } from "./backend.mjs";
import { isSystemHandle, normalizeEmail } from "./access.mjs";

export function storePath(dataDir) {
  return path.join(dataDir, "store.json");
}

export function emptyStore() {
  return { boards: [], currentId: null, updatedAt: 0 };
}

function finiteNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstNum(vals, fallback) {
  for (let i = 0; i < vals.length; i++) {
    const n = finiteNum(vals[i]);
    if (n != null) return n;
  }
  return fallback;
}

// databased.v1 card layout: x,y,w,h (aliases left/top/width/height).
export function normalizeCard(card, prev) {
  const src = card && typeof card === "object" ? card : {};
  const old = prev && typeof prev === "object" ? prev : {};
  return {
    ...old,
    ...src,
    x: firstNum([src.x, src.left, old.x, old.left], 88),
    y: firstNum([src.y, src.top, old.y, old.top], 200),
    w: firstNum([src.w, src.width, old.w, old.width], 248),
    h: firstNum([src.h, src.height, old.h, old.height], 164),
  };
}

export function normalizeCamera(cam, prev) {
  const src = cam && typeof cam === "object" ? cam : {};
  const old = prev && typeof prev === "object" ? prev : {};
  const hasIncoming = cam && typeof cam === "object";
  const use = hasIncoming ? src : old;
  const pan = (use.pan && typeof use.pan === "object") ? use.pan : {};
  const oldPan = (old.pan && typeof old.pan === "object") ? old.pan : {};
  return {
    pan: {
      x: firstNum([pan.x, oldPan.x], 0),
      y: firstNum([pan.y, oldPan.y], 0),
    },
    zoom: firstNum([use.zoom, old.zoom], 1),
  };
}

export function normalizeBoard(board, prev) {
  const src = board && typeof board === "object" ? board : {};
  const old = prev && typeof prev === "object" ? prev : {};
  const prevCards = Array.isArray(old.cards) ? old.cards : [];
  const incoming = Array.isArray(src.cards) ? src.cards : prevCards;
  const prevById = new Map(prevCards.map((c) => [String(c && c.id), c]));
  return {
    ...old,
    ...src,
    cards: incoming.map((c) => normalizeCard(c, prevById.get(String(c && c.id)))),
    camera: normalizeCamera(src.camera, old.camera),
  };
}

function prevBoard(store, board) {
  const id = board && board.id;
  if (id == null || !store || !Array.isArray(store.boards)) return null;
  return store.boards.find((b) => String(b && b.id) === String(id)) || null;
}

// Keep the same databased.v1 blob the client PUTs: boards, currentId, updatedAt,
// plus per-board camera and per-card x,y,w,h. Missing layout is filled from the
// previous file so a partial write cannot wipe positions.
export function persistDoc(doc, prev, incomingAt) {
  const prior = prev && typeof prev === "object" ? prev : emptyStore();
  const boardsIn = Array.isArray(doc && doc.boards) ? doc.boards : [];
  const boards = boardsIn.map((b) => normalizeBoard(b, prevBoard(prior, b)));
  return {
    ...prior,
    ...(doc && typeof doc === "object" ? doc : {}),
    boards,
    currentId: (doc && doc.currentId) || (boards[0] && boards[0].id) || null,
    updatedAt: incomingAt,
  };
}

function hydrateStore(raw) {
  if (raw && typeof raw === "object") {
    const at = Number(raw.updatedAt) || 0;
    return persistDoc({
      ...raw,
      boards: Array.isArray(raw.boards) ? raw.boards : [],
      currentId: raw.currentId || null,
      updatedAt: at,
    }, emptyStore(), at);
  }
  return emptyStore();
}

export async function readStore(dataDir) {
  try {
    return hydrateStore(await getJson("store", dataDir));
  } catch (e) {
    if (e && e.status === 503) throw e;
    return emptyStore();
  }
}

export async function writeStore(dataDir, doc, actor) {
  const prev = await readStore(dataDir);
  const incomingAt = Number(doc && doc.updatedAt) || Date.now();
  const prevAt = Number(prev.updatedAt) || 0;
  if (Array.isArray(prev.boards) && prev.boards.length && incomingAt < prevAt) {
    return prev;
  }
  const next = actor && !isSystemHandle(actor)
    ? mergeScopedStore(prev, doc, actor, incomingAt)
    : persistDoc(doc, prev, incomingAt);
  await setJson("store", dataDir, next);
  return next;
}

export function uid() {
  return crypto.randomBytes(5).toString("hex");
}

export function emptyBoard(name, handle) {
  const owner = String(handle || "you").toLowerCase();
  return {
    id: uid(),
    name: name || "Board",
    cards: [],
    edges: [],
    nextId: 1,
    placeAt: { x: 88, y: 200 },
    camera: { pan: { x: 0, y: 0 }, zoom: 1 },
    grants: [{ id: "owner", handle: owner, role: "owner" }],
    updatedAt: Date.now(),
  };
}

export function grantFor(board, handle) {
  const who = String(handle || "").toLowerCase();
  const grants = (board && Array.isArray(board.grants) ? board.grants : []);
  return grants.find((g) => String(g.handle || "").toLowerCase() === who) || null;
}

export function canAccess(board, handle) {
  if (isSystemHandle(handle)) return true;
  return Boolean(grantFor(board, handle));
}

export function canOwn(board, handle) {
  if (isSystemHandle(handle)) return true;
  const g = grantFor(board, handle);
  return Boolean(g && g.role === "owner");
}

export function accessibleBoards(store, handle) {
  return (store.boards || []).filter((b) => canAccess(b, handle));
}

export function findAccessible(store, handle, boardId) {
  if (!boardId) return null;
  const board = (store.boards || []).find((b) => String(b.id) === String(boardId));
  if (!board || !canAccess(board, handle)) return null;
  return board;
}

export async function putBoard(dataDir, board) {
  const store = await readStore(dataDir);
  const i = store.boards.findIndex((b) => b.id === board.id);
  board.updatedAt = Date.now();
  if (i >= 0) store.boards[i] = board;
  else store.boards.push(board);
  if (!store.currentId) store.currentId = board.id;
  store.updatedAt = Date.now();
  return writeStore(dataDir, store);
}

export async function removeBoard(dataDir, boardId) {
  const store = await readStore(dataDir);
  store.boards = store.boards.filter((b) => b.id !== boardId);
  if (store.currentId === boardId) {
    store.currentId = store.boards[0] ? store.boards[0].id : null;
  }
  store.updatedAt = Date.now();
  return writeStore(dataDir, store);
}

export function viewForUser(store, handle) {
  if (isSystemHandle(handle)) return store;
  const boards = accessibleBoards(store, handle);
  const currentId = boards.some((b) => b.id === store.currentId)
    ? store.currentId
    : (boards[0] && boards[0].id) || null;
  return {
    boards,
    currentId,
    updatedAt: store.updatedAt,
  };
}

function forceOwner(board, handle) {
  const who = normalizeEmail(handle);
  const grants = Array.isArray(board.grants) ? board.grants.slice() : [];
  const rest = grants.filter((g) => g.role !== "owner" && normalizeEmail(g.handle) !== who);
  return {
    ...board,
    grants: [{ id: "owner", handle: who || "you", role: "owner" }].concat(rest),
  };
}

function keepOwners(prev, incoming) {
  const owners = (prev.grants || []).filter((g) => g.role === "owner");
  const ownerIds = new Set(owners.map((g) => normalizeEmail(g.handle)));
  const invited = (incoming.grants || []).filter((g) => g.role !== "owner" && !ownerIds.has(normalizeEmail(g.handle)));
  incoming.grants = owners.concat(invited);
  return incoming;
}

export function mergeScopedStore(prev, incomingDoc, handle, incomingAt) {
  const who = normalizeEmail(handle);
  const prior = prev && typeof prev === "object" ? prev : emptyStore();
  const incoming = persistDoc(incomingDoc, emptyStore(), incomingAt);
  const prevById = new Map((prior.boards || []).map((b) => [String(b.id), b]));
  const incomingIds = new Set((incoming.boards || []).map((b) => String(b && b.id)));
  const nextBoards = [];

  for (const old of prior.boards || []) {
    const id = String(old.id);
    if (canAccess(old, who) && !incomingIds.has(id)) {
      if (canOwn(old, who)) continue;
      nextBoards.push(old);
      continue;
    }
    if (!canAccess(old, who)) nextBoards.push(old);
  }

  for (const raw of incoming.boards || []) {
    const id = String(raw && raw.id);
    const old = prevById.get(id);
    if (!old) {
      nextBoards.push(forceOwner(normalizeBoard(raw, null), who));
      continue;
    }
    if (!canAccess(old, who)) continue;
    let merged = normalizeBoard(raw, old);
    if (!canOwn(old, who)) merged = keepOwners(old, merged);
    nextBoards.push(merged);
  }

  let currentId = incoming.currentId || prior.currentId;
  if (currentId && !nextBoards.some((b) => String(b.id) === String(currentId))) {
    currentId = (nextBoards[0] && nextBoards[0].id) || null;
  }

  return persistDoc({
    ...prior,
    boards: nextBoards,
    currentId,
    updatedAt: incomingAt,
  }, prior, incomingAt);
}

export function boardsByUser(store) {
  const groups = new Map();
  function bucket(email) {
    const id = normalizeEmail(email) || "unknown";
    if (!groups.has(id)) groups.set(id, { email: id, owned: [], invited: [] });
    return groups.get(id);
  }
  for (const board of store.boards || []) {
    const grants = Array.isArray(board.grants) ? board.grants : [];
    const row = {
      id: board.id,
      name: board.name || "Board",
      cards: Array.isArray(board.cards) ? board.cards.length : 0,
      updatedAt: board.updatedAt || 0,
    };
    const owners = grants.filter((g) => g.role === "owner");
    if (!owners.length) bucket("unknown").owned.push(Object.assign({}, row, { role: "owner" }));
    owners.forEach((g) => {
      bucket(g.handle).owned.push(Object.assign({}, row, { role: "owner" }));
    });
    grants.filter((g) => g.role !== "owner").forEach((g) => {
      bucket(g.handle).invited.push(Object.assign({}, row, { role: g.role || "granted" }));
    });
  }
  return [...groups.values()].sort((a, b) => String(a.email).localeCompare(String(b.email)));
}

export function summarizeBoard(board) {
  const cards = Array.isArray(board.cards) ? board.cards : [];
  const edges = Array.isArray(board.edges) ? board.edges : [];
  return {
    id: board.id,
    name: board.name,
    cards: cards.length,
    edges: edges.length,
    updatedAt: board.updatedAt || 0,
    role: (board.grants && board.grants[0] && board.grants[0].role) || "granted",
  };
}

export function cardPreview(card) {
  const body = card.body || {};
  return {
    id: card.id,
    kind: card.kind,
    title: body.title || (card.kind === "note" ? "Note" : ""),
    x: card.x,
    y: card.y,
    w: card.w,
    h: card.h,
  };
}
