import crypto from "node:crypto";
import path from "node:path";
import { getJson, setJson } from "./backend.mjs";

const KEYS_FILE = "mcp-keys.json";

function emptyDoc() {
  return { users: [] };
}

export function keysPath(dataDir) {
  return path.join(dataDir, KEYS_FILE);
}

export async function readKeys(dataDir) {
  try {
    const raw = await getJson("keys", dataDir);
    if (raw && Array.isArray(raw.users)) return raw;
  } catch (e) {
    if (e && e.status === 503) throw e;
  }
  return emptyDoc();
}

async function writeKeys(dataDir, doc) {
  const next = { users: Array.isArray(doc.users) ? doc.users : [] };
  await setJson("keys", dataDir, next);
  return next;
}

function hashKey(secret) {
  return crypto.createHash("sha256").update(String(secret), "utf8").digest("hex");
}

function newSecret() {
  const keyId = crypto.randomBytes(6).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const key = "dbk_" + keyId + "_" + secret;
  return { keyId, key, hash: hashKey(key), suffix: key.slice(-4) };
}

export function normalizeHandle(handle) {
  const h = String(handle || "").trim().toLowerCase();
  if (!h || h === "signed-out" || h === "0") return "you";
  return h;
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    handle: user.handle,
    hasKey: Boolean(user.hash),
    suffix: user.suffix || "",
    createdAt: user.createdAt || 0,
    rotatedAt: user.rotatedAt || 0,
  };
}

export async function ensureUser(dataDir, handle) {
  const id = normalizeHandle(handle);
  const doc = await readKeys(dataDir);
  let user = doc.users.find((u) => u.id === id || u.handle === id);
  if (!user) {
    user = { id, handle: id, keyId: "", hash: "", suffix: "", createdAt: 0, rotatedAt: 0 };
    doc.users.push(user);
    await writeKeys(dataDir, doc);
  }
  return user;
}

async function replaceUser(dataDir, nextUser) {
  const doc = await readKeys(dataDir);
  const i = doc.users.findIndex((u) => u.id === nextUser.id);
  if (i >= 0) doc.users[i] = nextUser;
  else doc.users.push(nextUser);
  await writeKeys(dataDir, doc);
  return nextUser;
}

export async function issueKey(dataDir, handle) {
  const id = normalizeHandle(handle);
  const existing = await ensureUser(dataDir, id);
  if (existing.hash) {
    return { user: publicUser(existing), key: null, created: false };
  }
  const minted = newSecret();
  const now = Date.now();
  const user = await replaceUser(dataDir, {
    id,
    handle: id,
    keyId: minted.keyId,
    hash: minted.hash,
    suffix: minted.suffix,
    createdAt: now,
    rotatedAt: now,
  });
  return { user: publicUser(user), key: minted.key, created: true };
}

export async function resetKey(dataDir, handle) {
  const id = normalizeHandle(handle);
  await ensureUser(dataDir, id);
  const minted = newSecret();
  const now = Date.now();
  const prev = (await readKeys(dataDir)).users.find((u) => u.id === id);
  const user = await replaceUser(dataDir, {
    id,
    handle: id,
    keyId: minted.keyId,
    hash: minted.hash,
    suffix: minted.suffix,
    createdAt: (prev && prev.createdAt) || now,
    rotatedAt: now,
  });
  return { user: publicUser(user), key: minted.key };
}

function hashesEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export async function userForKey(dataDir, presented) {
  const key = String(presented || "").trim();
  if (!key || !key.startsWith("dbk_")) return null;
  const digest = hashKey(key);
  const doc = await readKeys(dataDir);
  for (const user of doc.users) {
    if (user.hash && hashesEqual(user.hash, digest)) return user;
  }
  return null;
}

export function extractPresentedKey(req, url) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const bearer = String(header).match(/^Bearer\s+(\S+)/i);
  if (bearer) return bearer[1];
  if (url && url.searchParams) {
    return url.searchParams.get("key") || url.searchParams.get("mcp_key") || "";
  }
  return "";
}
