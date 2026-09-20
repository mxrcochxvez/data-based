import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");

const must = [
  ["sets data-clerk-publishable-key on the Clerk script before it runs", /setAttribute\(\s*["']data-clerk-publishable-key["']/],
  ["sets window.__clerk_publishable_key before loading Clerk JS", /__clerk_publishable_key/],
  ["uses client.signIn.authenticateWithRedirect for Google", /client\.signIn/],
  ["loads Clerk JS from the instance frontend API host", /clerkScriptUrl/],
];
const forbidden = [
  ["blames a missing key after Clerk JS fails", "Clerk failed to load. Check CLERK_PUBLISHABLE_KEY."],
  ["blames a missing key on the Google button", "Clerk is not ready. Set CLERK_PUBLISHABLE_KEY and refresh."],
];

let failed = 0;
for (const [label, re] of must) {
  const ok = re.test(src);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}
for (const [label, needle] of forbidden) {
  const ok = !src.includes(needle);
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}
if (failed) process.exit(1);
