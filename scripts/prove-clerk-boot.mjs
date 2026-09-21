import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");

const must = [
  ["sets data-clerk-publishable-key on the Clerk script before it runs", /setAttribute\(\s*["']data-clerk-publishable-key["']/],
  ["sets window.__clerk_publishable_key before loading Clerk JS", /__clerk_publishable_key/],
  ["starts first Google with client.signUp.authenticateWithRedirect", /signUp\.authenticateWithRedirect/],
  ["recovers external_account_not_found by transferring to sign-up", /external_account_not_found/],
  ["passes transferable on handleRedirectCallback", /handleRedirectCallback\(\s*\{\s*transferable:\s*true/],
  ["explains Clerk Restricted invitations in Development", /Clerk Restricted will not create a user/],
  ["keeps returning-user sign-in OAuth as a fallback", /signIn\.authenticateWithRedirect/],
  ["loads Clerk JS from the instance frontend API host", /clerkScriptUrl/],
  ["shows splash instead of a Sign in wall", /screen-splash/],
  ["requires a server-verified email before the invite gate", /if \(!session\.verified\)/],
  ["sends Clerk getToken as Authorization Bearer", /Authorization\s*=\s*["']Bearer /],
  ["asks Clerk getToken with skipCache", /getToken\(\s*\{\s*skipCache:\s*true/],
  ["sends cookies on access fetches", /credentials:\s*["']same-origin["']/],
];
const forbidden = [
  ["blames a missing key after Clerk JS fails", "Clerk failed to load. Check CLERK_PUBLISHABLE_KEY."],
  ["blames a missing key on the Google button", "Clerk is not ready. Set CLERK_PUBLISHABLE_KEY and refresh."],
  ["treats the browser Clerk email as server-verified", "session.email = data.email || handle()"],
  ["starts Google with sign-in only", "function googleRedirect(clerk)"],
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
const sample = JSON.stringify({
  flow: "sign_in",
  message: "The External Account was not found.",
  oauth_provider: "oauth_google",
  reason: "external_account_not_found",
});
const missingRe = /external_account_not_found|The External Account was not found/i;
const restrictedRe = /sign_up_restricted|not_allowed_to_sign_up|invitation_required|signups?_disabled|restricted/i;
const sampleOk = missingRe.test(sample);
console.log(sampleOk ? "pass" : "fail", "sample Google bounce JSON is treated as missing external account");
if (!sampleOk) failed += 1;
const restrictedSample = "sign_up_restricted: Sign-ups are restricted";
const restrictedOk = restrictedRe.test(restrictedSample);
console.log(restrictedOk ? "pass" : "fail", "Restricted sign-up errors map to invite copy");
if (!restrictedOk) failed += 1;

if (failed) process.exit(1);
