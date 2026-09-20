/* Identity + app-access gate. Board invite is separate (boards.js). */
(function (global) {
  const USER_KEY = "databased.user";
  const CONTACT = "marcode.chavez.jr@gmail.com";

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

  function storedUser() {
    try {
      if (global.DB && Object.prototype.hasOwnProperty.call(global.DB, "user") && global.DB.user) {
        return String(global.DB.user).trim().toLowerCase();
      }
      const flag = localStorage.getItem(USER_KEY);
      if (!flag || flag === "signed-out" || flag === "0") return "";
      return String(flag).trim().toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function handle() {
    return clerkEmail() || storedUser();
  }

  function headers() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const who = handle();
    if (who) h["X-DataBased-User"] = who;
    try {
      const token = (global.DB && global.DB.authToken) || localStorage.getItem("databased.token");
      if (token) h.Authorization = "Bearer " + token;
    } catch (_) {}
    return h;
  }

  const session = {
    email: handle() || null,
    isSystem: false,
    hasAppAccess: false,
    contactEmail: CONTACT,
    acl: false,
    ready: false,
    denied: false,
  };

  let readyPromise = null;
  let resolveReady = null;

  function gateEls() {
    return {
      who: $("screen-who"),
      denied: $("screen-denied"),
      people: $("people-link"),
      whoLabel: $("who-label"),
    };
  }

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
    const els = gateEls();
    if (els.people) els.people.hidden = !session.isSystem;
    if (els.whoLabel) {
      els.whoLabel.hidden = !session.email;
      els.whoLabel.textContent = session.email || "";
    }
  }

  function showWho() {
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
    session.status = data.status;
    paintChrome();
    return session;
  }

  function finish(ok) {
    session.ready = true;
    if (resolveReady) resolveReady(ok);
  }

  function fetchMe() {
    return fetch("/api/access/me", { headers: headers() })
      .then((res) => res.json().then((data) => ({ res, data })).catch(() => ({ res, data: null })))
      .catch(() => null);
  }

  function start() {
    readyPromise = new Promise((resolve) => { resolveReady = resolve; });
    return fetchMe().then((out) => {
      const who = handle();
      if (!out) {
        if (!who) showWho();
        else clearGate();
        finish(!who ? false : true);
        if (!who) return false;
        return true;
      }
      applyMe(out.data);
      const mustIdentify = Boolean(session.acl) && !who;
      if (mustIdentify) {
        showWho();
        finish(false);
        return false;
      }
      if (session.acl && who && !session.hasAppAccess) {
        showDenied(session.contactEmail);
        finish(false);
        return false;
      }
      if (!who && session.acl) {
        showWho();
        finish(false);
        return false;
      }
      clearGate();
      finish(true);
      return true;
    });
  }

  function saveUser(email) {
    const id = String(email || "").trim().toLowerCase();
    try { localStorage.setItem(USER_KEY, id); } catch (_) {}
    session.email = id;
    if (global.DB) global.DB.user = id;
  }

  function bind() {
    const form = $("who-form");
    if (form) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const email = new FormData(ev.target).get("email");
        const err = $("who-err");
        const id = String(email || "").trim().toLowerCase();
        if (!id || id.indexOf("@") < 1) {
          if (err) {
            err.hidden = false;
            err.textContent = "Use the email you were invited with.";
          }
          return;
        }
        if (err) err.hidden = true;
        saveUser(id);
        fetchMe().then((out) => {
          if (!out) {
            clearGate();
            finish(true);
            location.reload();
            return;
          }
          applyMe(out.data);
          if (session.acl && !session.hasAppAccess) {
            showDenied(session.contactEmail);
            finish(false);
            return;
          }
          clearGate();
          finish(true);
          location.reload();
        });
      });
    }
  }

  function users() {
    return fetch("/api/access/users", { headers: headers() }).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("users failed"));
    });
  }

  function boards() {
    return fetch("/api/access/boards", { headers: headers() }).then((res) => {
      if (res.status === 403) return Promise.reject(new Error("forbidden"));
      return res.ok ? res.json() : Promise.reject(new Error("boards failed"));
    });
  }

  function inviteApp(email) {
    return fetch("/api/access/invite", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    }).then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })));
  }

  function revokeApp(email) {
    return fetch("/api/access/revoke", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ email }),
    }).then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })));
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
    USER_KEY,
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
    start,
  };

  bind();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})(window);
