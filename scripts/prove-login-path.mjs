import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const splash = fs.readFileSync(path.join(root, "web/splash.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const access = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const vercel = fs.readFileSync(path.join(root, "vercel.json"), "utf8");

const must = [
  [splash, "splash has Sign in with Google", /id="google-signin"/],
  [splash, "splash Google control is a button", /<button type="button" class="splash-google" id="google-signin">/],
  [splash, "splash Google button has the G mark", /splash-google-mark/],
  [splash, "splash preloads Clerk before access.js", /js\/clerk-boot\.js/],
  [splash, "splash has Request access", /id="waitlist-submit"/],
  [app, "boards page has the canvas", /id="canvas"/],
  [app, "boards page has in-app chrome", /id="chrome-brand"/],
  [access, "OAuth handshake completes on /", /redirectUrl:\s*app/],
  [access, "OAuth complete stays on /", /redirectUrlComplete:\s*app/],
  [access, "Google uses Clerk authenticateWithRedirect", /authenticateWithRedirect/],
  [access, "Google is a full-page redirect, not a popup", /signUp\.authenticateWithRedirect/],
  [access, "Clerk session leaves splash before server verify", /if \(!onAppPage\(\)\)/],
  [access, "verified session navigates to /", /function goApp\(/],
  [access, "signed-in sessions are not bounced to splash", /if \(clerkSessionPresent\(\)\) return false;/],
  [access, "Sign in with Google starts Clerk sign-in OAuth", /startGoogleOAuth\(clerk, false\)/],
  [access, "existing Google users transfer to sign-in", /function transferToSignIn\(/],
  [access, "OAuth callback must not send users to Account Portal", /isClerkAccountPortal/],
  [access, "Request access still posts the KV waitlist", /fetch\("\/api\/access\/waitlist"/],
  [vercel, "rewrites /splash to splash.html", /"source":\s*"\/splash"[\s\S]*"destination":\s*"\/splash\.html"/],
  [vercel, "aliases /app to the canvas at /", /"source":\s*"\/app"[\s\S]*"destination":\s*"\/index\.html"/],
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
console.log("pass login path /splash → Google → /");
