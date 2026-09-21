/* Clerk Google sign-in + app-access gate. Board invite is separate (boards.js). */
(function (global) {
  const CONTACT = "marcode.chavez.jr@gmail.com";
  const CLERK_JS = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

  const APP_PATH = "/app";

  function $(id) {
    return document.getElementById(id);
  }

  function pagePath() {
    return String(location.pathname || "/").replace(/\/+$/, "") || "/";
  }

  function onAppPage() {
    const p = pagePath();
    return p === APP_PATH || p === "/app.html" || /\/app\/index\.html$/.test(p);
  }

  function appUrl() {
    return window.location.origin + APP_PATH;
  }

  function splashUrl() {
    return window.location.origin + "/";
  }

  function goApp() {
    if (onAppPage()) return false;
    location.replace(appUrl());
    return true;
  }

  function goSplash() {
    if (!onAppPage()) return false;
    location.replace(splashUrl());
    return true;
  }

  function clerkEmail() {
    try {
      const u = global.Clerk && global.Clerk.user;
      if (!u) return "";
      const primary = u.primaryEmailAddress && u.primaryEmailAddress.emailAddress;
      if (primary) return String(primary).trim().toLowerCase();
      const first = u.emailAddresses && u.emailAddresses[0] && u.emailAddresses[0].emailAddress;
      return first ? String(first).trim().toLowerCase() : "";
    } catch (_) {
      return "";
    }
  }

  function handle() {
    return clerkEmail();
  }

  async function headers() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    try {
      const clerk = global.Clerk;
      if (clerk && clerk.user && !clerk.session) {
        const sessions = clerk.client && clerk.client.sessions;
        const sid = (clerk.client && clerk.client.lastActiveSessionId)
          || (sessions && sessions[0] && sessions[0].id);
        if (sid && typeof clerk.setActive === "function") {
          await clerk.setActive({ session: sid });
        }
      }
      if (clerk && clerk.session && typeof clerk.session.getToken === "function") {
        const token = await clerk.session.getToken({ skipCache: true });
        if (token) h.Authorization = "Bearer " + token;
      }
    } catch (_) {}
    return h;
  }

  const session = {
    email: null,
    isSystem: false,
    hasAppAccess: false,
    contactEmail: CONTACT,
    acl: false,
    clerk: false,
    ready: false,
    denied: false,
    systemEnv: false,
    verified: false,
    identityError: "",
    clerkInstance: "",
    clerkKeyKind: "",
    clerkEnvLabel: "",
    clerkUserId: "",
  };

  let resolveReady = null;
  const readyPromise = new Promise((resolve) => { resolveReady = resolve; });
  let clerkPk = "";
  let clerkFapi = "";
  let clerkStatus = "off";
  let clerkFail = "";

  function setBodyGate(name) {
    const splash = $("screen-splash");
    const denied = $("screen-denied");
    const auth = $("screen-auth");
    if (splash) splash.hidden = name !== "who";
    if (denied) denied.hidden = name !== "denied";
    if (auth) auth.hidden = name !== "who";
    const gated = name === "who" || name === "denied";
    document.body.classList.toggle("is-gated", gated);
    document.body.classList.toggle("is-splash", name === "who" && !onAppPage());
    document.body.classList.toggle("is-denied", name === "denied");
    const scroller = $("scroller");
    if (scroller) scroller.setAttribute("aria-hidden", gated ? "true" : scroller.getAttribute("aria-hidden") || "false");
    const tools = $("chrome-tools");
    if (tools) tools.setAttribute("aria-hidden", gated ? "true" : "false");
    const brand = $("chrome-brand");
    if (brand && gated) brand.setAttribute("aria-hidden", "true");
    else if (brand) brand.removeAttribute("aria-hidden");
  }

  function paintChrome() {
    const people = $("people-link");
    const whoLabel = $("who-label");
    const signOut = $("sign-out");
    if (people) people.hidden = !session.isSystem;
    if (whoLabel) {
      whoLabel.hidden = !session.email;
      whoLabel.textContent = session.email || "";
    }
    if (signOut) signOut.hidden = !session.email && !(global.Clerk && global.Clerk.user);
  }

  function clerkSessionPresent() {
    try {
      const clerk = global.Clerk;
      return Boolean(clerk && (clerk.user || clerk.session));
    } catch (_) {
      return false;
    }
  }

  function activateSession(clerk) {
    if (!clerk || clerkSessionPresent()) return Promise.resolve(clerk);
    const sessions = clerk.client && clerk.client.sessions;
    const sid = (clerk.client && clerk.client.lastActiveSessionId)
      || (sessions && sessions[0] && sessions[0].id);
    if (sid && typeof clerk.setActive === "function") {
      return clerk.setActive({ session: sid }).then(function () { return clerk; }).catch(function () { return clerk; });
    }
    return Promise.resolve(clerk);
  }

  function waitForSession(clerk, ms) {
    if (clerkSessionPresent()) return Promise.resolve(clerk);
    return new Promise(function (resolve) {
      let settled = false;
      const done = function () {
        if (settled) return;
        settled = true;
        resolve(clerk);
      };
      const t = setTimeout(done, ms || 400);
      if (clerk && typeof clerk.addListener === "function") {
        clerk.addListener(function (res) {
          if (res && (res.user || res.session)) {
            clearTimeout(t);
            done();
          }
        });
      }
    });
  }

  function oauthBounce() {
    return /__clerk|clerk_status|clerk_error|external_account_not_found/i.test(String(location.href));
  }

  function showWho(msg) {
    if (onAppPage() && !clerkSessionPresent() && !oauthBounce() && !msg) {
      goSplash();
      return;
    }
    const err = $("who-err");
    if (err) {
      if (msg) {
        err.hidden = false;
        err.textContent = msg;
      } else {
        err.hidden = true;
      }
    }
    setBodyGate("who");
    paintChrome();
  }

  function showDenied(contact) {
    session.denied = true;
    const addr = contact || session.contactEmail || CONTACT;
    const mail = $("denied-email");
    const link = $("denied-mail");
    if (mail) mail.textContent = addr;
    if (link) {
      link.href = "mailto:" + addr;
      link.textContent = addr;
    }
    setBodyGate("denied");
    paintChrome();
  }

  function clearGate() {
    session.denied = false;
    if (!onAppPage()) {
      goApp();
      return;
    }
    setBodyGate("");
    paintChrome();
  }

  function clerkWhere() {
    const host = session.clerkInstance || "";
    const env = session.clerkEnvLabel || (session.clerkKeyKind === "live" ? "Production" : (session.clerkKeyKind === "test" ? "Development" : ""));
    if (host && env) return env + " instance " + host;
    if (host) return host;
    if (env) return env + " instance";
    return "the Clerk application that matches this site’s publishable key";
  }

  function applyMe(data) {
    if (!data || typeof data !== "object") return session;
    session.email = data.email || null;
    session.isSystem = Boolean(data.isSystem);
    session.hasAppAccess = Boolean(data.hasAppAccess);
    session.contactEmail = data.contactEmail || CONTACT;
    session.acl = Boolean(data.acl);
    session.clerk = Boolean(data.clerk);
    session.status = data.status;
    session.systemEnv = Boolean(data.systemEnv);
    session.verified = Boolean(data.verified && data.email);
    session.identityError = data.identityError || "";
    session.clerkInstance = data.clerkInstance || session.clerkInstance || "";
    session.clerkKeyKind = data.clerkKeyKind || session.clerkKeyKind || "";
    session.clerkEnvLabel = data.clerkEnvLabel || session.clerkEnvLabel || "";
    session.clerkUserId = data.clerkUserId || "";
    paintChrome();
    return session;
  }

  function finish(ok) {
    session.ready = true;
    if (resolveReady) resolveReady(ok);
  }

  function fetchMe() {
    return headers().then((h) => fetch("/api/access/me", { headers: h, credentials: "same-origin" }))
      .then((res) => res.json().then((data) => ({ res, data })).catch(() => ({ res, data: null })))
      .catch(() => null);
  }

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
    const fromCfg = normalizeFrontendApiHost((cfg && cfg.frontendApi) || clerkFapi || global.__clerk_frontend_api);
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
    return CLERK_JS;
  }

  function vercelFapiMessage() {
    return "This publishable key encodes a Vercel host as Clerk Frontend API. *.vercel.app cannot serve /v1/client. In Clerk Production, remove the satellite/proxy domain on vercel.app and use the default Frontend API. Set CLERK_FRONTEND_API to that Clerk-owned host (something.clerk.accounts.dev) on Vercel and redeploy.";
  }

  function loadClerkScript(pk) {
    if (global.Clerk) return Promise.resolve();
    global.__clerk_publishable_key = pk;
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = function () {
        if (settled) return;
        settled = true;
        resolve();
      };
      const fail = function () {
        if (settled) return;
        settled = true;
        reject(new Error("Clerk JS failed to download"));
      };
      function watch(el) {
        el.addEventListener("load", done);
        el.addEventListener("error", function () {
          if (el.src === CLERK_JS) {
            fail();
            return;
          }
          el.src = CLERK_JS;
        });
        let n = 0;
        const t = setInterval(function () {
          if (global.Clerk) {
            clearInterval(t);
            done();
          } else if (++n > 240) {
            clearInterval(t);
            fail();
          }
        }, 50);
      }
      const existing = document.querySelector("script[data-clerk-js]");
      if (existing) {
        watch(existing);
        return;
      }
      const s = document.createElement("script");
      s.src = clerkScriptUrl(clerkFapi || clerkFrontendHost(pk));
      s.async = true;
      s.crossOrigin = "anonymous";
      s.fetchPriority = "high";
      s.dataset.clerkJs = "1";
      if (pk && clerkFapi) s.setAttribute("data-clerk-publishable-key", pk);
      watch(s);
      document.head.appendChild(s);
    });
  }

  let clerkBootPromise = null;

  function clerkInstanceFapi(clerk) {
    try {
      return normalizeFrontendApiHost(clerk && clerk.frontendApi);
    } catch (_) {
      return "";
    }
  }

  function bootClerk(pk, frontendApi) {
    const fapi = usableFrontendApi({ frontendApi: frontendApi || clerkFapi }, pk);
    clerkFapi = fapi;
    const key = rewritePublishableKey(pk, fapi);
    clerkPk = key;
    if (!fapi) {
      const decoded = clerkFrontendHost(pk);
      clerkStatus = "failed";
      clerkFail = isVercelAppFrontendApi(decoded)
        ? vercelFapiMessage()
        : "Server did not send a Clerk Frontend API host. Set CLERK_FRONTEND_API to the Clerk-owned host from the dashboard (something.clerk.accounts.dev).";
      return Promise.reject(new Error(clerkFail));
    }
    if (
      clerkStatus === "ready"
      && global.Clerk
      && global.Clerk.client
      && clerkInstanceFapi(global.Clerk) === fapi
    ) {
      return Promise.resolve(global.Clerk);
    }
    if (clerkBootPromise) return clerkBootPromise;
    clerkStatus = "loading";
    clerkFail = "";
    global.__clerk_publishable_key = key;
    global.__clerk_frontend_api = fapi;
    clerkBootPromise = loadClerkScript(key).then(function () {
      const loaded = global.Clerk;
      const Ctor = typeof loaded === "function"
        ? loaded
        : (loaded && loaded.constructor && loaded.constructor !== Object ? loaded.constructor : null);
      // Clerk JS 5.128 reads FAPI from the publishable key. frontendApi is passed for
      // newer constructors; domain/proxyUrl are satellite/proxy and must not be vercel.app.
      const opts = { frontendApi: fapi };
      if (typeof Ctor === "function" && Ctor !== loaded) {
        const inst = new Ctor(key, opts);
        return inst.load({ isSatellite: false }).then(function () {
          global.Clerk = inst;
          clerkStatus = "ready";
          return inst;
        });
      }
      if (typeof loaded === "function") {
        const inst = new loaded(key, opts);
        return inst.load({ isSatellite: false }).then(function () {
          global.Clerk = inst;
          clerkStatus = "ready";
          return inst;
        });
      }
      if (loaded && clerkInstanceFapi(loaded) === fapi && loaded.client) {
        clerkStatus = "ready";
        return loaded;
      }
      if (loaded && typeof loaded.load === "function" && clerkInstanceFapi(loaded) === fapi) {
        return loaded.load({ publishableKey: key, isSatellite: false }).then(function () {
          clerkStatus = "ready";
          return loaded;
        });
      }
      throw new Error("Clerk JS did not initialize");
    }).catch(function (err) {
      clerkStatus = "failed";
      clerkFail = err && err.message ? String(err.message) : "Clerk JS did not initialize";
      clerkBootPromise = null;
      throw err;
    });
    return clerkBootPromise;
  }

  function oauthRedirectArgs() {
    const splash = splashUrl();
    const app = appUrl();
    return {
      strategy: "oauth_google",
      redirectUrl: splash,
      redirectUrlComplete: app,
    };
  }

  function oauthPopupArgs(popup) {
    const args = oauthRedirectArgs();
    args.popup = popup;
    return args;
  }

  function closePopup(popup) {
    try {
      if (popup && !popup.closed) popup.close();
    } catch (_) {}
  }

  function popupBlocked(popup) {
    try {
      return !popup || popup.closed;
    } catch (_) {
      return true;
    }
  }

  function openGooglePopup() {
    try {
      const w = 480;
      const h = 640;
      const left = Math.max(0, ((window.screen && window.screen.width ? window.screen.width : 0) - w) / 2);
      const top = Math.max(0, ((window.screen && window.screen.height ? window.screen.height : 0) - h) / 2);
      const popup = window.open(
        "about:blank",
        "databased-google",
        "popup=yes,width=" + w + ",height=" + h + ",left=" + left + ",top=" + top
      );
      if (popup) {
        try {
          popup.document.open();
          popup.document.write("<!doctype html><title>Google</title><body style=\"font:14px/1.4 sans-serif;padding:24px\">Opening Google…</body>");
          popup.document.close();
        } catch (_) {}
      }
      return popup;
    } catch (_) {
      return null;
    }
  }

  function isPopupFailed(err) {
    const t = clerkErrorText(err) + " " + (err && err.name ? err.name : "");
    return /popup|blocked|closed|COOP|opener/i.test(t);
  }

  function resetGoogleButton() {
    const btn = $("google-signin");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Sign in with Google";
    }
    const err = $("who-err");
    if (err && err.textContent === "Opening Google…") {
      err.hidden = true;
      err.textContent = "";
    }
  }

  function clerkErrorText(err) {
    if (!err) return "";
    if (typeof err === "string") return err;
    const parts = [];
    if (err.message) parts.push(String(err.message));
    if (err.reason) parts.push(String(err.reason));
    if (Array.isArray(err.errors)) {
      err.errors.forEach(function (item) {
        if (!item) return;
        const bit = [item.code, item.longMessage || item.message].filter(Boolean).join(": ");
        if (bit) parts.push(bit);
      });
    }
    return parts.join(" ");
  }

  function bouncePayload() {
    try {
      const url = new URL(location.href);
      const raw = url.searchParams.get("clerk_status")
        || url.searchParams.get("__clerk_status")
        || url.searchParams.get("clerk_error")
        || "";
      if (raw && raw.charAt(0) === "{") return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function isMissingExternalAccount(err) {
    const blob = clerkErrorText(err) + " " + String(location.href) + " " + JSON.stringify(bouncePayload() || {});
    return /external_account_not_found|The External Account was not found/i.test(blob);
  }

  function isRestrictedSignUp(err) {
    const blob = clerkErrorText(err) + " " + JSON.stringify(bouncePayload() || {});
    return /sign_up_restricted|not_allowed_to_sign_up|invitation_required|signups?_disabled|restricted/i.test(blob);
  }

  function restrictedMessage() {
    return "Clerk Restricted will not create a user from Google until that email is invited. In Clerk Development → Users → Invitations, invite the Google email (the SYSTEM_USER_EMAIL address for the operator). Open the invite, then use Google again.";
  }

  function oauthResources(clerk, preferSignUp) {
    const client = clerk && clerk.client;
    const signUp = client && client.signUp;
    const signIn = client && client.signIn;
    return preferSignUp ? [signUp, signIn, clerk] : [signIn, signUp, clerk];
  }

  function startGoogleRedirect(clerk, preferSignUp) {
    const args = oauthRedirectArgs();
    const resources = oauthResources(clerk, preferSignUp);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      if (resource && typeof resource.authenticateWithRedirect === "function") {
        return resource.authenticateWithRedirect(args).then(function () { return "redirect"; });
      }
    }
    return Promise.reject(new Error("Google OAuth is not ready"));
  }

  function startGooglePopup(clerk, preferSignUp, popup) {
    const args = oauthPopupArgs(popup);
    const resources = oauthResources(clerk, preferSignUp);
    for (let i = 0; i < resources.length; i++) {
      const resource = resources[i];
      if (resource && typeof resource.authenticateWithPopup === "function") {
        return resource.authenticateWithPopup(args).then(function () { return "popup"; });
      }
    }
    return Promise.reject(new Error("Google popup is not ready"));
  }

  function startGoogleOAuth(clerk, preferSignUp, popup) {
    if (popup && !popupBlocked(popup)) {
      return startGooglePopup(clerk, preferSignUp, popup).catch(function (err) {
        if (!isPopupFailed(err)) throw err;
        closePopup(popup);
        return startGoogleRedirect(clerk, preferSignUp);
      });
    }
    closePopup(popup);
    return startGoogleRedirect(clerk, preferSignUp);
  }

  function waitForPopupSession(clerk, popup) {
    if (clerkSessionPresent()) return Promise.resolve(clerk);
    return new Promise(function (resolve, reject) {
      let settled = false;
      const finish = function (err) {
        if (settled) return;
        settled = true;
        try { window.removeEventListener("message", onMsg); } catch (_) {}
        if (err) reject(err);
        else resolve(clerk);
      };
      function onMsg(event) {
        try {
          const origin = String(event.origin || "");
          if (origin.indexOf("clerk.accounts.dev") < 0 && origin.indexOf("accounts.dev") < 0) return;
          if (event.data && event.data.session && typeof clerk.setActive === "function") {
            clerk.setActive({ session: event.data.session }).then(function () { finish(); }).catch(function () { finish(); });
            return;
          }
          if (event.data && (event.data.session || event.data.return_url) && clerkSessionPresent()) finish();
        } catch (_) {}
      }
      window.addEventListener("message", onMsg);
      if (clerk && typeof clerk.addListener === "function") {
        clerk.addListener(function (res) {
          if (res && (res.user || res.session)) finish();
        });
      }
      const poll = setInterval(function () {
        if (clerkSessionPresent()) {
          clearInterval(poll);
          finish();
          return;
        }
        try {
          if (popupBlocked(popup)) {
            clearInterval(poll);
            if (clerkSessionPresent()) finish();
            else finish(new Error("popup_closed"));
          }
        } catch (_) {
          clearInterval(poll);
          finish(new Error("popup_closed"));
        }
      }, 250);
    });
  }

  function leaveSplashForApp() {
    return goApp();
  }

  function afterPopupSession(clerk) {
    return activateSession(clerk).then(function (live) {
      return waitForSession(live, 1500).then(function () {
        if (clerkSessionPresent()) leaveSplashForApp();
        return afterSession();
      });
    });
  }

  function transferOrSignUp(clerk, popup) {
    const signUp = clerk && clerk.client && clerk.client.signUp;
    if (signUp && typeof signUp.create === "function") {
      return signUp.create({ transfer: true }).then(function (su) {
        if (su && su.status === "complete" && su.createdSessionId && typeof clerk.setActive === "function") {
          return clerk.setActive({ session: su.createdSessionId }).then(function () { return clerk; });
        }
        return startGoogleOAuth(clerk, true, popup).then(function () { return clerk; });
      });
    }
    return startGoogleOAuth(clerk, true, popup).then(function () { return clerk; });
  }

  function finishOAuthBounce(clerk) {
    if (!oauthBounce() || typeof clerk.handleRedirectCallback !== "function") {
      return Promise.resolve(clerk);
    }
    return clerk.handleRedirectCallback({ transferable: true }).then(function () {
      return clerk;
    }).catch(function (err) {
      if (isRestrictedSignUp(err)) {
        clerkFail = restrictedMessage();
        return clerk;
      }
      if (isMissingExternalAccount(err)) {
        return transferOrSignUp(clerk).catch(function (signUpErr) {
          clerkFail = isRestrictedSignUp(signUpErr) ? restrictedMessage() : (clerkErrorText(signUpErr) || restrictedMessage());
          return clerk;
        });
      }
      clerkFail = clerkErrorText(err) || "Clerk did not finish Google sign-in.";
      return clerk;
    });
  }

  function canRedirect(clerk) {
    const client = clerk && clerk.client;
    return Boolean(
      (client && (
        (client.signUp && typeof client.signUp.authenticateWithRedirect === "function")
        || (client.signIn && typeof client.signIn.authenticateWithRedirect === "function")
      ))
      || (clerk && typeof clerk.authenticateWithRedirect === "function")
    );
  }

  function canPopup(clerk) {
    const client = clerk && clerk.client;
    return Boolean(
      (client && (
        (client.signUp && typeof client.signUp.authenticateWithPopup === "function")
        || (client.signIn && typeof client.signIn.authenticateWithPopup === "function")
      ))
      || (clerk && typeof clerk.authenticateWithPopup === "function")
    );
  }

  function canOAuth(clerk) {
    return canPopup(clerk) || canRedirect(clerk);
  }

  function paintOpening() {
    const btn = $("google-signin");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Opening Google…";
    }
    const err = $("who-err");
    if (err) {
      err.hidden = false;
      err.textContent = "Opening Google…";
    }
  }

  function googleReadyThen(run) {
    if (canOAuth(global.Clerk)) return Promise.resolve(run(global.Clerk));
    const cfgP = clerkPk && clerkFapi
      ? Promise.resolve({ publishableKey: clerkPk, frontendApi: clerkFapi })
      : Promise.resolve(global.__databasedClerkPreload || fetch("/api/config").then((res) => (res.ok ? res.json() : null)).catch(() => null));
    return cfgP.then(function (cfg) {
      const pk = clerkPk || (cfg && cfg.publishableKey) || "";
      if (!pk) {
        const err = $("who-err");
        if (err) {
          err.hidden = false;
          err.textContent = "Server did not send a Clerk publishable key. Set CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY and redeploy.";
        }
        return;
      }
      return bootClerk(pk, usableFrontendApi(cfg, pk)).then(run);
    });
  }

  function signInGoogle() {
    paintOpening();
    const popup = openGooglePopup();
    googleReadyThen(function (clerk) {
    if (!canOAuth(clerk)) {
      closePopup(popup);
      resetGoogleButton();
      const err = $("who-err");
      if (err) {
        err.hidden = false;
        if (clerkStatus === "failed") {
          err.textContent = clerkFail || "Clerk failed to start. Check this host is allowed on the Clerk instance.";
        } else if (!clerkPk) {
          err.textContent = "Server did not send a Clerk publishable key. Set CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY and redeploy.";
        } else {
          err.textContent = "Google sign-in is not ready yet. Refresh and try again.";
        }
      }
      return;
    }
    const run = function (preferSignUp, win) {
      return startGoogleOAuth(clerk, preferSignUp, win).then(function (mode) {
        if (mode === "popup") {
          return waitForPopupSession(clerk, win).then(function () {
            closePopup(win);
            return afterPopupSession(clerk);
          }).catch(function (waitErr) {
            if (clerkSessionPresent()) return afterPopupSession(clerk);
            if (isPopupFailed(waitErr)) {
              closePopup(win);
              resetGoogleButton();
              return;
            }
            throw waitErr;
          });
        }
      });
    };
    return run(true, popup).catch(function (err) {
      if (isRestrictedSignUp(err)) {
        closePopup(popup);
        resetGoogleButton();
        const box = $("who-err");
        if (box) {
          box.hidden = false;
          box.textContent = restrictedMessage();
        }
        return;
      }
      if (isMissingExternalAccount(err)) {
        return run(true, popup);
      }
      if (isPopupFailed(err) && canRedirect(clerk)) {
        closePopup(popup);
        return startGoogleRedirect(clerk, true).catch(function (second) {
          resetGoogleButton();
          const box = $("who-err");
          if (box) {
            box.hidden = false;
            box.textContent = isRestrictedSignUp(second)
              ? restrictedMessage()
              : (clerkErrorText(second) || "Google sign-in failed. Enable Google on the Clerk instance, or invite this email in Development.");
          }
        });
      }
      return run(false, popup).catch(function (second) {
        closePopup(popup);
        resetGoogleButton();
        const box = $("who-err");
        if (box) {
          box.hidden = false;
          box.textContent = isRestrictedSignUp(second)
            ? restrictedMessage()
            : (clerkErrorText(second) || clerkErrorText(err) || "Google sign-in failed. Enable Google on the Clerk instance, or invite this email in Development.");
        }
      });
    });
    });
  }

  function signOut() {
    const clerk = global.Clerk;
    const done = function () {
      session.email = null;
      session.isSystem = false;
      session.hasAppAccess = false;
      session.verified = false;
      session.identityError = "";
      session.clerkUserId = "";
      if (goSplash()) return;
      showWho();
    };
    if (clerk && typeof clerk.signOut === "function") {
      return clerk.signOut().then(done).catch(done);
    }
    done();
  }

  function verifyFailMessage(clerkUser, clientEmail) {
    const uid = (clerkUser && clerkUser.id) || session.clerkUserId || "";
    const err = session.identityError;
    let msg = "Google finished in the browser, but this server did not verify a Clerk session for you. That is not the invite gate.";
    if (err === "verify_failed") {
      msg = "Clerk signed you in in the browser, but the server could not verify the session JWT. CLERK_SECRET_KEY must belong to the same Clerk application as the publishable key.";
    } else if (err === "key_mismatch") {
      msg = "Clerk publishable key and CLERK_SECRET_KEY are not the same kind of instance (pk_test must pair with sk_test, pk_live with sk_live) on this Vercel environment.";
    } else if (err === "no_email") {
      msg = "Clerk session verified, but the JWT and user record had no email. Check the Google account’s email on " + clerkWhere() + ".";
    } else if (err === "no_token") {
      msg = "No Clerk session JWT reached the server. Refresh and sign in with Google again.";
    }
    if (uid) msg += " Look for " + uid + " under Users on " + clerkWhere() + ".";
    else msg += " If Users is empty, you are on the wrong instance (Development vs Production) or Clerk Restricted blocked creating the user.";
    if (clientEmail) msg += " Browser email was " + clientEmail + ".";
    return msg;
  }

  function afterSession() {
    const clientEmail = handle();
    const clerkUser = global.Clerk && global.Clerk.user;
    if (!clerkSessionPresent()) {
      if (onAppPage() && !oauthBounce()) {
        goSplash();
        finish(false);
        return false;
      }
      showWho();
      finish(false);
      return false;
    }
    if (!onAppPage()) {
      leaveSplashForApp();
      finish(true);
      return true;
    }
    return fetchMe().then((out) => {
      if (!out) {
        showWho("Could not reach the server.");
        finish(false);
        return false;
      }
      applyMe(out.data);
      if (!out.data) {
        showWho("The access API did not return JSON, so this server never verified a Clerk session. That is not the invite gate.");
        finish(false);
        return false;
      }
      if (!session.verified) {
        showWho(verifyFailMessage(clerkUser, clientEmail));
        finish(false);
        return false;
      }
      if (!session.hasAppAccess && (session.acl || session.clerk)) {
        showDenied(session.contactEmail);
        finish(false);
        return false;
      }
      clearGate();
      finish(true);
      return true;
    });
  }

  function start() {
    const pending = global.__databasedClerkPreload
      || fetch("/api/config").then((res) => (res.ok ? res.json() : null)).catch(() => null);
    return Promise.resolve(pending)
      .then((cfg) => {
        if (cfg && cfg.contactEmail) session.contactEmail = cfg.contactEmail;
        if (cfg && cfg.clerkInstance) session.clerkInstance = cfg.clerkInstance;
        if (cfg && cfg.frontendApi) session.clerkInstance = cfg.frontendApi;
        if (cfg && cfg.clerkKeyKind) session.clerkKeyKind = cfg.clerkKeyKind;
        if (cfg && cfg.clerkEnvLabel) session.clerkEnvLabel = cfg.clerkEnvLabel;
        if (cfg && cfg.systemEnv === false && cfg.systemHint) session.systemHint = cfg.systemHint;
        if (cfg && cfg.clerk && cfg.publishableKey) {
          session.clerk = true;
          return bootClerk(cfg.publishableKey, usableFrontendApi(cfg, cfg.publishableKey)).then(function (clerk) {
            const href = String(location.href);
            return finishOAuthBounce(clerk).then(function (ready) {
              if (ready && ready.addListener) {
                ready.addListener(function (res) {
                  if (res && res.user && session.ready && (session.denied || !session.hasAppAccess)) afterSession();
                });
              }
              return activateSession(ready).then(function (live) {
                return waitForSession(live, onAppPage() ? 2500 : 400).then(function () {
              if (!clerkSessionPresent()) {
                const bouncedGoogle = /__clerk|clerk_status|clerk_error|external_account_not_found/i.test(href);
                if (bouncedGoogle && clerkFail) {
                  showWho(clerkFail);
                } else if (bouncedGoogle && isRestrictedSignUp()) {
                  showWho(restrictedMessage());
                } else if (bouncedGoogle && isMissingExternalAccount()) {
                  showWho(restrictedMessage() + " If Invitations already include this email, Google sign-up should create the user on " + clerkWhere() + ".");
                } else if (bouncedGoogle) {
                  showWho("Google returned here, but Clerk did not create a session. Look at " + clerkWhere() + " → Users and Invitations — not a different application, and not Production if this site uses pk_test_ (Development). Enable Google, add this origin, and if Restricted, invite the Google email first.");
                } else if (onAppPage() && !oauthBounce()) {
                  goSplash();
                } else {
                  showWho();
                }
                finish(false);
                return false;
              }
              return afterSession();
                });
              });
            });
          }).catch(function (err) {
            const detail = err && err.message ? String(err.message) : "";
            clerkFail = detail && detail !== "clerk"
              ? "Clerk failed to start. " + detail
              : "Clerk failed to start. Check this host is allowed on the Clerk instance.";
            showWho(clerkFail);
            finish(false);
            return false;
          });
        }
        showWho();
        finish(false);
        return false;
      });
  }

  function waitlistMessage(data, fallback) {
    if (data && data.message) return String(data.message);
    return fallback;
  }

  function submitWaitlist(ev) {
    if (ev) ev.preventDefault();
    const form = $("waitlist-form");
    const input = $("waitlist-email");
    const submit = $("waitlist-submit");
    const ok = $("waitlist-ok");
    const err = $("who-err");
    const email = input ? String(input.value || "").trim() : "";
    if (ok) { ok.hidden = true; ok.textContent = ""; }
    if (err) { err.hidden = true; err.textContent = ""; }
    if (!email || email.indexOf("@") < 1) {
      if (err) {
        err.hidden = false;
        err.textContent = "Enter a valid email.";
      }
      return;
    }
    if (submit) submit.disabled = true;
    fetch("/api/access/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    }).then((res) => res.json().then((data) => ({ res, data })).catch(() => ({ res, data: null })))
      .then((out) => {
        if (!out) {
          if (err) {
            err.hidden = false;
            err.textContent = "Could not reach the server.";
          }
          return;
        }
        if (out.res.ok && out.data && out.data.ok) {
          if (form) form.hidden = true;
          if (ok) {
            ok.hidden = false;
            ok.textContent = "You’re on the list. That doesn’t guarantee a spot.";
          }
          return;
        }
        if (err) {
          err.hidden = false;
          err.textContent = waitlistMessage(out.data, "Could not store this request.");
        }
      })
      .catch(() => {
        if (err) {
          err.hidden = false;
          err.textContent = "Could not reach the server.";
        }
      })
      .then(() => {
        if (submit) submit.disabled = false;
      });
  }

  function bind() {
    const google = $("google-signin");
    if (google) google.addEventListener("click", signInGoogle);
    const out = $("sign-out");
    if (out) out.addEventListener("click", signOut);
    const deniedOut = $("denied-sign-out");
    if (deniedOut) deniedOut.addEventListener("click", signOut);
    const waitlist = $("waitlist-form");
    if (waitlist) waitlist.addEventListener("submit", submitWaitlist);
  }

  function users() {
    return headers().then((h) => fetch("/api/access/users", { headers: h, credentials: "same-origin" })).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("users failed"));
    });
  }

  function boards() {
    return headers().then((h) => fetch("/api/access/boards", { headers: h, credentials: "same-origin" })).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("boards failed"));
    });
  }

  function waitlist() {
    return headers().then((h) => fetch("/api/access/waitlist", { headers: h, credentials: "same-origin" })).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("waitlist failed"));
    });
  }

  function inviteApp(email) {
    return headers().then((h) => fetch("/api/access/invite", {
      method: "POST",
      headers: h,
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    })).then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })));
  }

  function revokeApp(email) {
    return headers().then((h) => fetch("/api/access/revoke", {
      method: "POST",
      headers: h,
      credentials: "same-origin",
      body: JSON.stringify({ email }),
    })).then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })));
  }

  function deniedFromResponse(res, data) {
    if (!res) return false;
    if (res.status === 403 && data && (data.error === "no_access" || data.error === "forbidden")) {
      showDenied((data && data.contactEmail) || session.contactEmail);
      return data.error === "no_access";
    }
    return false;
  }

  global.DataBasedAccess = {
    session,
    handle,
    headers,
    isSystem: function () { return session.isSystem; },
    hasAppAccess: function () { return session.hasAppAccess; },
    ready: function () { return readyPromise; },
    users,
    boards,
    waitlist,
    inviteApp,
    revokeApp,
    deniedFromResponse,
    showDenied,
    signOut,
    start,
  };

  bind();
  start();
})(window);
