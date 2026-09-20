import assert from "node:assert/strict";

process.env.SYSTEM_USER_EMAIL = "  MarcoDe.Chavez.Jr@gmail.com ";
delete process.env.DATABSED_SYSTEM_EMAIL;

const {
  canonicalEmail,
  emailsMatch,
  hasAppAccess,
  isSystemHandle,
  pickIdentityEmail,
  sessionPayload,
  systemEmail,
  systemEnvHint,
} = await import("../web/mcp/access.mjs");

const sys = systemEmail();
assert.equal(sys, "marcode.chavez.jr@gmail.com");
assert.equal(systemEnvHint(), "");
assert.equal(canonicalEmail("Marco.De.Chavez.Jr+tag@Gmail.com"), "marcodechavezjr@gmail.com");
assert.equal(true, emailsMatch("marcode.chavez.jr@gmail.com", "marcodechavezjr@gmail.com"));
assert.equal(true, isSystemHandle("  MARCODE.CHAVEZ.JR@GMAIL.COM "));
assert.equal(true, isSystemHandle("marcodechavezjr@gmail.com"));
assert.equal(false, isSystemHandle("someone.else@gmail.com"));
assert.equal(false, isSystemHandle(""));

assert.equal(
  pickIdentityEmail(["user@example.com", "marcode.chavez.jr@gmail.com"]),
  "marcode.chavez.jr@gmail.com"
);
assert.equal(
  pickIdentityEmail(["not-an-email", "clerk-username"]),
  ""
);

const empty = { users: [] };
assert.equal(true, hasAppAccess(empty, "marcode.chavez.jr@gmail.com"));
assert.equal(false, hasAppAccess(empty, "invited-never@example.com"));
assert.equal(false, hasAppAccess(empty, ""));

const granted = sessionPayload(empty, "  MarcoDe.Chavez.Jr@gmail.com ");
assert.equal(granted.email, "marcode.chavez.jr@gmail.com");
assert.equal(granted.isSystem, true);
assert.equal(granted.hasAppAccess, true);
assert.equal(granted.status, "granted");
assert.equal(granted.systemEnv, true);
assert.equal(granted.verified, true);

const stranger = sessionPayload(empty, "peer@example.com");
assert.equal(stranger.isSystem, false);
assert.equal(stranger.hasAppAccess, false);
assert.equal(stranger.verified, true);

const unverified = sessionPayload(empty, "", { identityError: "verify_failed" });
assert.equal(unverified.email, null);
assert.equal(unverified.isSystem, false);
assert.equal(unverified.hasAppAccess, false);
assert.equal(unverified.verified, false);
assert.equal(unverified.identityError, "verify_failed");

const fromList = sessionPayload(empty, "", {
  emails: ["peer@example.com", "marcodechavezjr@gmail.com"],
});
assert.equal(fromList.isSystem, true);
assert.equal(fromList.hasAppAccess, true);

delete process.env.SYSTEM_USER_EMAIL;
delete process.env.DATABSED_SYSTEM_EMAIL;
assert.equal(systemEmail(), "");
assert.match(systemEnvHint(), /SYSTEM_USER_EMAIL is not set/);
const missing = sessionPayload({ users: [] }, "marcode.chavez.jr@gmail.com");
assert.equal(missing.systemEnv, false);
assert.equal(missing.isSystem, false);
assert.match(missing.systemHint, /SYSTEM_USER_EMAIL is not set/);
if (missing.acl) assert.equal(missing.hasAppAccess, false);

const { emailsFromClaims, emailsFromClerkUser } = await import("../web/mcp/clerk.mjs");
assert.deepEqual(
  emailsFromClaims({ username: "not-an-email", email: "  A@B.com " }),
  ["a@b.com"]
);
assert.deepEqual(
  emailsFromClaims({ username: "user@example.com" }),
  ["user@example.com"]
);
assert.deepEqual(
  emailsFromClerkUser({
    primaryEmailAddress: { emailAddress: "Primary@X.com" },
    emailAddresses: [{ email_address: "other@x.com" }],
  }),
  ["primary@x.com", "other@x.com"]
);

console.log("pass system access + clerk email claims");
