import { clerkClientConfig } from "../web/mcp/clerk.mjs";
import { contactEmail, ensureSystemClerkUser, systemEmail, systemEnvHint } from "../web/mcp/access.mjs";

export const config = { maxDuration: 10 };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end("");
    return;
  }
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }
  await ensureSystemClerkUser();
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({
    ...clerkClientConfig(),
    contactEmail: contactEmail(),
    systemEnv: Boolean(systemEmail()),
    systemHint: systemEnvHint(),
  }));
}
