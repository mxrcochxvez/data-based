import { getJson, persistMode, setJson } from "./backend.mjs";
import crypto from "node:crypto";
import {
  clerkClientConfig,
  clerkConfigured,
  clerkIdentityFromRequest,
  inviteClerkEmail,
} from "./clerk.mjs";

export const CONTACT_FALLBACK = "marcode.chavez.jr@gmail.com";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function looksLikeEmail(value) {
  const e = normalizeEmail(value);
  return Boolean(e && e.includes("@") && !e.startsWith("@") && !e.endsWith("@"));
}

export function canonicalEmail(value) {
  const e = normalizeEmail(value);
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0].replace(/\./g, "");
    return local + "@gmail.com";
  }
  return e;
}

export function emailsMatch(a, b) {
  const left = normalizeEmail(a);
  const right = normalizeEmail(b);
  if (!left || !right) return false;
  return left === right || canonicalEmail(left) === canonicalEmail(right);
}

export function pickIdentityEmail(emails) {
  const list = (emails || []).map(normalizeEmail).filter(looksLikeEmail);
  const seen = [];
  for (const e of list) {
    if (!seen.includes(e)) seen.push(e);
  }
  const sys = systemEmail();
  if (sys) {
    const hit = seen.find((e) => emailsMatch(e, sys));
    if (hit) return hit;
  }
  return seen[0] || "";
}

export function systemEmail() {
  return normalizeEmail(process.env.SYSTEM_USER_EMAIL || process.env.DATABSED_SYSTEM_EMAIL || "");
}

export function contactEmail() {
  return systemEmail() || CONTACT_FALLBACK;
}

export function systemEnvHint() {
  if (systemEmail()) return "";
  return "SYSTEM_USER_EMAIL is not set on this server environment. Nobody is the system operator until it is set and the app is redeployed.";
}

export function isSystemHandle(handle) {
  const sys = systemEmail();
  return Boolean(sys && emailsMatch(handle, sys));
}

let ensuredSystem = false;

export async function ensureSystemClerkUser() {
  if (ensuredSystem) return { skipped: true };
  const email = systemEmail();
  if (!email || !clerkConfigured()) return { invited: false, skipped: true };
  ensuredSystem = true;
  return inviteClerkEmail(email);
}

export function aclEnforced() {
  if (systemEmail()) return true;
  return persistMode() !== "fs";
}

function uid() {
  return crypto.randomBytes(5).toString("hex");
}

function emptyAccess() {
  return { users: [] };
}

export async function readAccess(dataDir) {
  try {
    const raw = await getJson("access", dataDir);
    if (raw && Array.isArray(raw.users)) return { users: raw.users };
  } catch (e) {
    if (e && e.status === 503) throw e;
  }
  return emptyAccess();
}

async function writeAccess(dataDir, doc) {
  const next = { users: Array.isArray(doc.users) ? doc.users : [] };
  await setJson("access", dataDir, next);
  return next;
}

export function findAccessUser(doc, email) {
  const id = normalizeEmail(email);
  return (doc.users || []).find((u) => emailsMatch(u.email, id)) || null;
}

export function hasAppAccess(doc, handle) {
  const id = normalizeEmail(handle);
  if (!id) return false;
  if (isSystemHandle(id)) return true;
  if (!aclEnforced()) return true;
  const row = findAccessUser(doc, id);
  return Boolean(row && row.status === "granted");
}

export async function identityDetailsFromReq(req) {
  if (clerkConfigured()) {
    const ident = await clerkIdentityFromRequest(req);
    const email = pickIdentityEmail(ident.emails);
    return {
      email,
      emails: ident.emails || [],
      userId: ident.userId || "",
      error: email ? "" : (ident.error || "no_token"),
    };
  }
  const header = req && (req.headers["x-databased-user"] || req.headers["x-databased-email"]);
  const fromHeader = normalizeEmail(header);
  if (fromHeader && fromHeader !== "signed-out" && fromHeader !== "0" && fromHeader !== "you") {
    return { email: fromHeader, emails: [fromHeader], userId: "", error: "" };
  }
  return { email: "", emails: [], userId: "", error: "no_token" };
}

export async function identityFromReq(req) {
  const ident = await identityDetailsFromReq(req);
  return ident.email || "";
}

export function sessionPayload(doc, handle, extra) {
  const more = extra && typeof extra === "object" ? extra : {};
  const email = pickIdentityEmail(more.emails && more.emails.length ? more.emails : [handle]);
  const row = findAccessUser(doc, email);
  const system = isSystemHandle(email);
  const granted = hasAppAccess(doc, email);
  const cfg = clerkClientConfig();
  return {
    email: email || null,
    isSystem: system,
    hasAppAccess: granted,
    status: system ? "granted" : (row && row.status) || (aclEnforced() ? "none" : "open"),
    contactEmail: contactEmail(),
    acl: aclEnforced(),
    clerk: clerkConfigured(),
    systemEnv: Boolean(systemEmail()),
    systemHint: systemEnvHint(),
    verified: Boolean(email),
    identityError: email ? "" : (more.identityError || ""),
    clerkUserId: more.clerkUserId || "",
    clerkInstance: cfg.clerkInstance,
    clerkKeyKind: cfg.clerkKeyKind,
    clerkEnvLabel: cfg.clerkEnvLabel,
  };
}

function publicUser(row) {
  return {
    email: row.email,
    status: row.status,
    grantedAt: row.grantedAt || 0,
    revokedAt: row.revokedAt || 0,
  };
}

export async function grantAppAccess(dataDir, email, actor) {
  const id = normalizeEmail(email);
  if (!looksLikeEmail(id)) {
    const err = new Error("email required");
    err.status = 400;
    throw err;
  }
  if (isSystemHandle(id)) return { email: id, status: "granted", system: true, grantedAt: 0, revokedAt: 0 };
  const doc = await readAccess(dataDir);
  const now = Date.now();
  let row = findAccessUser(doc, id);
  if (!row) {
    row = { id: uid(), email: id, status: "granted", grantedAt: now, revokedAt: 0, grantedBy: actor || "" };
    doc.users.push(row);
  } else {
    row.status = "granted";
    row.grantedAt = now;
    row.revokedAt = 0;
    row.grantedBy = actor || row.grantedBy || "";
  }
  await writeAccess(dataDir, doc);
  return publicUser(row);
}

export async function revokeAppAccess(dataDir, email) {
  const id = normalizeEmail(email);
  if (!looksLikeEmail(id)) {
    const err = new Error("email required");
    err.status = 400;
    throw err;
  }
  if (isSystemHandle(id)) {
    const err = new Error("cannot revoke the system user");
    err.status = 400;
    throw err;
  }
  const doc = await readAccess(dataDir);
  let row = findAccessUser(doc, id);
  const now = Date.now();
  if (!row) {
    row = { id: uid(), email: id, status: "revoked", grantedAt: 0, revokedAt: now, grantedBy: "" };
    doc.users.push(row);
  } else {
    row.status = "revoked";
    row.revokedAt = now;
  }
  await writeAccess(dataDir, doc);
  return publicUser(row);
}

function accessPath(req) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const orig = url.searchParams.get("orig");
  return orig || url.pathname;
}

export async function handleAccess(req, res, send, dataDir, bodyText) {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = accessPath(req);
  const ident = await identityDetailsFromReq(req);
  const handle = ident.email || "";
  const doc = await readAccess(dataDir);
  await ensureSystemClerkUser();

  const isMe = path === "/api/access" || path === "/api/access/" || path === "/api/access/me";
  const isUsers = path === "/api/access/users" || /\/users$/.test(path) || url.searchParams.get("users") === "1";
  const isBoards = path === "/api/access/boards" || /\/boards$/.test(path) || url.searchParams.get("boards") === "1";
  const isInvite = path === "/api/access/invite" || /\/invite$/.test(path);
  const isRevoke = path === "/api/access/revoke" || /\/revoke$/.test(path);

  const meExtra = {
    emails: ident.emails,
    identityError: ident.error,
    clerkUserId: ident.userId,
  };

  if (req.method === "GET" && isMe && !isUsers && !isBoards) {
    send(res, 200, sessionPayload(doc, handle, meExtra));
    return;
  }

  if (req.method === "GET" && !isUsers && !isBoards && !isInvite && !isRevoke) {
    send(res, 200, sessionPayload(doc, handle, meExtra));
    return;
  }

  if (!handle) {
    send(res, 401, {
      error: "who",
      contactEmail: contactEmail(),
      clerk: clerkConfigured(),
      hint: clerkConfigured() ? "Sign in with Google (Clerk session JWT)." : "Send a Clerk Bearer token.",
    });
    return;
  }

  if (!isSystemHandle(handle)) {
    send(res, 403, { error: "forbidden", contactEmail: contactEmail() });
    return;
  }

  if (req.method === "GET" && isUsers) {
    const users = (doc.users || []).map(publicUser);
    const sys = systemEmail();
    if (sys && !users.some((u) => emailsMatch(u.email, sys))) {
      users.unshift({ email: sys, status: "granted", grantedAt: 0, revokedAt: 0, system: true });
    }
    send(res, 200, { users, contactEmail: contactEmail() });
    return;
  }

  if (req.method === "GET" && isBoards) {
    const { boardsByUser, readStore } = await import("./store.mjs");
    const store = await readStore(dataDir);
    send(res, 200, { users: boardsByUser(store), contactEmail: contactEmail() });
    return;
  }

  if (req.method !== "POST" && req.method !== "PUT") {
    send(res, 405, { error: "method not allowed" });
    return;
  }

  if (!isInvite && !isRevoke) {
    send(res, 404, { error: "not found" });
    return;
  }

  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch (_) {
    send(res, 400, { error: "invalid json" });
    return;
  }
  const email = body.email || body.handle;
  try {
    if (isInvite) {
      const user = await grantAppAccess(dataDir, email, handle);
      const clerk = await inviteClerkEmail(email);
      send(res, 200, { user, op: "invite", clerkInvited: Boolean(clerk.invited) });
      return;
    }
    const user = await revokeAppAccess(dataDir, email);
    send(res, 200, { user, op: "revoke" });
  } catch (e) {
    send(res, e.status || 400, { error: e.message || "access failed", contactEmail: contactEmail() });
  }
}
