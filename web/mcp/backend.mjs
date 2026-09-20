import fs from "node:fs";
import path from "node:path";

const FILES = {
  store: "store.json",
  keys: "mcp-keys.json",
  ingests: "ingests.json",
  access: "access.json",
};

const REDIS_KEYS = {
  store: "databased:v1:store",
  keys: "databased:v1:mcp-keys",
  ingests: "databased:v1:ingests",
  access: "databased:v1:access",
};

export class StoreConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "StoreConfigError";
    this.status = 503;
    this.code = "store_unconfigured";
  }
}

function hasKv() {
  return Boolean(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function hasBlob() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function forcedMode() {
  const raw = String(process.env.STORE_BACKEND || "").trim().toLowerCase();
  if (raw === "kv" || raw === "redis" || raw === "upstash") return "kv";
  if (raw === "blob") return "blob";
  if (raw === "fs" || raw === "file") return "fs";
  if (raw === "none") return "none";
  return "";
}

export function persistMode() {
  const forced = forcedMode();
  if (forced === "fs" && process.env.VERCEL) return "none";
  if (forced) return forced;
  if (hasKv()) return "kv";
  if (hasBlob()) return "blob";
  if (process.env.VERCEL) return "none";
  return "fs";
}

export function persistHint() {
  const mode = persistMode();
  if (mode === "kv") return "upstash-redis";
  if (mode === "blob") return "vercel-blob";
  if (mode === "fs") return "local-fs";
  return "unconfigured";
}

function missingStoreMessage() {
  return "No durable store configured. Vercel has no persistent disk. Set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis / Vercel KV), or BLOB_READ_WRITE_TOKEN. Refusing to write so boards are not lost.";
}

async function redis() {
  const { Redis } = await import("@upstash/redis");
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  }
  return Redis.fromEnv();
}

function filePath(kind, dataDir) {
  return path.join(dataDir, FILES[kind] || kind + ".json");
}

function readFs(kind, dataDir) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(kind, dataDir), "utf8"));
    if (raw && typeof raw === "object") return raw;
  } catch (_) {}
  return null;
}

function writeFs(kind, dataDir, doc) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dest = filePath(kind, dataDir);
  const tmp = dest + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, dest);
  return doc;
}

async function readKv(kind) {
  const client = await redis();
  const raw = await client.get(REDIS_KEYS[kind]);
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch (_) {
    return null;
  }
}

async function writeKv(kind, doc) {
  const client = await redis();
  await client.set(REDIS_KEYS[kind], doc);
  return doc;
}

async function readBlob(kind) {
  const { list } = await import("@vercel/blob");
  const name = "databased/" + FILES[kind];
  const { blobs } = await list({ prefix: name, limit: 20 });
  const hit = blobs.find((b) => b.pathname === name) || blobs[0];
  if (!hit) return null;
  const url = hit.downloadUrl || hit.url;
  const res = await fetch(url, {
    headers: { Authorization: "Bearer " + process.env.BLOB_READ_WRITE_TOKEN },
  });
  if (!res.ok) return null;
  const raw = await res.json();
  return raw && typeof raw === "object" ? raw : null;
}

async function writeBlob(kind, doc) {
  const { put } = await import("@vercel/blob");
  await put("databased/" + FILES[kind], JSON.stringify(doc), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return doc;
}

export async function getJson(kind, dataDir) {
  const mode = persistMode();
  if (mode === "kv") return readKv(kind);
  if (mode === "blob") return readBlob(kind);
  if (mode === "fs") return readFs(kind, dataDir);
  if (mode === "none") return null;
  throw new StoreConfigError(missingStoreMessage());
}

export async function setJson(kind, dataDir, doc) {
  const mode = persistMode();
  if (mode === "none") throw new StoreConfigError(missingStoreMessage());
  if (mode === "kv") return writeKv(kind, doc);
  if (mode === "blob") return writeBlob(kind, doc);
  if (mode === "fs") return writeFs(kind, dataDir, doc);
  throw new StoreConfigError(missingStoreMessage());
}
