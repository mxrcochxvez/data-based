/* Canvas camera: unbounded pan, pinch/wheel zoom toward focus, persist pan+zoom. */

(function (root) {
  const MIN = 0.25;
  const MAX = 4;
  const STEP = 1.1;
  const DOT = 20;

  function typingTarget(t) {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t && t.isContentEditable);
  }

  function clamp(z) {
    return Math.min(MAX, Math.max(MIN, z));
  }

  function normalize(cam) {
    const src = cam || {};
    const pan = src.pan || {};
    return {
      zoom: clamp(Number(src.zoom) || 1),
      pan: { x: Number(pan.x) || 0, y: Number(pan.y) || 0 },
    };
  }

  function dist(a, b) {
    return Math.hypot(b.x - a.x, b.y - a.y);
  }

  function mid(a, b) {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  function attachCamera(api) {
    const canvas = api.canvas;
    const scroller = api.scroller;
    const state = api.state;
    const persist = api.persist;
    const label = api.label || document.getElementById("zoom-pct");
    const home = api.home || document.getElementById("recenter");
    const blocked = api.blocked || (() => false);

    if (!state.camera) state.camera = normalize(null);
    else state.camera = normalize(state.camera);

    let persistTimer = 0;
    let gestureBase = 1;
    let usingGesture = false;
    const pointers = new Map();
    let pinch = null;

    function zoom() {
      return state.camera.zoom || 1;
    }

    function pan() {
      const p = state.camera.pan || { x: 0, y: 0 };
      return { x: Number(p.x) || 0, y: Number(p.y) || 0 };
    }

    function paintLabel() {
      if (!label) return;
      label.textContent = Math.round(zoom() * 100) + "%";
    }

    function apply() {
      const z = zoom();
      const p = pan();
      canvas.style.transform = "translate(" + (-p.x * z) + "px," + (-p.y * z) + "px) scale(" + z + ")";
      scroller.style.backgroundSize = (DOT * z) + "px " + (DOT * z) + "px";
      scroller.style.backgroundPosition = (-p.x * z) + "px " + (-p.y * z) + "px";
      paintLabel();
    }

    function commit(save) {
      if (save === false || typeof persist !== "function") return;
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => persist(), 160);
    }

    function toWorld(ev) {
      const r = canvas.getBoundingClientRect();
      const z = zoom();
      return {
        x: (ev.clientX - r.left) / z,
        y: (ev.clientY - r.top) / z,
      };
    }

    function focusWorld(worldX, worldY, clientX, clientY, nextZoom, save) {
      const z = clamp(nextZoom != null ? nextZoom : zoom());
      const sr = scroller.getBoundingClientRect();
      const cx = clientX != null ? clientX : sr.left + sr.width / 2;
      const cy = clientY != null ? clientY : sr.top + sr.height / 2;
      state.camera.zoom = z;
      state.camera.pan = {
        x: worldX - (cx - sr.left) / z,
        y: worldY - (cy - sr.top) / z,
      };
      apply();
      commit(save);
    }

    function zoomTo(next, clientX, clientY, save) {
      const old = zoom();
      const z = clamp(next);
      if (Math.abs(z - old) < 0.0001) return;
      const sr = scroller.getBoundingClientRect();
      const cx = clientX != null ? clientX : sr.left + sr.width / 2;
      const cy = clientY != null ? clientY : sr.top + sr.height / 2;
      const p = pan();
      const worldX = p.x + (cx - sr.left) / old;
      const worldY = p.y + (cy - sr.top) / old;
      focusWorld(worldX, worldY, cx, cy, z, save);
    }

    function setPan(x, y, save) {
      state.camera.pan = { x: Number(x) || 0, y: Number(y) || 0 };
      apply();
      commit(save);
    }

    function panBy(dx, dy, save) {
      const z = zoom();
      const p = pan();
      setPan(p.x - dx / z, p.y - dy / z, save);
    }

    function centerOn(worldX, worldY, save) {
      const z = zoom();
      setPan(
        worldX - scroller.clientWidth / (2 * z),
        worldY - scroller.clientHeight / (2 * z),
        save
      );
    }

    function contentCenter() {
      const cards = state.cards || [];
      if (!cards.length) return null;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        const x = Number(c.x) || 0;
        const y = Number(c.y) || 0;
        const w = Number(c.w) || 0;
        const h = Number(c.h) || 0;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
      return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    }

    function recenter() {
      const c = contentCenter();
      if (!c) {
        setPan(0, 0, true);
        return;
      }
      centerOn(c.x, c.y, true);
    }

    function hydrate(board) {
      state.camera = normalize(board && board.camera);
      apply();
    }

    function flush(board) {
      if (!board) return;
      const p = pan();
      board.camera = {
        pan: { x: p.x, y: p.y },
        zoom: zoom(),
      };
    }

    function isPinching() {
      return Boolean(pinch) || pointers.size >= 2 || usingGesture;
    }

    // Chrome/Safari macOS: trackpad pinch is wheel+ctrlKey (ctrl not actually held).
    // Plain wheel is two-finger pan or a mouse wheel — never zoom.
    function isPinchWheel(ev) {
      return ev.ctrlKey || ev.metaKey;
    }

    function wheelPx(ev) {
      const unit = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? scroller.clientHeight : 1;
      return { x: ev.deltaX * unit, y: ev.deltaY * unit };
    }

    function onWheel(ev) {
      if (blocked()) return;
      if (usingGesture) {
        ev.preventDefault();
        return;
      }
      if (isPinchWheel(ev)) {
        ev.preventDefault();
        zoomTo(zoom() * Math.exp(-ev.deltaY * 0.012), ev.clientX, ev.clientY);
        return;
      }
      ev.preventDefault();
      const d = wheelPx(ev);
      panBy(-d.x, -d.y);
    }

    function onGestureStart(ev) {
      if (blocked()) return;
      ev.preventDefault();
      usingGesture = true;
      gestureBase = zoom();
      if (root.DataBasedSelect && typeof root.DataBasedSelect.abortGesture === "function") {
        root.DataBasedSelect.abortGesture();
      }
    }

    function onGestureChange(ev) {
      if (!usingGesture) return;
      ev.preventDefault();
      zoomTo(gestureBase * ev.scale, ev.clientX, ev.clientY, false);
    }

    function onGestureEnd(ev) {
      ev.preventDefault();
      usingGesture = false;
      commit(true);
    }

    function pts() {
      return [...pointers.values()];
    }

    function beginPinch() {
      const pair = pts();
      if (pair.length < 2) return;
      const m = mid(pair[0], pair[1]);
      pinch = {
        dist: Math.max(1, dist(pair[0], pair[1])),
        zoom: zoom(),
        world: toWorld({ clientX: m.x, clientY: m.y }),
      };
      if (root.DataBasedSelect && typeof root.DataBasedSelect.abortGesture === "function") {
        root.DataBasedSelect.abortGesture();
      }
    }

    function movePinch() {
      if (!pinch || usingGesture) return;
      const pair = pts();
      if (pair.length < 2) return;
      const m = mid(pair[0], pair[1]);
      const next = pinch.zoom * (dist(pair[0], pair[1]) / pinch.dist);
      focusWorld(pinch.world.x, pinch.world.y, m.x, m.y, next, false);
    }

    function onPointerDown(ev) {
      if (blocked()) return;
      if (ev.pointerType === "mouse" && ev.button != null && ev.button !== 0) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2) beginPinch();
    }

    function onPointerMove(ev) {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pointers.size >= 2) {
        ev.preventDefault();
        movePinch();
      }
    }

    function onPointerUp(ev) {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2 && pinch) {
        pinch = null;
        commit(true);
      }
    }

    function onTouchGuard(ev) {
      if (ev.touches && ev.touches.length >= 2) ev.preventDefault();
    }

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("gesturestart", onGestureStart);
    scroller.addEventListener("gesturechange", onGestureChange);
    scroller.addEventListener("gestureend", onGestureEnd);
    scroller.addEventListener("pointerdown", onPointerDown);
    scroller.addEventListener("pointermove", onPointerMove, { passive: false });
    scroller.addEventListener("pointerup", onPointerUp);
    scroller.addEventListener("pointercancel", onPointerUp);
    scroller.addEventListener("touchstart", onTouchGuard, { passive: false });
    scroller.addEventListener("touchmove", onTouchGuard, { passive: false });

    window.addEventListener("keydown", (ev) => {
      if (blocked() || typingTarget(ev.target)) return;
      if (ev.key === "+" || ev.key === "=") {
        ev.preventDefault();
        zoomTo(zoom() * STEP);
        return;
      }
      if (ev.key === "-" || ev.key === "_") {
        ev.preventDefault();
        zoomTo(zoom() / STEP);
        return;
      }
      if (ev.key === "0" || ev.key === "1") {
        ev.preventDefault();
        zoomTo(1);
      }
    });

    if (label) {
      label.addEventListener("click", () => zoomTo(1));
    }
    if (home) {
      home.addEventListener("click", () => recenter());
    }

    apply();

    const camera = {
      attach: attachCamera,
      toWorld,
      zoomTo,
      zoom,
      pan,
      setPan,
      panBy,
      centerOn,
      recenter,
      hydrate,
      flush,
      apply,
      restorePan: apply,
      normalize,
      isPinching,
    };
    root.Camera = camera;
    return camera;
  }

  root.attachCamera = attachCamera;
  root.Camera = root.Camera || { attach: attachCamera, normalize, zoom: () => 1 };
})(typeof window !== "undefined" ? window : globalThis);
