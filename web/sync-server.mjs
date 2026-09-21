import "./mcp/env.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleMcpRequest, isMcpPath } from "./mcp-server.mjs";
import { readStore as readStoreFile, viewForUser, writeStore as writeStoreFile } from "./mcp/store.mjs";
import { persistHint, StoreConfigError } from "./mcp/backend.mjs";
import {
  aclEnforced,
  contactEmail,
  handleAccess,
  hasAppAccess,
  identityFromReq,
  isSystemHandle,
  readAccess,
  systemEmail,
  systemEnvHint,
  ensureSystemClerkUser,
} from "./mcp/access.mjs";
import { clerkClientConfig, clerkConfigured, clerkIdentityFromRequest } from "./mcp/clerk.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
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

function send(res, status, body, type, extraHeaders) {
  const raw = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, X-DataBased-User, X-Databased-User",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "X-Databased-Store": persistHint(),
  }, extraHeaders || {}));
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

async function requireAppUser(req, res) {
  const handle = await identityFromReq(req);
  if (!handle) {
    if (clerkConfigured() || aclEnforced()) {
      send(res, 401, {
        error: "who",
        contactEmail: contactEmail(),
        clerk: clerkConfigured(),
        hint: clerkConfigured() ? "Sign in with Google and send the Clerk session JWT." : "Sign in required.",
      });
      return null;
    }
    return "you";
  }
  const access = await readAccess(DATA_DIR);
  if (!hasAppAccess(access, handle)) {
    send(res, 403, {
      error: "no_access",
      contactEmail: contactEmail(),
      message: "You do not have access to data-based. Reach out to " + contactEmail() + ".",
    });
    return null;
  }
  return handle;
}

export async function handleSync(req, res) {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    const handle = await requireAppUser(req, res);
    if (!handle) return;
    if (req.method === "GET") {
      const store = await readStoreFile(DATA_DIR);
      send(res, 200, viewForUser(store, handle));
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
      const actor = isSystemHandle(handle) ? "" : handle;
      const saved = await writeStoreFile(DATA_DIR, doc, actor);
      send(res, 200, viewForUser(saved, handle));
      return;
    }
    send(res, 405, { error: "method not allowed" });
  } catch (e) {
    const status = e instanceof StoreConfigError ? e.status : 500;
    send(res, status, { error: e && e.message ? e.message : "sync failed" });
  }
}

export async function handleAccessHttp(req, res) {
  try {
    let bodyText = "";
    if (req.method === "POST" || req.method === "PUT") bodyText = await readBody(req);
    await handleAccess(req, res, send, DATA_DIR, bodyText);
  } catch (e) {
    const status = e instanceof StoreConfigError ? e.status : 500;
    send(res, status, { error: e && e.message ? e.message : "access failed" });
  }
}

const COLLAB_COLORS = [
  "#e05252", "#e08438", "#d9a429", "#2bb370",
  "#22a2c3", "#3d7be6", "#8257e5", "#cf4b9a"
];

function userColor(str) {
  let hash = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash) + s.charCodeAt(i);
  return COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];
}

export async function handleLiveblocksAuth(req, res) {
  try {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (req.method !== "POST") {
      send(res, 405, { error: "method not allowed" });
      return;
    }
    const handle = await requireAppUser(req, res);
    if (!handle) return;

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (_) {
      send(res, 400, { error: "invalid json" });
      return;
    }

    const room = body && typeof body.room === "string" ? body.room.trim() : "";
    if (!room) {
      send(res, 400, { error: "room is required" });
      return;
    }

    const boardId = room.startsWith("board:") ? room.slice(6) : room;
    if (boardId) {
      const store = await readStoreFile(DATA_DIR);
      const board = Array.isArray(store.boards) ? store.boards.find((b) => b.id === boardId) : null;
      if (board && !isSystemHandle(handle)) {
        const isOwner = Array.isArray(board.grants) && board.grants.some((g) => g.handle === handle && g.role === "owner");
        const hasGrant = Array.isArray(board.grants) && board.grants.some((g) => g.handle === handle);
        if (!isOwner && !hasGrant && aclEnforced()) {
          send(res, 403, { error: "board_access_denied", message: "You do not have access to this board." });
          return;
        }
      }
    }

    const secretKey = (process.env.LIVEBLOCKS_SECRET_KEY || "").trim();
    if (!secretKey) {
      send(res, 503, {
        error: "liveblocks_unconfigured",
        message: "LIVEBLOCKS_SECRET_KEY is not configured.",
      });
      return;
    }

    const { Liveblocks } = await import("@liveblocks/node");
    const liveblocks = new Liveblocks({ secret: secretKey });
    const ident = await clerkIdentityFromRequest(req);
    const userId = ident.userId || handle;
    const name = (handle && handle.includes("@") ? handle.split("@")[0] : handle) || "Collaborator";
    const color = userColor(handle);

    const session = liveblocks.prepareSession(userId, {
      userInfo: {
        name,
        email: handle,
        avatar: "",
        color,
      },
    });
    session.allow(room, session.FULL_ACCESS);
    const { status, body: authBody } = await session.authorize();
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, Cookie, X-DataBased-User, X-Databased-User",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    });
    res.end(authBody);
  } catch (e) {
    const status = e instanceof StoreConfigError ? e.status : 500;
    send(res, status, { error: e && e.message ? e.message : "liveblocks auth failed" });
  }
}

function safeFile(urlPath) {
  const rel = decodeURIComponent(urlPath.split("?")[0]);
  let cleaned = rel === "/" || rel === "" ? "/index.html" : rel;
  if (cleaned === "/app" || cleaned === "/app/") cleaned = "/index.html";
  if (cleaned === "/splash" || cleaned === "/splash/") cleaned = "/splash.html";
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
  if (isMcpPath(req.url)) {
    handleMcpRequest(req, res).catch((e) => {
      const status = e instanceof StoreConfigError ? e.status : 500;
      send(res, status, { error: e && e.message ? e.message : "mcp failed" });
    });
    return;
  }
  if (url === "/api/config") {
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }
    if (req.method !== "GET") {
      send(res, 405, { error: "method not allowed" });
      return;
    }
    ensureSystemClerkUser().then(() => {
      send(res, 200, {
        ...clerkClientConfig(),
        contactEmail: contactEmail(),
        systemEnv: Boolean(systemEmail()),
        systemHint: systemEnvHint(),
        liveblocksKey: Boolean(process.env.LIVEBLOCKS_SECRET_KEY || process.env.LIVEBLOCKS_PUBLIC_KEY),
        liveblocksPublicKey: process.env.LIVEBLOCKS_PUBLIC_KEY || process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY || "",
      });
    }).catch((e) => {
      send(res, 500, { error: e && e.message ? e.message : "config failed" });
    });
    return;
  }
  if (url === "/api/sync" || url === "/api/boards") {
    handleSync(req, res);
    return;
  }
  if (url === "/api/access" || url.startsWith("/api/access/")) {
    handleAccessHttp(req, res);
    return;
  }
  if (url === "/api/liveblocks-auth") {
    handleLiveblocksAuth(req, res);
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    send(res, 405, { error: "method not allowed" });
    return;
  }
  serveStatic(req, res);
});

function startedFromCli() {
  try {
    const self = fileURLToPath(import.meta.url);
    const argv1 = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
    return argv1 && fs.realpathSync(self) === argv1;
  } catch (_) {
    return false;
  }
}

if (startedFromCli()) {
  server.listen(PORT, "127.0.0.1", () => {
    console.log("data-based static + sync on http://127.0.0.1:" + PORT + "/");
    console.log("PUT/POST/GET " + "http://127.0.0.1:" + PORT + "/api/sync → " + persistHint());
    console.log("MCP " + "http://127.0.0.1:" + PORT + "/mcp  (Bearer MCP key)");
    const sys = systemEmail();
    console.log("system user " + (sys || "(unset — set SYSTEM_USER_EMAIL or DATABSED_SYSTEM_EMAIL)"));
  });
}
