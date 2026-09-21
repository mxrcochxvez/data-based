import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const splash = fs.readFileSync(path.join(root, "web/splash.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const access = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
const server = fs.readFileSync(path.join(root, "web/sync-server.mjs"), "utf8");

const must = [
  [splash, "splash lives at /splash", /id="screen-splash"/],
  [splash, "splash does not load the canvas app", /src="\/js\/access\.js"/],
  [app, "canvas lives at /", /id="canvas"/],
  [app, "app wordmark points at /", /href="\/"/],
  [access, "Google complete returns to /", /redirectUrlComplete:\s*app/],
  [access, "Google uses a full-page redirect", /authenticateWithRedirect/],
  [access, "allowed session leaves splash", /function goApp\(/],
  [vercel, "Vercel rewrite for /splash", /"source":\s*"\/splash"/],
  [server, "local server maps /splash", /cleaned === "\/splash"/],
  [server, "local server maps /app to canvas", /cleaned === "\/app"/],
];

const forbidden = [
  [splash, "splash must not mount the live canvas", 'id="canvas"'],
  [access, "must not open Google in a popup", "authenticateWithPopup"],
  [vercel, "must not swallow /api/sync", '"source": "/api/sync"'],
  [vercel, "must not swallow /mcp", '"source": "/mcp", "destination": "/app'],
];

let failed = 0;
for (const [src, label, re] of must) {
  const ok = typeof re === "string" ? src.includes(re) : re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}
for (const [src, label, needle] of forbidden) {
  const ok = !src.includes(needle);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

if (failed) process.exit(1);
console.log("pass / canvas vs /splash");
