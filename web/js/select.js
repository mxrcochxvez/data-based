/* Marquee multi-select, Shift-click, ⌘/Ctrl+A, group-drag. Pan via pan tool or Space. */

(function (root) {
  const THRESH = 6;

  function zoomOf(state) {
    if (root.Camera && typeof root.Camera.zoom === "function") return root.Camera.zoom();
    return (state && state.camera && state.camera.zoom) || 1;
  }

  function canvasPt(canvas, ev) {
    if (root.Camera && typeof root.Camera.toWorld === "function") return root.Camera.toWorld(ev);
    const r = canvas.getBoundingClientRect();
    const z = zoomOf();
    return { x: (ev.clientX - r.left) / z, y: (ev.clientY - r.top) / z };
  }

  function rectFrom(a, b) {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
  }

  function overlaps(card, r) {
    return card.x < r.x + r.w && card.x + card.w > r.x && card.y < r.y + r.h && card.y + card.h > r.y;
  }

  function typingTarget(t) {
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;
  }

  function attachSelect(canvasApi) {
    const canvas = canvasApi.canvas;
    const scroller = canvasApi.scroller;
    const state = canvasApi.state;
    const marquee = canvasApi.marquee || document.getElementById("marquee");
    const persist = canvasApi.persist;
    const cardFromEvent = canvasApi.cardFromEvent;
    const paintCard = canvasApi.paintCard;
    const paintSel = canvasApi.paintSel;
    const blocked = canvasApi.blocked || (() => false);

    function idsOf(sel) {
      if (!sel && sel !== 0) return [];
      if (sel instanceof Set) return [...sel];
      if (Array.isArray(sel)) return sel;
      return [sel];
    }

    function setSelection(ids, _primary) {
      if (typeof canvasApi.setSelection === "function") {
        canvasApi.setSelection(ids, _primary);
        return;
      }
      state.sel = new Set(ids || []);
      state.sels = state.sel;
      if (typeof paintSel === "function") paintSel();
      if (root.DataBasedLiveblocks && typeof root.DataBasedLiveblocks.updateSelection === "function") {
        root.DataBasedLiveblocks.updateSelection([...state.sel]);
      }
    }

    if (!(state.sel instanceof Set)) state.sel = new Set(idsOf(state.sel));
    if (!(state.sels instanceof Set)) state.sels = state.sel;

    let spacePan = false;
    let session = null;

    function panning() {
      return state.tool === "pan" || spacePan;
    }

    function applyPanClass() {
      canvas.classList.toggle("is-pan", panning());
    }

    function selectedIds() {
      const fromSels = idsOf(state.sels);
      if (fromSels.length) return fromSels;
      return idsOf(state.sel);
    }

    function selectAll() {
      if (blocked() || typingTarget(document.activeElement)) return;
      setSelection(state.cards.map((c) => c.id));
    }

    function showMarquee(r) {
      if (!marquee) return;
      marquee.hidden = false;
      marquee.style.left = r.x + "px";
      marquee.style.top = r.y + "px";
      marquee.style.width = r.w + "px";
      marquee.style.height = r.h + "px";
    }

    function hideMarquee() {
      if (!marquee) return;
      marquee.hidden = true;
    }

    function hitIds(r) {
      return state.cards.filter((c) => overlaps(c, r)).map((c) => c.id);
    }

    function paintMoved(ids) {
      for (const id of ids) {
        const card = state.cards.find((c) => c.id === id);
        if (card) paintCard(card);
      }
    }

    function onPointerDown(ev) {
      if (blocked()) return;
      if (ev.button != null && ev.button !== 0) return;
      if (session && session.pointerId != null && ev.pointerId !== session.pointerId) {
        hideMarquee();
        session = null;
        state.dragged = false;
        return;
      }
      if (ev.target.closest(".btn") || ev.target.closest("[data-edit]") || ev.target.closest("[data-next]") || ev.target.closest(".flow-port") || ev.target.closest(".wire-hit") || ev.target.closest(".wire-unlink") || ev.target.closest(".board-menu")) return;

      if (ev.target.closest(".note-text")) {
        const card = cardFromEvent(ev.target);
        if (!card) return;
        if (ev.shiftKey) {
          const next = new Set(selectedIds());
          if (next.has(card.id)) next.delete(card.id);
          else next.add(card.id);
          setSelection([...next], card.id);
        } else {
          setSelection([card.id]);
        }
        return;
      }

      if (panning()) {
        session = {
          kind: "pan",
          pointerId: ev.pointerId,
          x: ev.clientX,
          y: ev.clientY,
          sl: scroller.scrollLeft,
          st: scroller.scrollTop,
        };
        try { scroller.setPointerCapture(ev.pointerId); } catch (_) {}
        return;
      }

      const handle = ev.target.closest(".handle");
      const card = cardFromEvent(ev.target);
      state.dragged = false;

      if (handle && card) {
        setSelection([card.id]);
        session = {
          kind: "resize",
          pointerId: ev.pointerId,
          id: card.id,
          x: ev.clientX,
          y: ev.clientY,
          w: card.w,
          h: card.h,
        };
        state.drag = session;
        try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
        return;
      }

      if (card) {
        const already = selectedIds().includes(card.id);
        if (ev.shiftKey) {
          const next = new Set(selectedIds());
          if (next.has(card.id)) next.delete(card.id);
          else next.add(card.id);
          setSelection([...next], card.id);
        } else if (!already) {
          setSelection([card.id]);
        }
        const ids = selectedIds().includes(card.id) ? selectedIds() : [card.id];
        session = {
          kind: "move",
          pointerId: ev.pointerId,
          ids,
          x: ev.clientX,
          y: ev.clientY,
          origins: ids.map((id) => {
            const c = state.cards.find((k) => k.id === id);
            return c ? { id, left: c.x, top: c.y } : null;
          }).filter(Boolean),
          armed: false,
        };
        state.drag = session;
        try { canvas.setPointerCapture(ev.pointerId); } catch (_) {}
        return;
      }

      const origin = canvasPt(canvas, ev);
      session = {
        kind: "marquee",
        pointerId: ev.pointerId,
        origin,
        additive: ev.shiftKey,
        baseline: ev.shiftKey ? selectedIds() : [],
        armed: false,
      };
      if (!ev.shiftKey) setSelection([]);
    }

    function onPointerMove(ev) {
      if (root.DataBasedLiveblocks && typeof root.DataBasedLiveblocks.updateCursor === "function") {
        root.DataBasedLiveblocks.updateCursor(canvasPt(canvas, ev));
      }
      if (!session) return;
      if (session.pointerId != null && ev.pointerId !== session.pointerId) return;
      if (session.kind === "pan") {
        scroller.scrollLeft = session.sl - (ev.clientX - session.x);
        scroller.scrollTop = session.st - (ev.clientY - session.y);
        return;
      }
      const dx = ev.clientX - session.x;
      const dy = ev.clientY - session.y;
      if (session.kind === "marquee") {
        const now = canvasPt(canvas, ev);
        const box = rectFrom(session.origin, now);
        const z = zoomOf(state);
        if (!session.armed && Math.hypot(box.w, box.h) * z < THRESH) return;
        session.armed = true;
        state.dragged = true;
        showMarquee(box);
        const hit = hitIds(box);
        const merged = session.additive ? [...new Set(session.baseline.concat(hit))] : hit;
        setSelection(merged);
        return;
      }
      if (!session.armed && Math.hypot(dx, dy) < THRESH) return;
      session.armed = true;
      if (Math.hypot(dx, dy) >= THRESH) state.dragged = true;
      if (session.kind === "move") {
        const z = zoomOf(state);
        for (const o of session.origins) {
          const card = state.cards.find((c) => c.id === o.id);
          if (!card) continue;
          card.x = Math.max(8, o.left + dx / z);
          card.y = Math.max(8, o.top + dy / z);
        }
        paintMoved(session.ids);
        if (root.DataBasedLiveblocks && typeof root.DataBasedLiveblocks.broadcastDrag === "function") {
          for (const id of session.ids) {
            const c = state.cards.find((k) => k.id === id);
            if (c) root.DataBasedLiveblocks.broadcastDrag(c.id, c.x, c.y);
          }
        }
        return;
      }
      if (session.kind === "resize") {
        const z = zoomOf(state);
        const card = state.cards.find((c) => c.id === session.id);
        if (!card) return;
        card.w = Math.max(160, session.w + dx / z);
        card.h = Math.max(100, session.h + dy / z);
        paintCard(card);
      }
    }

    function onPointerUp(ev) {
      if (!session) return;
      if (ev && session.pointerId != null && ev.pointerId !== session.pointerId) return;
      if (session.kind === "marquee") {
        if (!session.armed && !session.additive) setSelection([]);
        hideMarquee();
      }
      if (session.kind === "move" || session.kind === "resize") {
        persist({ flush: true });
        if (root.DataBasedSync && typeof root.DataBasedSync.noteLocal === "function") {
          try { root.DataBasedSync.noteLocal(); } catch (_) {}
        }
        if (root.DataBasedLiveblocks && typeof root.DataBasedLiveblocks.broadcastSync === "function") {
          root.DataBasedLiveblocks.broadcastSync();
        }
      }
      session = null;
      state.drag = null;
      state.pan = null;
    }

    function abortGesture() {
      if (!session) return;
      hideMarquee();
      session = null;
      state.dragged = false;
      state.drag = null;
      state.pan = null;
    }

    scroller.addEventListener("selectstart", (ev) => {
      if (ev.target.closest("input, textarea, select, [contenteditable]")) return;
      ev.preventDefault();
    });

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    scroller.addEventListener("pointermove", onPointerMove);
    scroller.addEventListener("pointerup", onPointerUp);
    scroller.addEventListener("pointercancel", onPointerUp);
    scroller.addEventListener("pointerleave", () => {
      if (root.DataBasedLiveblocks && typeof root.DataBasedLiveblocks.clearCursor === "function") {
        root.DataBasedLiveblocks.clearCursor();
      }
    });

    window.addEventListener("keydown", (ev) => {
      if (blocked() || typingTarget(ev.target)) return;
      if ((ev.metaKey || ev.ctrlKey) && (ev.key === "a" || ev.key === "A")) {
        ev.preventDefault();
        selectAll();
        return;
      }
      if (ev.key === " " && !ev.repeat) {
        ev.preventDefault();
        spacePan = true;
        applyPanClass();
      }
    });

    window.addEventListener("keyup", (ev) => {
      if (ev.key === " ") {
        spacePan = false;
        applyPanClass();
      }
    });

    function isDragging() {
      return Boolean(session && (session.kind === "move" || session.kind === "resize"));
    }

    function dragIds() {
      if (!session) return [];
      if (session.kind === "move") return session.ids || [];
      if (session.kind === "resize" && session.id != null) return [session.id];
      return [];
    }

    return {
      selectAll,
      clearSelection: () => setSelection([]),
      isPanning: panning,
      isDragging,
      dragIds,
      abortGesture,
    };
  }

  root.attachSelect = attachSelect;
})(typeof window !== "undefined" ? window : globalThis);
