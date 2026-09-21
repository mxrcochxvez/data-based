import "../web/mcp/env.mjs";
import { handleLiveblocksAuth } from "../web/sync-server.mjs";
import { StoreConfigError } from "../web/mcp/backend.mjs";

export const config = {
  api: { bodyParser: false },
  maxDuration: 15,
};

export default async function handler(req, res) {
  try {
    await handleLiveblocksAuth(req, res);
  } catch (e) {
    if (res.headersSent) return;
    const status = e instanceof StoreConfigError ? e.status : 500;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: e && e.message ? e.message : "liveblocks auth failed" }));
  }
}
