/* Canvas camera: zoom toward cursor, keyboard +/−/0/1, persist pan+zoom. */

(function (root) {
  const BASE_W = 3600;
  const BASE_H = 2600;
  const MIN = 0.25;
  const MAX = 4;
  const STEP = 1.1;

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

  function attachCamera(api) {
    const canvas = api.canvas;
    const scroller = api.scroller;
    const state = api.state;
    const persist = api.persist;
    const world = api.world || document.getElementById("world");
    const label = api.label || document.getElementById("zoom-pct");
    const blocked = api.blocked || (() => false);

    if (!state.camera) state.camera = normalize(null);
    else state.camera = normalize(state.camera);

    let restoring = false;
    let scrollTimer = 0;

    function zoom() {
      return state.camera.zoom || 1;
    }

    function readPan() {
      const z = zoom();
      return { x: scroller.scrollLeft / z, y: scroller.scrollTop / z };
    }

    function paintLabel() {
      if (!label) return;
      label.textContent = Math.round(zoom() * 100) + "%";
    }

    function apply() {
      const z = zoom();
      canvas.style.transform = "scale(" + z + ")";
      if (world) {
        world.style.width = BASE_W * z + "px";
        world.style.height = BASE_H * z + "px";
      }
      paintLabel();
    }

    function restorePan() {
      restoring = true;
      const z = zoom();
      const pan = state.camera.pan || { x: 0, y: 0 };
      scroller.scrollLeft = pan.x * z;
      scroller.scrollTop = pan.y * z;
      restoring = false;
    }

    function commit(save) {
      state.camera.pan = readPan();
      if (save !== false && typeof persist === "function") persist();
    }

    function toWorld(ev) {
      const r = canvas.getBoundingClientRect();
      const z = zoom();
      return {
        x: (ev.clientX - r.left) / z,
        y: (ev.clientY - r.top) / z,
      };
    }

    function zoomTo(next, clientX, clientY, save) {
      const old = zoom();
      const z = clamp(next);
      if (Math.abs(z - old) < 0.0001) return;
      const sr = scroller.getBoundingClientRect();
      const cx = clientX != null ? clientX : sr.left + sr.width / 2;
      const cy = clientY != null ? clientY : sr.top + sr.height / 2;
      const worldX = (scroller.scrollLeft + (cx - sr.left)) / old;
      const worldY = (scroller.scrollTop + (cy - sr.top)) / old;
      state.camera.zoom = z;
      apply();
      restoring = true;
      scroller.scrollLeft = worldX * z - (cx - sr.left);
      scroller.scrollTop = worldY * z - (cy - sr.top);
      restoring = false;
      commit(save);
    }

    function hydrate(board) {
      state.camera = normalize(board && board.camera);
      apply();
      restorePan();
    }

    function flush(board) {
      if (!board) return;
      state.camera.pan = readPan();
      board.camera = {
        pan: { x: state.camera.pan.x, y: state.camera.pan.y },
        zoom: zoom(),
      };
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

    let gestureBase = 1;
    let usingGesture = false;

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
      scroller.scrollLeft += d.x;
      scroller.scrollTop += d.y;
    }

    function onGestureStart(ev) {
      if (blocked()) return;
      ev.preventDefault();
      usingGesture = true;
      gestureBase = zoom();
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

    scroller.addEventListener("wheel", onWheel, { passive: false });
    scroller.addEventListener("gesturestart", onGestureStart);
    scroller.addEventListener("gesturechange", onGestureChange);
    scroller.addEventListener("gestureend", onGestureEnd);

    scroller.addEventListener("scroll", () => {
      if (restoring) return;
      state.camera.pan = readPan();
      if (typeof persist !== "function") return;
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => persist(), 160);
    });

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

    apply();
    restorePan();

    const camera = {
      attach: attachCamera,
      toWorld,
      zoomTo,
      zoom,
      hydrate,
      flush,
      apply,
      restorePan,
      normalize,
    };
    root.Camera = camera;
    return camera;
  }

  root.attachCamera = attachCamera;
  root.Camera = root.Camera || { attach: attachCamera, normalize, zoom: () => 1 };
})(typeof window !== "undefined" ? window : globalThis);
