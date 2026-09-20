import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const STORE = path.join(DATA_DIR, "store.json");
const PORT = Number(process.env.PORT) || 8765;
const MAX_BODY = 8 * 1024 * 1024;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function emptyStore() {
  return { boards: [], currentId: null, updatedAt: 0 };
}

function readStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(STORE, "utf8"));
    if (raw && typeof raw === "object") return raw;
  } catch (_) {}
  return emptyStore();
}

function writeStore(doc) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const prev = readStore();
  const incomingAt = Number(doc.updatedAt) || Date.now();
  const prevAt = Number(prev.updatedAt) || 0;
  if (Array.isArray(prev.boards) && prev.boards.length && incomingAt < prevAt) {
    return prev;
  }
  const next = {
    boards: Array.isArray(doc.boards) ? doc.boards : [],
    currentId: doc.currentId || (doc.boards && doc.boards[0] && doc.boards[0].id) || null,
    updatedAt: incomingAt,
  };
  fs.writeFileSync(STORE, JSON.stringify(next, null, 2));
  return next;
}

function send(res, status, body, type) {
  const raw = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleSync(req, res) {
  if (req.method === "GET") {
    send(res, 200, readStore());
    return;
  }
  if (req.method === "PUT" || req.method === "POST") {
    let doc;
    try {
      doc = JSON.parse(await readBody(req));
    } catch (_) {
      send(res, 400, { error: "invalid json" });
      return;
    }
    if (!doc || typeof doc !== "object" || !Array.isArray(doc.boards)) {
      send(res, 400, { error: "expected { boards, currentId, updatedAt }" });
      return;
    }
    send(res, 200, writeStore(doc));
    return;
  }
  send(res, 405, { error: "method not allowed" });
}

function safeFile(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  const cleaned = rel === "/" ? "/index.html" : rel;
  const abs = path.normalize(path.join(ROOT, cleaned));
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

function serveStatic(req, res) {
  const file = safeFile(req.url || "/");
  if (!file) {
    send(res, 403, { error: "forbidden" });
    return;
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      send(res, 404, { error: "not found" });
      return;
    }
    const type = TYPES[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  if (url === "/api/sync" || url === "/api/boards") {
    handleSync(req, res).catch(() => send(res, 500, { error: "sync failed" }));
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { error: "method not allowed" });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("data-based static + sync on http://127.0.0.1:" + PORT + "/");
  console.log("PUT/POST/GET " + "http://127.0.0.1:" + PORT + "/api/sync → web/data/store.json");
});
