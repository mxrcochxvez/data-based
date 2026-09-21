import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const splash = fs.readFileSync(path.join(root, "web/splash.html"), "utf8");
const app = fs.readFileSync(path.join(root, "web/index.html"), "utf8");
const accessSrc = fs.readFileSync(path.join(root, "web/js/access.js"), "utf8");

assert.match(splash, /id="google-signin"/);
assert.match(splash, /splash-google-mark/);
assert.match(splash, /id="google-signin-label"/);
assert.equal(splash.includes('id="canvas"'), false, "splash must not mount the canvas");

const bootIdx = app.indexOf("clerk-boot.js");
const accessIdx = app.indexOf("/js/access.js");
assert.ok(bootIdx >= 0, "canvas loads clerk-boot.js");
assert.ok(accessIdx > bootIdx, "clerk-boot runs before access.js");
assert.equal(
  /location\.(href|replace)\s*=/.test(app.slice(0, Math.max(accessIdx, 0))),
  false,
  "canvas HTML must not bounce to splash before clerk-boot"
);

assert.match(accessSrc, /SPLASH_PATH = "\/splash"/);
assert.match(accessSrc, /redirectUrl:\s*app/);
assert.match(accessSrc, /redirectUrlComplete:\s*app/);

const replaced = [];
const elements = {
  "google-signin": {
    disabled: false,
    textContent: "Sign in with Google",
    addEventListener() {},
  },
  "google-signin-label": {
    textContent: "Sign in with Google",
  },
  "who-err": { hidden: true, textContent: "" },
  "waitlist-form": { addEventListener() {} },
};
const location = {
  href: "https://data-based-app.vercel.app/splash",
  pathname: "/splash",
  origin: "https://data-based-app.vercel.app",
  hash: "",
  search: "",
  replace(url) {
    replaced.push(String(url));
    this.href = String(url);
    try {
      const next = new URL(String(url), this.origin);
      this.pathname = next.pathname;
      this.search = next.search;
      this.hash = next.hash;
    } catch (_) {}
  },
};
const classList = { toggle() {} };
const document = {
  body: { classList },
  head: { appendChild() {} },
  getElementById(id) {
    return elements[id] || null;
  },
  querySelector() {
    return null;
  },
  createElement() {
    return {
      setAttribute() {},
      addEventListener() {},
      style: {},
    };
  },
};
function Clerk(key, opts) {
  this.frontendApi = (opts && opts.frontendApi) || "loyal-lionfish-3872.clerk.accounts.dev";
  this.user = {
    id: "user_operator",
    primaryEmailAddress: { emailAddress: "marcode.chavez.jr@gmail.com" },
  };
  this.session = {
    id: "sess_operator",
    getToken: async () => "tok",
  };
  this.client = {
    sessions: [{ id: "sess_operator" }],
    lastActiveSessionId: "sess_operator",
    signIn: { authenticateWithRedirect: async () => {} },
    signUp: { authenticateWithRedirect: async () => {} },
  };
}
Clerk.prototype.load = async function () { return this; };
Clerk.prototype.addListener = function () {};
Clerk.prototype.setActive = async function () { return this; };
const fetchFn = async (url) => {
  if (String(url).includes("/api/config")) {
    return {
      ok: true,
      json: async () => ({
        clerk: true,
        publishableKey: "pk_test_bG95YWwtbGlvbmZpc2gtMzg3Mi5jbGVyay5hY2NvdW50cy5kZXYk",
        frontendApi: "loyal-lionfish-3872.clerk.accounts.dev",
        systemEnv: true,
        contactEmail: "marcode.chavez.jr@gmail.com",
      }),
    };
  }
  return { ok: true, json: async () => ({}) };
};

const sandbox = {
  window: null,
  document,
  location,
  fetch: fetchFn,
  Promise,
  Boolean,
  String,
  Array,
  JSON,
  URL,
  Error,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  console,
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.Clerk = Clerk;
sandbox.__clerk_frontend_api = "loyal-lionfish-3872.clerk.accounts.dev";
sandbox.__databasedClerkPreload = fetchFn("/api/config").then((res) => res.json());

vm.runInNewContext(accessSrc, sandbox, { filename: "access.js" });

await sandbox.DataBasedAccess.ready();

assert.ok(
  replaced.some((url) => /^https:\/\/data-based-app\.vercel\.app\/(\?|#|$)/.test(url)),
  "mocked Clerk user on splash must location.replace to /"
);
console.log("pass mocked Clerk user on /splash runs goApp to /");
