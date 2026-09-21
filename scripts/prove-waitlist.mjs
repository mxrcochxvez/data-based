import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const accessJs = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const accessApi = fs.readFileSync(path.join(root, "web/mcp/access.mjs"), "utf8");
const clerk = fs.readFileSync(path.join(root, "web/mcp/clerk.mjs"), "utf8");
const html = fs.readFileSync(path.join(root, "web/index.html"), "utf8");

const must = [
  [accessJs, "posts waitlist from the splash form", /\/api\/access\/waitlist/],
  [accessJs, "shows splash for logged-out visitors", /screen-splash/],
  [accessApi, "waitlist is public before auth", /isWaitlist/],
  [accessApi, "waitlist does not require a session", /requestClerkAccess/],
  [clerk, "calls Clerk waitlist_entries", /\/waitlist_entries/],
  [html, "keeps existing OG title", /og:title" content="Data Based — collaborative architecture boards for engineers"/],
  [html, "request access control", /waitlist-form/],
  [html, "Sign in with Google remains", /id="google-signin"/],
];

const forbidden = [
  [accessJs, "must not keep screen-who", "screen-who"],
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
