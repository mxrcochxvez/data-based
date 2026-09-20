import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { extractPresentedKey, issueKey, publicUser, resetKey, userForKey, ensureUser, normalizeHandle } from "./mcp/keys.mjs";
import { findAccessible, readStore } from "./mcp/store.mjs";
import { handleJsonRpc, parseRpcBody } from "./mcp/protocol.mjs";
import { boardPng } from "./mcp/render.mjs";
import { persistHint, StoreConfigError } from "./mcp/backend.mjs";
import { aclEnforced, contactEmail, hasAppAccess, identityFromReq, isSystemHandle, readAccess } from "./mcp/access.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(ROOT, "data");
const PORT = Number(process.env.MCP_PORT || process.env.PORT) || 8766;

function send(res, status, body, headers) {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, Object.assign({
    "Content-Type": Buffer.isBuffer(body) ? "application/octet-stream" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, X-DataBased-User",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "X-Databased-Store": persistHint(),
  }, headers || {}));
  res.end(raw);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
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

function stubHandle(req) {
  const header = identityFromReq(req);
  if (header) return header;
  return normalizeHandle(req.headers["x-databased-user"]);
}

async function gateAppUser(handle, res) {
  const access = await readAccess(DATA_DIR);
  if (hasAppAccess(access, handle)) return true;
  send(res, 403, {
    error: "no_access",
    contactEmail: contactEmail(),
    message: "You do not have access to data-based. Reach out to " + contactEmail() + ".",
  });
  return false;
}

async function requireMcpUser(req, url, res) {
  const key = extractPresentedKey(req, url);
  const user = await userForKey(DATA_DIR, key);
  if (!user) {
    send(res, 401, { error: "unauthorized" });
    return null;
  }
  const access = await readAccess(DATA_DIR);
  if (!hasAppAccess(access, user.handle)) {
    send(res, 403, {
      error: "no_access",
      contactEmail: contactEmail(),
      message: "This MCP key's user does not have app access.",
    });
    return null;
  }
  user.system = isSystemHandle(user.handle);
  return user;
}

function originFrom(req) {
  const host = req.headers.host || "127.0.0.1:8765";
  const proto = req.headers["x-forwarded-proto"] || "http";
  return proto + "://" + host;
}

async function handleKeyApi(req, res, url) {
  const handle = stubHandle(req);
  if (aclEnforced() && !handle) {
    send(res, 401, { error: "who", contactEmail: contactEmail() });
    return;
  }
  if (!(await gateAppUser(handle || "you", res))) return;
  if (req.method === "GET" && url.pathname === "/api/mcp/key") {
    const user = publicUser(await ensureUser(DATA_DIR, handle));
    send(res, 200, { user });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/mcp/key") {
    const out = await issueKey(DATA_DIR, handle);
    send(res, 200, { user: out.user, key: out.key, created: out.created });
    return;
  }
  if (req.method === "POST" && (url.pathname === "/api/mcp/key/reset" || url.pathname === "/api/mcp/key/rotate")) {
    const out = await resetKey(DATA_DIR, handle);
    send(res, 200, { user: out.user, key: out.key, reset: true });
    return;
  }
  send(res, 404, { error: "not found" });
}

async function handleMcpRpc(req, res, url, user) {
  if (req.method === "GET") {
    const accept = String(req.headers.accept || "");
    if (accept.includes("text/event-stream")) {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Databased-Store": persistHint(),
      });
      res.write("event: endpoint\ndata: /mcp\n\n");
      res.end();
      return;
    }
    send(res, 200, {
      transport: "streamable-http",
      endpoint: "/mcp",
      note: "POST JSON-RPC to /mcp with Authorization: Bearer <mcp-key>. Long-lived SSE GET is not used on Vercel; this GET returns immediately.",
    });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { error: "method not allowed" });
    return;
  }
  let messages;
  try {
    messages = parseRpcBody(await readBody(req));
  } catch (_) {
    send(res, 400, { error: "invalid json" });
    return;
  }
  const ctx = {
    dataDir: DATA_DIR,
    handle: user.handle,
    user,
    system: Boolean(user.system) || isSystemHandle(user.handle),
    origin: originFrom(req),
  };
  const results = [];
  for (const msg of messages) {
    const out = await handleJsonRpc(msg, ctx);
    if (out) results.push(out);
  }
  if (results.length === 1) send(res, 200, results[0]);
  else send(res, 200, results);
}

async function handleBoardImage(req, res, url, user) {
  const m = url.pathname.match(/^\/mcp\/boards\/([^/]+)\/image$/);
  if (!m) return false;
  const store = await readStore(DATA_DIR);
  const board = findAccessible(store, user.handle, decodeURIComponent(m[1]));
  if (!board) {
    send(res, 404, { error: "board not found or not allowed" });
    return true;
  }
  const png = boardPng(board);
  send(res, 200, png, { "Content-Type": "image/png" });
  return true;
}

export function isMcpPath(urlPath) {
  const p = String(urlPath || "").split("?")[0];
  return p === "/mcp" || p === "/sse" || p.startsWith("/mcp/") || p === "/api/mcp" || p.startsWith("/api/mcp/");
}

export function rewriteMcpUrl(req) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const orig = url.searchParams.get("orig");
  if (orig) {
    url.searchParams.delete("orig");
    const next = orig.startsWith("/") ? orig : "/" + orig;
    req.url = next + (url.search || "");
    return;
  }
  if (url.pathname === "/api/mcp") {
    url.pathname = "/mcp";
    req.url = url.pathname + url.search;
  }
}

export async function handleMcpRequest(req, res) {
  rewriteMcpUrl(req);
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }
  if (url.pathname.startsWith("/api/mcp/")) {
    await handleKeyApi(req, res, url);
    return;
  }
  const user = await requireMcpUser(req, url, res);
  if (!user) return;
  if (await handleBoardImage(req, res, url, user)) return;
  if (url.pathname === "/mcp" || url.pathname === "/sse") {
    await handleMcpRpc(req, res, url, user);
    return;
  }
  send(res, 404, { error: "not found" });
}

async function stdioLoop() {
  const key = process.env.MCP_KEY || process.env.DATBASED_MCP_KEY || "";
  const user = await userForKey(DATA_DIR, key);
  if (!user) {
    console.error("MCP stdio needs MCP_KEY (Bearer secret). Wrong or missing key.");
    process.exit(1);
  }
  const access = await readAccess(DATA_DIR);
  if (!hasAppAccess(access, user.handle)) {
    console.error("MCP key's user does not have app access.");
    process.exit(1);
  }
  const ctx = { dataDir: DATA_DIR, handle: user.handle, user, system: isSystemHandle(user.handle), origin: "http://127.0.0.1:8765" };
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (_) { continue; }
    const out = await handleJsonRpc(msg, ctx);
    if (out) process.stdout.write(JSON.stringify(out) + "\n");
  }
}

function startedFromCli() {
  const self = fileURLToPath(import.meta.url);
  const argv1 = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
  try {
    return argv1 && fs.realpathSync(self) === argv1;
  } catch (_) {
    return false;
  }
}

if (startedFromCli()) {
  if (process.argv.includes("--stdio")) {
    stdioLoop();
  } else {
    http.createServer((req, res) => {
      handleMcpRequest(req, res).catch((e) => send(res, e instanceof StoreConfigError ? e.status : 500, { error: e && e.message ? e.message : "mcp failed" }));
    }).listen(PORT, "127.0.0.1", () => {
      console.log("data-based MCP on http://127.0.0.1:" + PORT + "/mcp");
    });
  }
}
