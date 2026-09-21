/* Start Clerk JS as soon as /api/config returns a key. Do not wait for access.js. */
(function (global) {
  const FALLBACK_JS = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

  function clerkFrontendHost(pk) {
    try {
      const encoded = String(pk || "").replace(/^pk_(test|live)_/, "");
      const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
      const host = atob(encoded + pad).replace(/\$$/, "").trim();
      if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) return host;
    } catch (_) {}
    return "";
  }

  function clerkOwnsNpm(host) {
    return /(^|\.)clerk\.accounts\.dev$/i.test(host)
      || /^clerk\.shared\.lcl\.dev$/i.test(host)
      || /(^|\.)lclclerk\.com$/i.test(host)
      || /(^|\.)clerk\.services$/i.test(host);
  }

  function clerkScriptUrl(pk) {
    const host = clerkFrontendHost(pk);
    if (host && clerkOwnsNpm(host)) {
      return "https://" + host + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
    }
    return FALLBACK_JS;
  }

  function inject(pk, href) {
    global.__clerk_publishable_key = pk;
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
    s.setAttribute("data-clerk-publishable-key", pk);
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
      if (cfg && cfg.publishableKey) inject(cfg.publishableKey, clerkScriptUrl(cfg.publishableKey));
      return cfg;
    })
    .catch(function () { return null; });
})(window);
