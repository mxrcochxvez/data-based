import "./env.mjs";

const emailCache = new Map();

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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

export function clerkClientConfig() {
  return {
    clerk: Boolean(clerkPublishableKey()),
    publishableKey: clerkPublishableKey() || null,
    google: true,
  };
}

function bearerToken(req) {
  const header = req && (req.headers.authorization || req.headers.Authorization || "");
  const m = String(header).match(/^Bearer\s+(\S+)/i);
  return m ? m[1] : "";
}

function emailFromClaims(payload) {
  if (!payload || typeof payload !== "object") return "";
  return normalizeEmail(
    payload.email ||
    payload.email_address ||
    payload.primary_email ||
    payload.primary_email_address ||
    (payload.user && (payload.user.email || payload.user.primary_email_address))
  );
}

async function emailForUserId(userId) {
  const id = String(userId || "");
  if (!id) return "";
  const hit = emailCache.get(id);
  if (hit && hit.exp > Date.now()) return hit.email;
  const { createClerkClient } = await import("@clerk/backend");
  const client = createClerkClient({ secretKey: clerkSecretKey() });
  const user = await client.users.getUser(id);
  const email = normalizeEmail(
    (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) ||
    (user.emailAddresses && user.emailAddresses[0] && user.emailAddresses[0].emailAddress) ||
    ""
  );
  emailCache.set(id, { email, exp: Date.now() + 60 * 1000 });
  return email;
}

export async function emailFromClerkRequest(req) {
  if (!clerkConfigured()) return "";
  const token = bearerToken(req);
  if (!token || token.startsWith("dbk_")) return "";
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, { secretKey: clerkSecretKey() });
    const fromClaims = emailFromClaims(payload);
    if (fromClaims) return fromClaims;
    return emailForUserId(payload && payload.sub);
  } catch (_) {
    return "";
  }
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
