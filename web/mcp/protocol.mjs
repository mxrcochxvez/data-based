import { handleToolCall, TOOL_DEFS } from "./tools.mjs";

const PROTOCOL = "2024-11-05";

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function fail(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handleJsonRpc(msg, ctx) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return fail(msg && msg.id != null ? msg.id : null, -32600, "Invalid Request");
  }
  const id = msg.id != null ? msg.id : null;
  const method = msg.method;
  const params = msg.params || {};

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: (params.protocolVersion && String(params.protocolVersion)) || PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "data-based", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized" || method === "initialized") {
    return null;
  }
  if (method === "ping") {
    return ok(id, {});
  }
  if (method === "tools/list") {
    return ok(id, { tools: TOOL_DEFS });
  }
  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments || {};
    if (!name) return fail(id, -32602, "Missing tool name");
    const result = await handleToolCall(name, args, ctx);
    return ok(id, result);
  }
  if (id == null) return null;
  return fail(id, -32601, "Method not found: " + method);
}

export function parseRpcBody(raw) {
  if (!raw) return [];
  const text = String(raw).trim();
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? parsed : [parsed];
}
