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
  };

  let readyPromise = null;
  let resolveReady = null;
  let clerkPk = "";

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

  function applyMe(data) {
    if (!data || typeof data !== "object") return session;
    session.email = data.email || handle() || null;
    session.isSystem = Boolean(data.isSystem);
    session.hasAppAccess = Boolean(data.hasAppAccess);
    session.contactEmail = data.contactEmail || CONTACT;
    session.acl = Boolean(data.acl);
    session.clerk = Boolean(data.clerk);
    session.status = data.status;
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

  function loadClerkScript() {
    if (global.Clerk && global.Clerk.load) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-clerk-js]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("clerk")));
        return;
      }
      const s = document.createElement("script");
      s.src = CLERK_JS;
      s.async = true;
      s.dataset.clerkJs = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("clerk"));
      document.head.appendChild(s);
    });
  }

  function bootClerk(pk) {
    clerkPk = pk;
    return loadClerkScript().then(function () {
      const Ctor = global.Clerk;
      if (typeof Ctor === "function") {
        const inst = new Ctor(pk);
        return inst.load().then(function () {
          global.Clerk = inst;
          return inst;
        });
      }
      if (Ctor && typeof Ctor.load === "function") {
        if (Ctor.publishableKey) return Ctor.load().then(function () { return Ctor; });
        return Ctor.load({ publishableKey: pk }).then(function () { return Ctor; });
      }
      throw new Error("clerk");
    });
  }

  function signInGoogle() {
    const err = $("who-err");
    const clerk = global.Clerk;
    if (!clerk || typeof clerk.authenticateWithRedirect !== "function") {
      if (err) {
        err.hidden = false;
        err.textContent = "Clerk is not ready. Set CLERK_PUBLISHABLE_KEY and refresh.";
      }
      return;
    }
    clerk.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: window.location.href,
      redirectUrlComplete: window.location.origin + "/" + (location.hash || ""),
    }).catch(function () {
      if (err) {
        err.hidden = false;
        err.textContent = "Google sign-in failed. You need a Clerk invitation for this email.";
      }
    });
  }

  function signOut() {
    const clerk = global.Clerk;
    const done = function () {
      session.email = null;
      session.isSystem = false;
      session.hasAppAccess = false;
      showWho();
    };
    if (clerk && typeof clerk.signOut === "function") {
      return clerk.signOut().then(done).catch(done);
    }
    done();
  }

  function afterSession() {
    const who = handle();
    if (!who) {
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
    readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    return fetch("/api/config")
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null)
      .then((cfg) => {
        if (cfg && cfg.contactEmail) session.contactEmail = cfg.contactEmail;
        if (cfg && cfg.clerk && cfg.publishableKey) {
          session.clerk = true;
          return bootClerk(cfg.publishableKey).then(function (clerk) {
            if (clerk && clerk.addListener) {
              clerk.addListener(function (res) {
                if (res && res.user && session.ready && session.denied) afterSession();
              });
            }
            if (!clerk.user) {
              showWho();
              finish(false);
              return false;
            }
            return afterSession();
          }).catch(function () {
            showWho("Clerk failed to load. Check CLERK_PUBLISHABLE_KEY.");
            finish(false);
            return false;
          });
        }
        showWho("Clerk is not configured. Set CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY.");
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
    ready: function () { return readyPromise || Promise.resolve(true); },
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
