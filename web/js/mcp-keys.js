(function (global) {
  function $(id) {
    return document.getElementById(id);
  }

  function currentHandle() {
    if (global.DataBasedAccess && typeof global.DataBasedAccess.handle === "function") {
      const who = global.DataBasedAccess.handle();
      if (who) return who;
    }
    try {
      if (global.DB && Object.prototype.hasOwnProperty.call(global.DB, "user") && global.DB.user) {
        return String(global.DB.user);
      }
      const flag = localStorage.getItem("databased.user");
      if (!flag || flag === "signed-out" || flag === "0") return "you";
      return flag;
    } catch (_) {
      return "you";
    }
  }

  function headers() {
    if (global.DataBasedAccess && typeof global.DataBasedAccess.headers === "function") {
      return Promise.resolve(global.DataBasedAccess.headers());
    }
    return Promise.resolve({ "Content-Type": "application/json" });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject();
  }

  function paint(state) {
    const panel = $("mcp-panel");
    if (!panel) return;
    const secret = $("mcp-secret");
    const hint = $("mcp-hint");
    const copyBtn = $("mcp-copy");
    const createBtn = $("mcp-create");
    const resetBtn = $("mcp-reset");
    const confirm = $("mcp-confirm");
    const live = $("mcp-live");
    const shown = Boolean(state.key);
    const has = Boolean(state.user && state.user.hasKey);

    if (secret) {
      secret.hidden = !shown;
      secret.value = state.key || "";
    }
    if (hint) {
      if (shown) hint.textContent = "Shown once. Copy it now. We do not email keys.";
      else if (has) hint.textContent = "Key on file · ends in " + (state.user.suffix || "****") + ". Reset if you think it was stolen.";
      else hint.textContent = "Create a key to hook Cursor or Claude to this board via MCP.";
    }
    if (copyBtn) copyBtn.hidden = !shown;
    if (createBtn) createBtn.hidden = has || shown;
    if (resetBtn) {
      resetBtn.hidden = !has;
      resetBtn.disabled = Boolean(state.confirming);
    }
    if (confirm) confirm.hidden = !state.confirming;
    if (live && state.live) live.textContent = state.live;
  }

  const ui = { user: null, key: null, confirming: false, live: "" };

  function set(next) {
    Object.assign(ui, next);
    paint(ui);
  }

  function load() {
    return headers().then((h) => fetch("/api/mcp/key", { headers: h }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        set({ user: data.user, key: null, confirming: false });
      })
      .catch(() => {});
  }

  function create() {
    return headers().then((h) => fetch("/api/mcp/key", { method: "POST", headers: h }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) return;
        set({
          user: data.user,
          key: data.key || null,
          confirming: false,
          live: data.key ? "New MCP key. Copy it now." : "Key already on file.",
        });
      })
      .catch(() => {});
  }

  function reset() {
    return headers().then((h) => fetch("/api/mcp/key/reset", { method: "POST", headers: h }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || !data.key) return;
        set({
          user: data.user,
          key: data.key,
          confirming: false,
          live: "Key reset. The old key is dead.",
        });
      })
      .catch(() => {});
  }

  function bind() {
    const copyBtn = $("mcp-copy");
    const createBtn = $("mcp-create");
    const resetBtn = $("mcp-reset");
    const yes = $("mcp-reset-yes");
    const no = $("mcp-reset-no");
    const live = $("mcp-live");

    if (createBtn) {
      createBtn.addEventListener("click", () => create());
    }
    if (resetBtn) {
      resetBtn.addEventListener("click", () => set({ confirming: true, live: "" }));
    }
    if (no) {
      no.addEventListener("click", () => set({ confirming: false }));
    }
    if (yes) {
      yes.addEventListener("click", () => reset());
    }
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        if (!ui.key) return;
        Promise.resolve(copyText(ui.key)).then(() => {
          copyBtn.textContent = "Copied";
          if (live) live.textContent = "Copied MCP key";
          setTimeout(() => {
            copyBtn.textContent = "Copy";
          }, 1400);
        }).catch(() => {
          const secret = $("mcp-secret");
          if (secret) {
            secret.focus();
            secret.select();
          }
        });
      });
    }

    load();
    window.addEventListener("hashchange", () => {
      if (/^#\/invite/.test(location.hash || "")) load();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
