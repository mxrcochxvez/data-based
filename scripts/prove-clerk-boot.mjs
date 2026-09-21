import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");
const boot = fs.readFileSync(path.join(root, "web/js/clerk-boot.js"), "utf8");
const splash = fs.readFileSync(path.join(root, "web/splash.html"), "utf8");

const must = [
  ["sets window.__clerk_publishable_key before loading Clerk JS", /__clerk_publishable_key/],
  ["starts first Google with sign-in, not sign-up", /function signInGoogle\(\) \{[\s\S]*?startGoogleOAuth\(clerk, false\)/],
  ["pins Clerk load sign-in URL to the app origin", /function clerkAppLoadOpts\(/],
  ["blocks Account Portal host navigation", /function isClerkAccountPortal\(/],
  ["handleRedirectCallback sets signInUrl to the app", /handleRedirectCallback\(\s*\{[\s\S]*?signInUrl:\s*app/],
  ["shows Opening Google while Clerk JS finishes", /Opening Google/],
  ["recovers external_account_not_found with signUp.authenticateWithRedirect", /startGoogleOAuth\(clerk, true\)/],
  ["transfers existing Google users with signIn.create({ transfer: true })", /signIn\.create\(\s*\{\s*transfer:\s*true/],
  ["only transfers when sign_up is transferable", /if \(!signUpNeedsTransfer\(clerk\)\) return Promise.resolve\(clerk\)/],
  ["treats external_account_exists as a sign-in transfer", /external_account_exists/],
  ["treats identifier_already_signed_in as an existing session", /identifier_already_signed_in/],
  ["passes transferable on handleRedirectCallback", /handleRedirectCallback\(\s*\{\s*transferable:\s*true/],
  ["explains Clerk Restricted invitations in Development", /Clerk Restricted will not create a user/],
  ["keeps sign-up OAuth as the missing-account fallback", /startGoogleOAuth\(clerk, true\)/],
  ["uses signIn.authenticateWithRedirect", /signIn\.authenticateWithRedirect/],
  ["loads Clerk JS from Clerk-hosted frontend API or jsDelivr", /clerkOwnsNpm/],
  ["falls back to jsDelivr when the Frontend API is not Clerk-hosted", /cdn\.jsdelivr\.net\/npm\/@clerk\/clerk-js@5/],
  ["constructs Clerk with frontendApi so FAPI is not vercel.app", /new (?:loaded|Ctor)\(\s*key,\s*opts\s*\)/],
  ["refuses *.vercel.app as Frontend API", /vercelFapiMessage/],
  ["shows splash instead of a Sign in wall", /screen-splash/],
  ["requires a server-verified email before the invite gate", /if \(!session\.verified\)/],
  ["sends Clerk getToken as Authorization Bearer", /Authorization\s*=\s*["']Bearer /],
  ["asks Clerk getToken with skipCache", /getToken\(\s*\{\s*skipCache:\s*true/],
  ["sends cookies on access fetches", /credentials:\s*["']same-origin["']/],
];
const forbidden = [
  ["hardcodes loyal-lionfish Development Frontend API", "loyal-lionfish"],
  ["blames a missing key after Clerk JS fails", "Clerk failed to load. Check CLERK_PUBLISHABLE_KEY."],
  ["blames a missing key on the Google button", "Clerk is not ready. Set CLERK_PUBLISHABLE_KEY and refresh."],
  ["treats the browser Clerk email as server-verified", "session.email = data.email || handle()"],
  ["starts Google with sign-in only", "function googleRedirect(clerk)"],
  ["blocks the Google click on Clerk still loading", "Clerk is still starting. Try again in a moment."],
  ["opens Google in a popup", "authenticateWithPopup"],
  ["auto-starts Clerk via data-clerk-publishable-key", "data-clerk-publishable-key"],
  ["cold-load OAuth transfer", "function maybeTransferOAuth"],
  ["missing-account signUp.create transfer", "function transferOrSignUp"],
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
const existsSample = JSON.stringify({
  flow: "sign_up",
  message: "This external account already exists.",
  oauth_provider: "oauth_google",
  reason: "external_account_exists",
  verification_id: "ver_3JcQle9jjWY7R2uRIwnoIBBFV6g",
});
const existsRe = /external_account_exists|This external account already exists/i;
const existsOk = existsRe.test(existsSample) && /signIn\.create\(\s*\{\s*transfer:\s*true/.test(src);
console.log(existsOk ? "pass" : "fail", "existing Google account bounce transfers to sign-in");
if (!existsOk) failed += 1;
const restrictedSample = "sign_up_restricted: Sign-ups are restricted";
const restrictedOk = restrictedRe.test(restrictedSample);
console.log(restrictedOk ? "pass" : "fail", "Restricted sign-up errors map to invite copy");
if (!restrictedOk) failed += 1;

const bootOk = /clerkOwnsNpm/.test(boot)
  && boot.includes("cdn.jsdelivr.net/npm/@clerk/clerk-js@5")
  && /rewritePublishableKey/.test(boot)
  && /cfg\.frontendApi/.test(boot)
  && !boot.includes("data-clerk-publishable-key");
console.log(bootOk ? "pass" : "fail", "clerk-boot preloads Clerk JS without auto-start or satellite vercel.app npm");
if (!bootOk) failed += 1;
const splashOk = !splash.includes("clerk.shared.lcl.dev");
console.log(splashOk ? "pass" : "fail", "splash does not preconnect clerk.shared.lcl.dev");
if (!splashOk) failed += 1;

if (failed) process.exit(1);
