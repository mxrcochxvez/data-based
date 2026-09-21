import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

process.env.STORE_BACKEND = "fs";
delete process.env.VERCEL;
process.env.SYSTEM_USER_EMAIL = "marcode.chavez.jr@gmail.com";
delete process.env.CLERK_SECRET_KEY;

const {
  enqueueWaitlist,
  grantAppAccess,
  listWaitlist,
  readAccess,
} = await import("../web/mcp/access.mjs");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "databased-waitlist-"));

const first = await enqueueWaitlist(dir, "Peer@Example.com");
assert.equal(first.ok, true);
assert.equal(first.via, "store");
assert.equal(first.status, "pending");

const again = await enqueueWaitlist(dir, "peer@example.com");
assert.equal(again.ok, false);
assert.equal(again.error, "already_waitlisted");

const operator = await enqueueWaitlist(dir, "marcode.chavez.jr@gmail.com");
assert.equal(operator.ok, false);
assert.equal(operator.error, "already_user");

await grantAppAccess(dir, "peer@example.com", "marcode.chavez.jr@gmail.com");
const doc = await readAccess(dir);
const rows = listWaitlist(doc);
assert.equal(rows[0].email, "peer@example.com");
assert.equal(rows[0].status, "invited");

const accessJs = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const accessApi = fs.readFileSync(path.join(root, "web/mcp/access.mjs"), "utf8");
const clerk = fs.readFileSync(path.join(root, "web/mcp/clerk.mjs"), "utf8");
const html = fs.readFileSync(path.join(root, "web/splash.html"), "utf8");
const boards = fs.readFileSync(path.join(root, "web/js/boards.js"), "utf8");

const must = [
  [accessJs, "posts waitlist from the splash form", /\/api\/access\/waitlist/],
  [accessJs, "shows splash for logged-out visitors", /screen-splash/],
  [accessApi, "waitlist is public before auth", /isWaitlist && req\.method === "POST"/],
  [accessApi, "waitlist does not require a session", /enqueueWaitlist/],
  [accessApi, "stores waitlist on the access document", /waitlist:/],
  [html, "keeps existing OG title", /og:title" content="Data Based — collaborative architecture boards for engineers"/],
  [html, "request access control", /waitlist-form/],
  [html, "does not promise a seat", /doesn’t guarantee a spot/],
  [html, "Sign in with Google remains", /id="google-signin"/],
  [boards, "operator waitlist list", /waitlist-list/],
];

const forbidden = [
  [accessJs, "must not keep screen-who", "screen-who"],
  [clerk, "must not call Clerk waitlist_entries", "/waitlist_entries"],
  [html, "must not mention Clerk waitlist", "Clerk waitlist"],
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
console.log("pass waitlist store + splash copy");
