import "./env.mjs";

const emailCache = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function pushEmail(out, value) {
  const e = normalizeEmail(value);
  if (!e || !e.includes("@") || e.startsWith("@") || e.endsWith("@")) return;
  if (!out.includes(e)) out.push(e);
}

export function clerkPublishableKey() {
  return String(
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_PUBLIC_CLERK_PUBLISHABLE_KEY ||
    ""
  ).trim();
}

export function clerkSecretKey() {
  return String(process.env.CLERK_SECRET_KEY || "").trim();
}

export function clerkConfigured() {
  return Boolean(clerkSecretKey());
}

export function clerkKeyKind() {
  const pk = clerkPublishableKey();
  if (pk.startsWith("pk_live_")) return "live";
  if (pk.startsWith("pk_test_")) return "test";
  return "";
}

export function clerkSecretKind() {
  const sk = clerkSecretKey();
  if (sk.startsWith("sk_live_")) return "live";
  if (sk.startsWith("sk_test_")) return "test";
  return "";
}

export function clerkKeysAligned() {
  const pk = clerkKeyKind();
  const sk = clerkSecretKind();
  if (!pk || !sk) return false;
  return pk === sk;
}

export function clerkFrontendHost() {
  const pk = clerkPublishableKey();
  try {
    const encoded = pk.replace(/^pk_(test|live)_/, "");
    const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
    const host = Buffer.from(encoded + pad, "base64").toString("utf8").replace(/\$$/, "").trim();
    if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return host;
  } catch (_) {}
  return "";
}

export function clerkClientConfig() {
  const kind = clerkKeyKind();
  return {
    clerk: Boolean(clerkPublishableKey()),
    publishableKey: clerkPublishableKey() || null,
    google: true,
    clerkInstance: clerkFrontendHost() || null,
    clerkKeyKind: kind || null,
    clerkEnvLabel: kind === "live" ? "Production" : (kind === "test" ? "Development" : null),
    clerkKeysAligned: clerkKeysAligned(),
  };
}

function headerValue(req, name) {
  if (!req) return "";
  const headers = req.headers;
  if (!headers) return "";
  if (typeof headers.get === "function") return String(headers.get(name) || headers.get(name.toLowerCase()) || "");
  const direct = headers[name] || headers[name.toLowerCase()] || headers[name.replace(/-/g, "").toLowerCase()];
  if (Array.isArray(direct)) return direct.filter(Boolean).join(", ");
  return direct ? String(direct) : "";
}

export function bearerToken(req) {
  const header = headerValue(req, "authorization") || headerValue(req, "Authorization");
  const m = String(header).match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : "";
}

export function sessionCookieToken(req) {
  const cookie = headerValue(req, "cookie") || headerValue(req, "Cookie");
  if (!cookie) return "";
  const parts = String(cookie).split(/;\s*/);
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== "__session" && !name.startsWith("__session_")) continue;
    let val = part.slice(eq + 1).trim();
    try { val = decodeURIComponent(val); } catch (_) {}
    if (val && !val.startsWith("dbk_")) return val;
  }
  return "";
}

export function clerkSessionToken(req) {
  const bearer = bearerToken(req);
  if (bearer && !bearer.startsWith("dbk_")) return bearer;
  return sessionCookieToken(req);
}

function requestOrigin(req) {
  const proto = String(headerValue(req, "x-forwarded-proto") || "https").split(",")[0].trim();
  const host = String(headerValue(req, "x-forwarded-host") || headerValue(req, "host")).split(",")[0].trim();
  if (!host) return "";
  return proto + "://" + host;
}

function authorizedParties(req) {
  const out = [];
  const push = (value) => {
    const v = String(value || "").trim().replace(/\/+$/, "");
    if (v && !out.includes(v)) out.push(v);
  };
  push(process.env.PUBLIC_ORIGIN);
  push(requestOrigin(req));
  const origin = headerValue(req, "origin") || headerValue(req, "Origin");
  push(origin);
  const referer = headerValue(req, "referer") || headerValue(req, "Referer");
  try {
    if (referer) push(new URL(referer).origin);
  } catch (_) {}
  return out;
}

function nodeToWebRequest(req) {
  if (req && typeof req.headers === "object" && typeof req.headers.get === "function" && typeof req.url === "string" && /^https?:/i.test(req.url)) {
    return req;
  }
  const origin = requestOrigin(req) || "http://127.0.0.1";
  const path = req && req.url ? String(req.url) : "/";
  const headers = new Headers();
  const raw = req && req.headers && typeof req.headers === "object" ? req.headers : {};
  if (typeof raw.forEach === "function") {
    raw.forEach((value, key) => headers.set(key, value));
  } else {
    for (const key of Object.keys(raw)) {
      const val = raw[key];
      if (val == null) continue;
      headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
    }
  }
  return new Request(origin + path, { method: (req && req.method) || "GET", headers });
}

export function emailsFromClaims(payload) {
  const out = [];
  if (!payload || typeof payload !== "object") return out;
  pushEmail(out, payload.email);
  pushEmail(out, payload.email_address);
  pushEmail(out, payload.primary_email);
  pushEmail(out, payload.primary_email_address);
  if (typeof payload.username === "string" && payload.username.includes("@")) {
    pushEmail(out, payload.username);
  }
  const user = payload.user;
  if (user && typeof user === "object") {
    pushEmail(out, user.email);
    pushEmail(out, user.primary_email_address);
    const primary = user.primaryEmailAddress;
    if (typeof primary === "string") pushEmail(out, primary);
    else if (primary) pushEmail(out, primary.emailAddress || primary.email_address);
  }
  const lists = [payload.email_addresses, payload.emails, payload.emailAddresses];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === "string") pushEmail(out, item);
      else if (item && typeof item === "object") {
        pushEmail(out, item.email);
        pushEmail(out, item.email_address);
        pushEmail(out, item.emailAddress);
      }
    }
  }
  return out;
}

export function emailsFromClerkUser(user) {
  const out = [];
  if (!user || typeof user !== "object") return out;
  const primary = user.primaryEmailAddress || user.primary_email_address;
  if (typeof primary === "string") pushEmail(out, primary);
  else if (primary) pushEmail(out, primary.emailAddress || primary.email_address);
  const list = user.emailAddresses || user.email_addresses || [];
  for (const item of list) {
    if (typeof item === "string") pushEmail(out, item);
    else if (item) pushEmail(out, item.emailAddress || item.email_address || item.email);
  }
  return out;
}

async function emailsForUserId(userId) {
  const id = String(userId || "");
  if (!id) return [];
  const hit = emailCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.emails;
  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey: clerkSecretKey() });
  const user = await client.users.getUser(id);
  const emails = emailsFromClerkUser(user);
  emailCache.set(id, { emails, exp: Date.now() + 60 * 1000 });
  return emails;
}

function verifyFailedError() {
  return clerkKeysAligned() ? "verify_failed" : "key_mismatch";
}

async function identityFromPayload(payload, userIdHint) {
  const userId = userIdHint || (payload && payload.sub ? String(payload.sub) : "");
  let emails = emailsFromClaims(payload);
  if (!emails.length && userId) emails = await emailsForUserId(userId);
  return {
    email: emails[0] || "",
    emails,
    userId,
    error: emails.length ? "" : (userId ? "no_email" : verifyFailedError()),
  };
}

async function identityFromAuthenticateRequest(req) {
  const { createClerkClient } = await import("@clerk/backend");
  const secretKey = clerkSecretKey();
  const publishableKey = clerkPublishableKey();
  const client = createClerkClient({ secretKey, publishableKey });
  if (!client || typeof client.authenticateRequest !== "function") return null;
  const parties = authorizedParties(req);
  const opts = { secretKey, publishableKey };
  if (parties.length) opts.authorizedParties = parties;
  const state = await client.authenticateRequest(nodeToWebRequest(req), opts);
  if (!state) return null;
  let auth = null;
  if (typeof state.toAuth === "function") auth = state.toAuth();
  else if (state.auth) auth = state.auth;
  const userId = auth && auth.userId ? String(auth.userId) : "";
  if (!userId) return null;
  const claims = (auth && (auth.sessionClaims || auth.claims)) || {};
  return identityFromPayload(claims, userId);
}

async function identityFromSessionJwt(req) {
  const token = clerkSessionToken(req);
  if (!token) return { email: "", emails: [], userId: "", error: "no_token" };
  const { verifyToken } = await import("@clerk/backend");
  const opts = { secretKey: clerkSecretKey() };
  const jwtKey = String(process.env.CLERK_JWT_KEY || "").trim();
  if (jwtKey) opts.jwtKey = jwtKey;
  const payload = await verifyToken(token, opts);
  return identityFromPayload(payload, payload && payload.sub ? String(payload.sub) : "");
}

export async function clerkIdentityFromRequest(req) {
  if (!clerkConfigured()) return { email: "", emails: [], userId: "", error: "clerk_unconfigured" };
  if (!clerkSessionToken(req)) {
    try {
      const fromAuth = await identityFromAuthenticateRequest(req);
      if (fromAuth && (fromAuth.userId || fromAuth.email)) return fromAuth;
    } catch (_) {}
    return { email: "", emails: [], userId: "", error: "no_token" };
  }
  try {
    return await identityFromSessionJwt(req);
  } catch (_) {
    try {
      const fromAuth = await identityFromAuthenticateRequest(req);
      if (fromAuth && (fromAuth.userId || fromAuth.email)) return fromAuth;
    } catch (_) {}
    return { email: "", emails: [], userId: "", error: verifyFailedError() };
  }
}

export async function emailFromClerkRequest(req) {
  const ident = await clerkIdentityFromRequest(req);
  return ident.email || "";
}

export async function inviteClerkEmail(email) {
  const id = normalizeEmail(email);
  if (!id || !clerkConfigured()) return { invited: false, skipped: true };
  try {
    const { createClerkClient } = await import("@clerk/backend");
    const client = createClerkClient({ secretKey: clerkSecretKey() });
    await client.invitations.createInvitation({
      emailAddress: id,
      ignoreExisting: true,
    });
    return { invited: true };
  } catch (_) {
    return { invited: false };
  }
}
