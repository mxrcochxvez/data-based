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

const bounceJson = JSON.stringify({
  flow: "sign_up",
  message: "This external account already exists.",
  oauth_provider: "oauth_google",
  reason: "external_account_exists",
  verification_id: "ver_3JcQle9jjWY7R2uRIwnoIBBFV6g",
});
const bounceSearch = "?clerk_status=" + encodeURIComponent(bounceJson);
const bounceReplaced = [];
const bounceLocation = {
  href: "https://data-based-app.vercel.app/" + bounceSearch,
  pathname: "/",
  origin: "https://data-based-app.vercel.app",
  hash: "",
  search: bounceSearch,
  replace(url) {
    bounceReplaced.push(String(url));
    this.href = String(url);
    try {
      const next = new URL(String(url), this.origin);
      this.pathname = next.pathname;
      this.search = next.search;
      this.hash = next.hash;
    } catch (_) {}
  },
};
let transferred = false;
let activated = "";
function ClerkBounce(key, opts) {
  this.frontendApi = (opts && opts.frontendApi) || "loyal-lionfish-3872.clerk.accounts.dev";
  this.user = null;
  this.session = null;
  const signIn = {
    authenticateWithRedirect: async () => {},
    create: async function () {
      transferred = true;
      this.status = "complete";
      this.createdSessionId = "sess_transferred";
      return this;
    },
  };
  this.client = {
    sessions: [],
    lastActiveSessionId: null,
    signUp: {
      isTransferable: true,
      authenticateWithRedirect: async () => {},
    },
    signIn,
  };
}
ClerkBounce.prototype.load = async function () { return this; };
ClerkBounce.prototype.addListener = function () {};
ClerkBounce.prototype.handleRedirectCallback = async function (opts) {
  if (opts && typeof opts.navigate === "function") {
    await opts.navigate("https://loyal-lionfish-3872.accounts.dev/sign-in");
  }
  const err = new Error("This external account already exists.");
  err.errors = [{ code: "external_account_exists", message: "This external account already exists." }];
  throw err;
};
ClerkBounce.prototype.setActive = async function (opts) {
  activated = opts && opts.session;
  this.session = { id: activated, getToken: async () => "tok" };
  this.user = {
    id: "user_operator",
    primaryEmailAddress: { emailAddress: "marcode.chavez.jr@gmail.com" },
  };
  return this;
};
const bounceFetch = async (url) => {
  if (String(url).includes("/api/config")) {
    return fetchFn("/api/config");
  }
  if (String(url).includes("/api/access/me")) {
    return {
      ok: true,
      json: async () => ({
        email: "marcode.chavez.jr@gmail.com",
        isSystem: true,
        hasAppAccess: true,
        verified: true,
        clerk: true,
        acl: true,
      }),
    };
  }
  return { ok: true, json: async () => ({}) };
};
const bounceSandbox = {
  window: null,
  document,
  location: bounceLocation,
  fetch: bounceFetch,
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
bounceSandbox.window = bounceSandbox;
bounceSandbox.global = bounceSandbox;
bounceSandbox.Clerk = ClerkBounce;
bounceSandbox.__clerk_frontend_api = "loyal-lionfish-3872.clerk.accounts.dev";
bounceSandbox.__databasedClerkPreload = bounceFetch("/api/config").then((res) => res.json());
vm.runInNewContext(accessSrc, bounceSandbox, { filename: "access.js" });
await bounceSandbox.DataBasedAccess.ready();
assert.equal(transferred, true, "external_account_exists must signIn.create({ transfer: true })");
assert.equal(activated, "sess_transferred", "transfer must setActive the created session");
assert.equal(
  bounceReplaced.some((url) => url.includes("/splash")),
  false,
  "existing Google user must not bounce to /splash"
);
assert.equal(
  bounceReplaced.some((url) => url.includes("accounts.dev")),
  false,
  "OAuth callback must not send the browser to Clerk Account Portal"
);
assert.equal(
  new URL(bounceLocation.href).hostname,
  "data-based-app.vercel.app",
  "OAuth callback must stay on the app origin"
);

let coldTransferred = false;
const coldLoc = {
  href: "https://data-based-app.vercel.app/splash",
  pathname: "/splash",
  origin: "https://data-based-app.vercel.app",
  hash: "",
  search: "",
  replace() {},
};
function ClerkCold() {
  this.frontendApi = "loyal-lionfish-3872.clerk.accounts.dev";
  this.user = null;
  this.session = null;
  this.client = {
    sessions: [],
    lastActiveSessionId: null,
    signUp: { isTransferable: false, authenticateWithRedirect: async () => {} },
    signIn: {
      id: "sia_3JcSDgqKyOQf50UcIw9tKbq9jIH",
      authenticateWithRedirect: async () => {},
      create: async function (opts) {
        if (opts && opts.transfer) coldTransferred = true;
        const err = new Error("There is no account to transfer");
        err.reason = "There is no account to transfer";
        throw err;
      },
    },
  };
}
ClerkCold.prototype.load = async function () { return this; };
ClerkCold.prototype.addListener = function () {};
ClerkCold.prototype.setActive = async function () { return this; };
ClerkCold.prototype.handleRedirectCallback = async function () { return this; };
const coldSandbox = {
  window: null,
  document,
  location: coldLoc,
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
coldSandbox.window = coldSandbox;
coldSandbox.global = coldSandbox;
coldSandbox.Clerk = ClerkCold;
coldSandbox.__clerk_frontend_api = "loyal-lionfish-3872.clerk.accounts.dev";
coldSandbox.__databasedClerkPreload = fetchFn("/api/config").then((res) => res.json());
vm.runInNewContext(accessSrc, coldSandbox, { filename: "access.js" });
await coldSandbox.DataBasedAccess.ready();
assert.equal(coldTransferred, false, "cold sign_in must not call signIn.create({ transfer: true })");

let signInStarted = false;
let signUpStarted = false;
const clickEls = {
  "google-signin": {
    disabled: false,
    textContent: "Sign in with Google",
    listeners: [],
    addEventListener(_type, fn) {
      this.listeners.push(fn);
    },
  },
  "google-signin-label": { textContent: "Sign in with Google" },
  "who-err": { hidden: true, textContent: "" },
  "waitlist-form": { addEventListener() {} },
};
const idleLocation = {
  href: "https://data-based-app.vercel.app/splash",
  pathname: "/splash",
  origin: "https://data-based-app.vercel.app",
  hash: "",
  search: "",
  replace() {},
};
function ClerkIdle() {
  this.frontendApi = "loyal-lionfish-3872.clerk.accounts.dev";
  this.user = null;
  this.session = null;
  this.client = {
    sessions: [],
    lastActiveSessionId: null,
    signIn: {
      authenticateWithRedirect: async () => {
        signInStarted = true;
      },
    },
    signUp: {
      authenticateWithRedirect: async () => {
        signUpStarted = true;
      },
    },
  };
}
ClerkIdle.prototype.load = async function () { return this; };
ClerkIdle.prototype.addListener = function () {};
ClerkIdle.prototype.setActive = async function () { return this; };
const idleDoc = {
  body: { classList: { toggle() {} } },
  head: { appendChild() {} },
  getElementById(id) {
    return clickEls[id] || null;
  },
  querySelector() {
    return null;
  },
  createElement() {
    return { setAttribute() {}, addEventListener() {}, style: {} };
  },
};
const idleSandbox = {
  window: null,
  document: idleDoc,
  location: idleLocation,
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
idleSandbox.window = idleSandbox;
idleSandbox.global = idleSandbox;
idleSandbox.Clerk = ClerkIdle;
idleSandbox.__clerk_frontend_api = "loyal-lionfish-3872.clerk.accounts.dev";
idleSandbox.__databasedClerkPreload = fetchFn("/api/config").then((res) => res.json());
vm.runInNewContext(accessSrc, idleSandbox, { filename: "access.js" });
await idleSandbox.DataBasedAccess.ready();
for (const fn of clickEls["google-signin"].listeners) fn();
await new Promise((resolve) => setTimeout(resolve, 20));
assert.equal(signInStarted, true, "Sign in with Google must start Clerk sign_in");
assert.equal(signUpStarted, false, "returning Google click must not start Clerk sign_up");

const loadSplash = [];
const loadLoc = {
  href: "https://data-based-app.vercel.app/",
  pathname: "/",
  origin: "https://data-based-app.vercel.app",
  hash: "",
  search: "",
  replace(url) {
    loadSplash.push(String(url));
    this.href = String(url);
  },
};
function ClerkLoading() {
  this.frontendApi = "loyal-lionfish-3872.clerk.accounts.dev";
  this.user = null;
  this.session = null;
  this.client = { sessions: [], lastActiveSessionId: null, signIn: {}, signUp: {} };
}
ClerkLoading.prototype.load = function () {
  return new Promise(function () {});
};
ClerkLoading.prototype.addListener = function () {};
const loadSandbox = {
  window: null,
  document,
  location: loadLoc,
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
loadSandbox.window = loadSandbox;
loadSandbox.global = loadSandbox;
loadSandbox.Clerk = ClerkLoading;
loadSandbox.__clerk_frontend_api = "loyal-lionfish-3872.clerk.accounts.dev";
loadSandbox.__databasedClerkPreload = fetchFn("/api/config").then((res) => res.json());
vm.runInNewContext(accessSrc, loadSandbox, { filename: "access.js" });
await new Promise((resolve) => setTimeout(resolve, 50));
assert.equal(
  loadSplash.some((url) => url.includes("/splash")),
  false,
  "logged-out / must not replace to /splash before Clerk.load finishes"
);

console.log("pass mocked Clerk user on /splash runs goApp to /");
console.log("pass external_account_exists transfers to sign-in and stays on /");
console.log("pass cold sign_in does not transfer");
console.log("pass Google click starts sign_in");
console.log("pass / waits for Clerk.load before splash redirect");
