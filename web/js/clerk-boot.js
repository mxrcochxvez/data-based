/* Start Clerk JS as soon as /api/config returns a key. Do not wait for access.js. */
(function (global) {
  const FALLBACK_JS = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

  function normalizeFrontendApiHost(value) {
    let raw = String(value || "").trim();
    if (!raw) return "";
    try {
      if (/^https?:\/\//i.test(raw)) raw = new URL(raw).hostname;
      else raw = raw.split("/")[0];
    } catch (_) {
      return "";
    }
    raw = raw.replace(/\.$/, "").toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(raw)) return "";
    return raw;
  }

  function clerkFrontendHost(pk) {
    try {
      const encoded = String(pk || "").replace(/^pk_(test|live)_/, "");
      const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
      const host = atob(encoded + pad).replace(/\$$/, "").trim();
      return normalizeFrontendApiHost(host);
    } catch (_) {}
    return "";
  }

  function isVercelAppFrontendApi(host) {
    return /\.vercel\.app$/i.test(String(host || ""));
  }

  function clerkOwnsNpm(host) {
    return /(^|\.)clerk\.accounts\.dev$/i.test(host)
      || /^clerk\.shared\.lcl\.dev$/i.test(host)
      || /(^|\.)lclclerk\.com$/i.test(host)
      || /(^|\.)clerk\.services$/i.test(host);
  }

  function usableFrontendApi(cfg, pk) {
    const fromCfg = normalizeFrontendApiHost(cfg && cfg.frontendApi);
    if (fromCfg && !isVercelAppFrontendApi(fromCfg)) return fromCfg;
    const fromKey = clerkFrontendHost(pk);
    if (fromKey && !isVercelAppFrontendApi(fromKey)) return fromKey;
    return "";
  }

  function rewritePublishableKey(pk, frontendApi) {
    const host = normalizeFrontendApiHost(frontendApi);
    if (!pk || !host || isVercelAppFrontendApi(host)) return pk;
    if (clerkFrontendHost(pk) === host) return pk;
    const kind = /^pk_test_/.test(pk) ? "pk_test_" : "pk_live_";
    let payload = "";
    try {
      payload = btoa(host + "$").replace(/=+$/, "");
    } catch (_) {
      return pk;
    }
    return kind + payload;
  }

  function clerkScriptUrl(host) {
    if (host && clerkOwnsNpm(host)) {
      return "https://" + host + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    }
    return FALLBACK_JS;
  }

  function inject(pk, href, frontendApi) {
    const key = rewritePublishableKey(pk, frontendApi);
    global.__clerk_publishable_key = key;
    global.__clerk_frontend_api = frontendApi || "";
    const src = href || FALLBACK_JS;
    if (src) {
      const pre = document.createElement("link");
      pre.rel = "preconnect";
      try { pre.href = new URL(src).origin; } catch (_) { pre.href = src; }
      pre.crossOrigin = "anonymous";
      document.head.appendChild(pre);
      const preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "script";
      preload.href = src;
      preload.crossOrigin = "anonymous";
      document.head.appendChild(preload);
    }
    if (document.querySelector("script[data-clerk-js]")) return;
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.crossOrigin = "anonymous";
    s.dataset.clerkJs = "1";
    // Preload only. Do not auto-instantiate Clerk here: that uses Account Portal
    // sign-in URLs and hijacks Google return onto *.accounts.dev/sign-in.
    s.fetchPriority = "high";
    s.onerror = function () {
      if (s.src === FALLBACK_JS) return;
      s.src = FALLBACK_JS;
    };
    document.head.appendChild(s);
  }

  global.__databasedClerkPreload = fetch("/api/config", { credentials: "same-origin" })
    .then(function (res) { return res.ok ? res.json() : null; })
    .then(function (cfg) {
      global.__databasedClerkCfg = cfg || null;
      if (cfg && cfg.publishableKey) {
        const fapi = usableFrontendApi(cfg, cfg.publishableKey);
        inject(cfg.publishableKey, clerkScriptUrl(fapi), fapi);
      }
      return cfg;
    })
    .catch(function () { return null; });
})(window);
