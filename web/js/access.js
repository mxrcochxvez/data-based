/* Clerk Google sign-in + app-access gate. Board invite is separate (boards.js). */
(function (global) {
  const CONTACT = "marcode.chavez.jr@gmail.com";
  const CLERK_JS = "https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js";

  function $(id) {
    return document.getElementById(id);
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
      if (global.Clerk && global.Clerk.session && typeof global.Clerk.session.getToken === "function") {
        const token = await global.Clerk.session.getToken();
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
  let clerkStatus = "off";
  let clerkFail = "";

  function setBodyGate(name) {
    const who = $("screen-who");
    const denied = $("screen-denied");
    if (who) who.hidden = name !== "who";
    if (denied) denied.hidden = name !== "denied";
    const gated = name === "who" || name === "denied";
    document.body.classList.toggle("is-gated", gated);
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

  function showWho(msg) {
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
    return headers().then((h) => fetch("/api/access/me", { headers: h }))
      .then((res) => res.json().then((data) => ({ res, data })).catch(() => ({ res, data: null })))
      .catch(() => null);
  }

  function clerkScriptUrl(pk) {
    try {
      const encoded = String(pk || "").replace(/^pk_(test|live)_/, "");
      const pad = "=".repeat((4 - (encoded.length % 4)) % 4);
      const host = atob(encoded + pad).replace(/\$$/, "").trim();
      if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) {
        return "https://" + host + "/npm/@clerk/clerk-js@5/dist/clerk.browser.js";
      }
    } catch (_) {}
    return CLERK_JS;
  }

  function loadClerkScript(pk) {
    if (global.Clerk && typeof global.Clerk.load === "function") return Promise.resolve();
    global.__clerk_publishable_key = pk;
    const stale = document.querySelector("script[data-clerk-js]");
    if (stale && !global.Clerk) stale.remove();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-clerk-js]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("Clerk JS failed to download")));
        return;
      }
      const s = document.createElement("script");
      s.src = clerkScriptUrl(pk);
      s.async = true;
      s.crossOrigin = "anonymous";
      s.dataset.clerkJs = "1";
      s.setAttribute("data-clerk-publishable-key", pk);
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Clerk JS failed to download"));
      document.head.appendChild(s);
    });
  }

  function bootClerk(pk) {
    clerkPk = pk;
    clerkStatus = "loading";
    clerkFail = "";
    return loadClerkScript(pk).then(function () {
      const loaded = global.Clerk;
      if (typeof loaded === "function") {
        const inst = new loaded(pk);
        return inst.load().then(function () {
          global.Clerk = inst;
          clerkStatus = "ready";
          return inst;
        });
      }
      if (loaded && typeof loaded.load === "function") {
        return loaded.load({ publishableKey: pk }).then(function () {
          clerkStatus = "ready";
          return loaded;
        });
      }
      throw new Error("Clerk JS did not initialize");
    }).catch(function (err) {
      clerkStatus = "failed";
      clerkFail = err && err.message ? String(err.message) : "Clerk JS did not initialize";
      throw err;
    });
  }

  function oauthRedirectArgs() {
    const origin = window.location.origin;
    return {
      strategy: "oauth_google",
      redirectUrl: origin + "/",
      redirectUrlComplete: origin + "/" + (location.hash || ""),
    };
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

  function startGoogleOAuth(clerk, preferSignUp) {
    const args = oauthRedirectArgs();
    const client = clerk && clerk.client;
    const signUp = client && client.signUp;
    const signIn = client && client.signIn;
    if (preferSignUp && signUp && typeof signUp.authenticateWithRedirect === "function") {
      return signUp.authenticateWithRedirect(args);
    }
    if (!preferSignUp && signIn && typeof signIn.authenticateWithRedirect === "function") {
      return signIn.authenticateWithRedirect(args);
    }
    if (signUp && typeof signUp.authenticateWithRedirect === "function") {
      return signUp.authenticateWithRedirect(args);
    }
    if (signIn && typeof signIn.authenticateWithRedirect === "function") {
      return signIn.authenticateWithRedirect(args);
    }
    if (clerk && typeof clerk.authenticateWithRedirect === "function") {
      return clerk.authenticateWithRedirect(args);
    }
    return Promise.reject(new Error("Google OAuth is not ready"));
  }

  function transferOrSignUp(clerk) {
    const signUp = clerk && clerk.client && clerk.client.signUp;
    if (signUp && typeof signUp.create === "function") {
      return signUp.create({ transfer: true }).then(function (su) {
        if (su && su.status === "complete" && su.createdSessionId && typeof clerk.setActive === "function") {
          return clerk.setActive({ session: su.createdSessionId }).then(function () { return clerk; });
        }
        const run = su && typeof su.authenticateWithRedirect === "function"
          ? su.authenticateWithRedirect.bind(su)
          : (typeof signUp.authenticateWithRedirect === "function" ? signUp.authenticateWithRedirect.bind(signUp) : null);
        if (run) return run(oauthRedirectArgs()).then(function () { return clerk; });
        throw new Error("external_account_not_found");
      });
    }
    return startGoogleOAuth(clerk, true).then(function () { return clerk; });
  }

  function finishOAuthBounce(clerk) {
    const href = String(location.href);
    const bounced = /__clerk|clerk_status|clerk_error|external_account_not_found/i.test(href);
    if (!bounced || typeof clerk.handleRedirectCallback !== "function") {
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

  function signInGoogle() {
    const err = $("who-err");
    const clerk = global.Clerk;
    const client = clerk && clerk.client;
    const canRedirect = client && (
      (client.signUp && typeof client.signUp.authenticateWithRedirect === "function")
      || (client.signIn && typeof client.signIn.authenticateWithRedirect === "function")
    ) || (clerk && typeof clerk.authenticateWithRedirect === "function");
    if (!canRedirect) {
      if (err) {
        err.hidden = false;
        if (clerkStatus === "failed") {
          err.textContent = clerkFail || "Clerk failed to start. Check this host is allowed on the Clerk instance.";
        } else if (clerkStatus === "loading") {
          err.textContent = "Clerk is still starting. Try again in a moment.";
        } else if (!clerkPk) {
          err.textContent = "Server did not send a Clerk publishable key. Set CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY and redeploy.";
        } else {
          err.textContent = "Google sign-in is not ready yet. Refresh and try again.";
        }
      }
      return;
    }
    startGoogleOAuth(clerk, true).catch(function (err) {
      if (isRestrictedSignUp(err)) {
        if (err) {
          const box = $("who-err");
          if (box) {
            box.hidden = false;
            box.textContent = restrictedMessage();
          }
        }
        return;
      }
      if (isMissingExternalAccount(err)) {
        return startGoogleOAuth(clerk, true);
      }
      return startGoogleOAuth(clerk, false).catch(function (second) {
        const box = $("who-err");
        if (box) {
          box.hidden = false;
          box.textContent = isRestrictedSignUp(second)
            ? restrictedMessage()
            : (clerkErrorText(second) || clerkErrorText(err) || "Google sign-in failed. Enable Google on the Clerk instance, or invite this email in Development.");
        }
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
      showWho();
    };
    if (clerk && typeof clerk.signOut === "function") {
      return clerk.signOut().then(done).catch(done);
    }
    done();
  }

  function afterSession() {
    const clientEmail = handle();
    const clerkUser = global.Clerk && global.Clerk.user;
    if (!clerkUser) {
      showWho();
      finish(false);
      return false;
    }
    return fetchMe().then((out) => {
      if (!out) {
        showWho("Could not reach the server.");
        finish(false);
        return false;
      }
      applyMe(out.data);
      if (!session.verified) {
        const uid = (clerkUser && clerkUser.id) || session.clerkUserId || "";
        const err = session.identityError;
        let msg = "Google finished in the browser, but this server did not verify a Clerk session for you. That is not the invite gate.";
        if (err === "verify_failed") {
          msg = "Clerk signed you in in the browser, but the server could not verify the session JWT. CLERK_SECRET_KEY must belong to the same Clerk application as the publishable key.";
        } else if (err === "no_email") {
          msg = "Clerk session verified, but the JWT and user record had no email. Check the Google account’s email on " + clerkWhere() + ".";
        } else if (err === "no_token") {
          msg = "No Clerk session JWT reached the server. Refresh and sign in with Google again.";
        }
        if (uid) msg += " Look for " + uid + " under Users on " + clerkWhere() + ".";
        else msg += " If Users is empty, you are on the wrong instance (Development vs Production) or Clerk Restricted blocked creating the user.";
        if (clientEmail) msg += " Browser email was " + clientEmail + ".";
        showWho(msg);
        finish(false);
        return false;
      }
      if (!session.systemEnv && session.isSystem === false && !session.hasAppAccess) {
        showWho(out.data && out.data.systemHint
          ? out.data.systemHint
          : "SYSTEM_USER_EMAIL is not set on this server. Nobody can be the system operator until it is set on this Vercel environment and redeployed.");
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
    return fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((cfg) => {
        if (cfg && cfg.contactEmail) session.contactEmail = cfg.contactEmail;
        if (cfg && cfg.clerkInstance) session.clerkInstance = cfg.clerkInstance;
        if (cfg && cfg.clerkKeyKind) session.clerkKeyKind = cfg.clerkKeyKind;
        if (cfg && cfg.clerkEnvLabel) session.clerkEnvLabel = cfg.clerkEnvLabel;
        if (cfg && cfg.systemEnv === false && cfg.systemHint) session.systemHint = cfg.systemHint;
        if (cfg && cfg.clerk && cfg.publishableKey) {
          session.clerk = true;
          return bootClerk(cfg.publishableKey).then(function (clerk) {
            const href = String(location.href);
            return finishOAuthBounce(clerk).then(function (ready) {
              if (ready && ready.addListener) {
                ready.addListener(function (res) {
                  if (res && res.user && session.ready && (session.denied || !session.hasAppAccess)) afterSession();
                });
              }
              if (!ready.user) {
                const bouncedGoogle = /__clerk|clerk_status|clerk_error|external_account_not_found/i.test(href);
                if (clerkFail) {
                  showWho(clerkFail);
                } else if (bouncedGoogle && isRestrictedSignUp()) {
                  showWho(restrictedMessage());
                } else if (bouncedGoogle && isMissingExternalAccount()) {
                  showWho(restrictedMessage() + " If Invitations already include this email, Google sign-up should create the user on " + clerkWhere() + ".");
                } else if (bouncedGoogle) {
                  showWho("Google returned here, but Clerk did not create a session. Look at " + clerkWhere() + " → Users and Invitations — not a different application, and not Production if this site uses pk_test_ (Development). Enable Google, add this origin, and if Restricted, invite the Google email first.");
                } else {
                  showWho();
                }
                finish(false);
                return false;
              }
              return afterSession();
            });
          }).catch(function (err) {
            const detail = err && err.message ? String(err.message) : "";
            showWho(
              detail && detail !== "clerk"
                ? "Clerk failed to start. " + detail
                : "Clerk failed to start. Check this host is allowed on the Clerk instance."
            );
            finish(false);
            return false;
          });
        }
        showWho("Server did not send a Clerk publishable key. Set CLERK_PUBLISHABLE_KEY, NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, or VITE_CLERK_PUBLISHABLE_KEY on Vercel and redeploy.");
        finish(false);
        return false;
      });
  }

  function bind() {
    const google = $("google-signin");
    if (google) google.addEventListener("click", signInGoogle);
    const out = $("sign-out");
    if (out) out.addEventListener("click", signOut);
    const deniedOut = $("denied-sign-out");
    if (deniedOut) deniedOut.addEventListener("click", signOut);
  }

  function users() {
    return headers().then((h) => fetch("/api/access/users", { headers: h })).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("users failed"));
    });
  }

  function boards() {
    return headers().then((h) => fetch("/api/access/boards", { headers: h })).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("boards failed"));
    });
  }

  function inviteApp(email) {
    return headers().then((h) => fetch("/api/access/invite", {
      method: "POST",
      headers: h,
      body: JSON.stringify({ email }),
    })).then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })));
  }

  function revokeApp(email) {
    return headers().then((h) => fetch("/api/access/revoke", {
      method: "POST",
      headers: h,
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
    inviteApp,
    revokeApp,
    deniedFromResponse,
    showDenied,
    signOut,
    start,
  };

  bind();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window);
