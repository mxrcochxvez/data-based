import { getJson, persistMode, setJson } from "./backend.mjs";
import crypto from "node:crypto";

export const CONTACT_FALLBACK = "marcode.chavez.jr@gmail.com";

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function looksLikeEmail(value) {
  const e = normalizeEmail(value);
  return Boolean(e && e.includes("@") && !e.startsWith("@") && !e.endsWith("@"));
}

export function systemEmail() {
  return normalizeEmail(process.env.SYSTEM_USER_EMAIL || process.env.DATABSED_SYSTEM_EMAIL || "");
}

export function contactEmail() {
  return systemEmail() || CONTACT_FALLBACK;
}

export function isSystemHandle(handle) {
  const sys = systemEmail();
  return Boolean(sys && normalizeEmail(handle) === sys);
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
  return (doc.users || []).find((u) => normalizeEmail(u.email) === id) || null;
}

export function hasAppAccess(doc, handle) {
  const id = normalizeEmail(handle);
  if (!id) return false;
  if (isSystemHandle(id)) return true;
  if (!aclEnforced()) return true;
  const row = findAccessUser(doc, id);
  return Boolean(row && row.status === "granted");
}

export function identityFromReq(req) {
  const header = req && (req.headers["x-databased-user"] || req.headers["x-databased-email"]);
  const fromHeader = normalizeEmail(header);
  if (fromHeader && fromHeader !== "signed-out" && fromHeader !== "0" && fromHeader !== "you") {
    return fromHeader;
  }
  return "";
}

export function sessionPayload(doc, handle) {
  const email = normalizeEmail(handle);
  const row = findAccessUser(doc, email);
  const system = isSystemHandle(email);
  const granted = hasAppAccess(doc, email);
  return {
    email: email || null,
    isSystem: system,
    hasAppAccess: granted,
    status: system ? "granted" : (row && row.status) || (aclEnforced() ? "none" : "open"),
    contactEmail: contactEmail(),
    acl: aclEnforced(),
    systemEnv: Boolean(systemEmail()),
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
  const handle = identityFromReq(req);
  const doc = await readAccess(dataDir);

  const isMe = path === "/api/access" || path === "/api/access/" || path === "/api/access/me";
  const isUsers = path === "/api/access/users" || /\/users$/.test(path) || url.searchParams.get("users") === "1";
  const isBoards = path === "/api/access/boards" || /\/boards$/.test(path) || url.searchParams.get("boards") === "1";
  const isInvite = path === "/api/access/invite" || /\/invite$/.test(path);
  const isRevoke = path === "/api/access/revoke" || /\/revoke$/.test(path);

  if (req.method === "GET" && isMe && !isUsers && !isBoards) {
    send(res, 200, sessionPayload(doc, handle));
    return;
  }

  if (req.method === "GET" && !isUsers && !isBoards && !isInvite && !isRevoke) {
    send(res, 200, sessionPayload(doc, handle));
    return;
  }

  if (!handle) {
    send(res, 401, { error: "who", contactEmail: contactEmail(), hint: "Send X-DataBased-User with your email." });
    return;
  }

  if (!isSystemHandle(handle)) {
    send(res, 403, { error: "forbidden", contactEmail: contactEmail() });
    return;
  }

  if (req.method === "GET" && isUsers) {
    const users = (doc.users || []).map(publicUser);
    const sys = systemEmail();
    if (sys && !users.some((u) => u.email === sys)) {
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
      send(res, 200, { user, op: "invite" });
      return;
    }
    const user = await revokeAppAccess(dataDir, email);
    send(res, 200, { user, op: "revoke" });
  } catch (e) {
    send(res, e.status || 400, { error: e.message || "access failed", contactEmail: contactEmail() });
  }
}
