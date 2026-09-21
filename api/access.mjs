import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleAccess } from "../web/mcp/access.mjs";
import { persistHint, StoreConfigError } from "../web/mcp/backend.mjs";

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "data");
const MAX_BODY = 8 * 1024 * 1024;

function send(res, status, body, type, extraHeaders) {
  const raw = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, Object.assign({
    "Content-Type": type || "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Cookie, X-DataBased-User, X-Databased-User",
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

export default async function handler(req, res) {
  try {
    let bodyText = "";
    if (req.method === "POST" || req.method === "PUT") bodyText = await readBody(req);
    await handleAccess(req, res, send, DATA_DIR, bodyText);
  } catch (e) {
    if (res.headersSent) return;
    const status = e instanceof StoreConfigError ? e.status : 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: e && e.message ? e.message : "access failed" }));
  }
}
