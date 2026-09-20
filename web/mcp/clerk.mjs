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
  };
}

function bearerToken(req) {
  const header = req && (req.headers.authorization || req.headers.Authorization || "");
  const m = String(header).match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : "";
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

export async function clerkIdentityFromRequest(req) {
  if (!clerkConfigured()) return { email: "", emails: [], userId: "", error: "clerk_unconfigured" };
  const token = bearerToken(req);
  if (!token || token.startsWith("dbk_")) return { email: "", emails: [], userId: "", error: "no_token" };
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, { secretKey: clerkSecretKey() });
    const userId = payload && payload.sub ? String(payload.sub) : "";
    let emails = emailsFromClaims(payload);
    if (!emails.length && userId) emails = await emailsForUserId(userId);
    return {
      email: emails[0] || "",
      emails,
      userId,
      error: emails.length ? "" : (userId ? "no_email" : "verify_failed"),
    };
  } catch (_) {
    return { email: "", emails: [], userId: "", error: "verify_failed" };
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
