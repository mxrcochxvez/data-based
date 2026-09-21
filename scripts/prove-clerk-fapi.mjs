import {
  clerkClientConfig,
  clerkFrontendApi,
  decodePublishableKeyFrontendApi,
  encodePublishableKey,
  isVercelAppFrontendApi,
  normalizeFrontendApiHost,
} from "../web/mcp/clerk.mjs";

const keys = [
  "CLERK_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "VITE_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_FRONTEND_API",
  "NEXT_PUBLIC_CLERK_FRONTEND_API",
  "VITE_CLERK_FRONTEND_API",
];
const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));

function restore() {
  for (const k of keys) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

function setPkAndFapi(pk, fapi) {
  for (const k of keys) process.env[k] = "";
  process.env.CLERK_PUBLISHABLE_KEY = pk || "";
  process.env.CLERK_FRONTEND_API = fapi || "";
}

let failed = 0;
function check(label, ok) {
  console.log(ok ? "pass" : "fail", label);
  if (!ok) failed += 1;
}

try {
  const vercelHost = "clerk.example.vercel.app";
  const clerkHost = "example.clerk.accounts.dev";
  const vercelPk = encodePublishableKey("live", vercelHost);
  const clerkPk = encodePublishableKey("test", clerkHost);

  check("normalize strips https and path", normalizeFrontendApiHost("https://example.clerk.accounts.dev/v1/") === clerkHost);
  check("vercel.app helper", isVercelAppFrontendApi(vercelHost) && !isVercelAppFrontendApi(clerkHost));
  check("encode/decode roundtrip", decodePublishableKeyFrontendApi(clerkPk) === clerkHost);

  setPkAndFapi(vercelPk, "");
  const blocked = clerkClientConfig();
  check("vercel key without env does not advertise FAPI", !clerkFrontendApi() && blocked.frontendApi == null && blocked.clerkFapi === false);
  check("vercel key without env does not set clerkInstance to vercel.app", blocked.clerkInstance !== vercelHost && blocked.clerkInstance == null);

  setPkAndFapi(vercelPk, clerkHost);
  const overridden = clerkClientConfig();
  check("CLERK_FRONTEND_API overrides vercel.app in the key", overridden.frontendApi === clerkHost && overridden.clerkFapi === true);
  check("browser publishable key decodes to Clerk-owned host", decodePublishableKeyFrontendApi(overridden.publishableKey) === clerkHost);
  check("rewritten key is not the vercel satellite host", decodePublishableKeyFrontendApi(overridden.publishableKey) !== vercelHost);

  setPkAndFapi(clerkPk, "clerk.ghost.vercel.app");
  check("env vercel.app is ignored in favor of Clerk-owned key host", clerkFrontendApi() === clerkHost);

  setPkAndFapi(clerkPk, "");
  check("Clerk-owned key host is used when env is unset", clerkFrontendApi() === clerkHost);
} finally {
  restore();
}

if (failed) process.exit(1);
console.log("pass clerk frontend API resolution");
