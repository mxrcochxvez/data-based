import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const splash = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web/app.html"), "utf8");
const access = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");

const must = [
  [splash, "splash has Sign in with Google", /id="google-signin"/],
  [splash, "splash preloads Clerk before access.js", /js\/clerk-boot\.js/],
  [splash, "splash has Request access", /id="waitlist-submit"/],
  [app, "boards page has the canvas", /id="canvas"/],
  [app, "boards page has in-app chrome", /id="chrome-brand"/],
  [access, "OAuth handshake uses splash origin", /redirectUrl:\s*splash/],
  [access, "OAuth complete may land on /app", /redirectUrlComplete:\s*app/],
  [access, "Google uses Clerk authenticateWithRedirect", /authenticateWithRedirect/],
  [access, "Google is a full-page redirect, not a popup", /signUp\.authenticateWithRedirect/],
  [access, "Clerk session leaves splash before server verify", /if \(!onAppPage\(\)\)/],
  [access, "verified session navigates to /app", /function goApp\(/],
  [vercel, "rewrites /app to app.html", /"source":\s*"\/app"[\s\S]*"destination":\s*"\/app\.html"/],
  [vercel, "rewrites /app/ to app.html", /"source":\s*"\/app\/"/],
];

const forbidden = [
  [splash, "splash must not mount the live canvas", 'id="canvas"'],
  [access, "must not wait on splash for SYSTEM_USER_EMAIL before leaving", "Nobody can be the system operator until it is set on this Vercel environment"],
  [access, "must not open Google in a popup", "authenticateWithPopup"],
  [access, "must not window.open a Google popup", "window.open("],
  [vercel, "must not swallow /api/sync", '"source": "/api/sync"'],
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
console.log("pass login path / → verify → /app");
