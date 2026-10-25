// Pointer capture belongs to the visible thumb hit target, never the operating-system cursor.
((document, window, records, schedule) => {
  const LEAVE_DELAY_MS = 600;
  let drag = null, hot = null, suppressed = null, leaveTimer = null;
  const cancelLeave = () => {
    if (leaveTimer !== null) window.clearTimeout(leaveTimer);
    leaveTimer = null;
  };
  const heat = bar => {
    cancelLeave(); // Re-entering the same bar also cancels its pending collapse.
    if (hot === bar) return;
    if (hot) hot.node.removeAttribute("data-active");
    hot = bar;
    hot?.node.setAttribute("data-active", "");
  };
  const leaveLater = () => {
    if (!hot || leaveTimer !== null) return;
    // Measure from the first exit, not every movement outside the rail.
    leaveTimer = window.setTimeout(() => { leaveTimer = null; heat(null); }, LEAVE_DELAY_MS);
  };
  const scroll = (bar, value) => {
    const g = bar.geometry;
    if (!g) return;
    const next = Math.max(0, Math.min(g.range, value));
    bar.element.scrollTo({ [g.axis === "y" ? "top" : "left"]: next * (g.axis === "x" && g.rtl ? -1 : 1), behavior: "instant" });
    schedule();
  };
  const end = () => {
    const previous = drag; drag = null;
    if (previous) {
      suppressed = previous.bar;
      previous.bar.node.removeAttribute("data-dragging");
      if (previous.bar.hit.hasPointerCapture?.(previous.id)) previous.bar.hit.releasePointerCapture(previous.id);
    }
    heat(null);
  };
  const move = event => {
    if (drag) {
      if (event.pointerId !== drag.id) return;
      const delta = (drag.axis === "y" ? event.clientY : event.clientX) - drag.pointer;
      scroll(drag.bar, drag.offset + delta * drag.range / drag.travel * (drag.axis === "x" && drag.rtl ? -1 : 1));
      event.stopPropagation(); event.preventDefault();
      return;
    }
    if (event.pointerType === "touch") return;
    let candidate = null, score = Infinity;
    for (const record of records.values()) for (const bar of record.bars) {
      const g = bar.geometry;
      if (!g) continue;
      const along = g.axis === "y" ? event.clientY : event.clientX;
      const across = g.axis === "y" ? event.clientX : event.clientY;
      const distance = g.axis === "y" && g.rtl ? across - g.edge : g.edge - across;
      if (along < g.visibleStart || along > g.visibleEnd || distance < 0 || distance > 12) continue;
      const priority = distance + (g.root ? 0.1 : 0);
      if (priority < score) { candidate = bar; score = priority; }
    }
    if (candidate !== suppressed) suppressed = null;
    if (candidate && candidate !== suppressed) heat(candidate);
    else leaveLater();
  };
  const finish = event => { if (drag && event.pointerId === drag.id) end(); };
  const leave = event => { if (!drag && !event.relatedTarget) { leaveLater(); suppressed = null; } };
  const attach = bar => {
    bar.hit.addEventListener("pointerdown", event => {
      const g = bar.geometry;
      if (event.button !== 0 || !g || g.travel <= 0) return;
      event.preventDefault(); event.stopPropagation();
      suppressed = null; heat(bar);
      bar.node.setAttribute("data-dragging", "");
      drag = { bar, id: event.pointerId, axis: g.axis, pointer: g.axis === "y" ? event.clientY : event.clientX, offset: g.offset, range: g.range, travel: g.travel, rtl: g.rtl };
      bar.hit.setPointerCapture(event.pointerId);
    });
    bar.hit.addEventListener("lostpointercapture", finish);
    bar.hit.addEventListener("focus", () => heat(bar));
    bar.hit.addEventListener("blur", () => { if (!drag) heat(null); });
    bar.hit.addEventListener("keydown", event => {
      const g = bar.geometry;
      if (!g) return;
      const step = g.axis === "y" ? bar.element.clientHeight : bar.element.clientWidth;
      const amount = { ArrowDown: 40, ArrowRight: g.rtl ? -40 : 40, ArrowUp: -40, ArrowLeft: g.rtl ? 40 : -40, PageDown: step, PageUp: -step }[event.key];
      if (amount === undefined && !["Home", "End"].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      scroll(bar, event.key === "Home" ? 0 : event.key === "End" ? g.range : g.offset + amount);
    });
    bar.hit.addEventListener("wheel", event => {
      const g = bar.geometry;
      if (!g) return;
      const delta = g.axis === "x" ? event.deltaX || event.deltaY : event.deltaY;
      const factor = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (g.axis === "y" ? bar.element.clientHeight : bar.element.clientWidth) : 1;
      if ((delta < 0 && g.offset > 0) || (delta > 0 && g.offset < g.range)) { event.preventDefault(); scroll(bar, g.offset + delta * factor); }
    }, { passive: false });
  };
  const start = () => {
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerup", finish, true);
    document.addEventListener("pointercancel", finish, true);
    document.addEventListener("pointerout", leave, true);
    window.addEventListener("blur", end);
  };
  const stop = () => {
    end(); suppressed = null;
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", finish, true);
    document.removeEventListener("pointercancel", finish, true);
    document.removeEventListener("pointerout", leave, true);
    window.removeEventListener("blur", end);
  };
  return { attach, start, stop, removed(bar) { if (drag?.bar === bar) end(); if (hot === bar) heat(null); if (suppressed === bar) suppressed = null; } };
})
