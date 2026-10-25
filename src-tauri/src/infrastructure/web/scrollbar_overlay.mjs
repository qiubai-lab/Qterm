// A document-local overlay. Only enhanced elements lose their native scrollbar gutter.
((document, window, geometry, attachInteraction, css) => {
  const host = document.createElement("qterm-scrollbars");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style"); style.textContent = css; shadow.append(style);
  const records = new Map(), scans = new Set(), observed = new Set();
  let body = null, frame = 0, active = true;
  const schedule = () => { if (active && !frame) frame = window.requestAnimationFrame(render); };
  const interaction = attachInteraction(document, window, records, schedule);
  const resize = new window.ResizeObserver(schedule);
  const observeSize = element => {
    for (const node of [element, ...element.children]) if (!observed.has(node)) { resize.observe(node); observed.add(node); }
  };
  const register = element => {
    if (records.has(element) || element === host) return;
    const root = element === document.scrollingElement || element === document.documentElement;
    const computed = window.getComputedStyle(element);
    if (!root && !/(auto|scroll|overlay)/.test(`${computed.overflowX} ${computed.overflowY}`)) return;
    const bars = ["y", "x"].map(axis => {
      const node = document.createElement("div"); node.className = "bar"; node.dataset.axis = axis; node.hidden = true;
      const track = document.createElement("div"); track.className = "track";
      const hit = document.createElement("div"); hit.className = "hit"; hit.tabIndex = 0;
      hit.setAttribute("role", "scrollbar"); hit.setAttribute("aria-label", `${root ? "网页" : "区域"}${axis === "y" ? "纵向" : "横向"}滚动条`);
      hit.setAttribute("aria-orientation", axis === "y" ? "vertical" : "horizontal"); hit.setAttribute("aria-valuemin", "0");
      const thumb = document.createElement("div"); thumb.className = "thumb";
      hit.append(thumb); node.append(track, hit); shadow.append(node);
      const bar = { element, axis, node, hit, geometry: null };
      interaction.attach(bar);
      return bar;
    });
    records.set(element, { bars });
    element.setAttribute("data-qterm-scroll", "");
    observeSize(element);
  };
  const scan = element => {
    if (!element.isConnected || element === host) return;
    register(element);
    for (const child of element.querySelectorAll("*")) register(child);
  };
  const changes = new window.MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") scans.add(mutation.target);
      else {
        if (mutation.target.nodeType === 1) register(mutation.target);
        for (const added of mutation.addedNodes) if (added.nodeType === 1) scans.add(added);
        if (records.has(mutation.target)) observeSize(mutation.target);
      }
    }
    schedule();
  });
  function render() {
    frame = 0;
    if (!active) return;
    for (const element of scans) scan(element);
    scans.clear();
    for (const element of observed) if (!element.isConnected) { resize.unobserve(element); observed.delete(element); }
    for (const [element, record] of records) {
      if (!element.isConnected) {
        record.bars.forEach(bar => { interaction.removed(bar); bar.node.remove(); });
        records.delete(element); continue;
      }
      if (!element.hasAttribute("data-qterm-scroll")) element.setAttribute("data-qterm-scroll", "");
      for (const bar of record.bars) {
        const g = geometry(document, window, element, bar.axis); bar.geometry = g;
        bar.node.hidden = !g;
        if (!g) { interaction.removed(bar); continue; }
        bar.node.toggleAttribute("data-rtl", g.rtl);
        Object.assign(bar.node.style, { left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px`,
          clipPath: g.axis === "y" ? `inset(${g.visibleStart - g.start}px 0 ${g.start + g.length - g.visibleEnd}px 0)` : `inset(0 ${g.start + g.length - g.visibleEnd}px 0 ${g.visibleStart - g.start}px)` });
        const position = g.axis === "x" && g.rtl ? g.travel - g.position : g.position;
        if (g.axis === "y") Object.assign(bar.hit.style, { top: `${position}px`, height: `${g.size}px` });
        else Object.assign(bar.hit.style, { left: `${position}px`, width: `${g.size}px` });
        bar.hit.setAttribute("aria-valuemax", String(Math.round(g.range)));
        bar.hit.setAttribute("aria-valuenow", String(Math.round(g.offset)));
      }
    }
  }
  const events = [ [document, "scroll"], [document, "load"], [window, "resize"] ];
  const repair = colors => {
    if (!active) return;
    ["--thumb", "--hover", "--pressed"].forEach((name, i) => host.style.setProperty(name, colors[i]));
    const root = document.documentElement;
    if (!root) return;
    if (host.parentNode !== root) root.append(host);
    register(document.scrollingElement || root);
    if (body !== document.body) {
      changes.disconnect(); body = document.body;
      if (body) {
        scans.add(body); observeSize(body);
        changes.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden", "data-qterm-scroll"] });
      }
    }
    schedule();
  };
  const suspend = () => {
    active = false;
    if (frame) window.cancelAnimationFrame(frame); frame = 0;
    changes.disconnect(); resize.disconnect(); observed.clear(); interaction.stop();
    events.forEach(([target, name]) => target.removeEventListener(name, schedule, true));
  };
  const resume = () => {
    if (active) return;
    active = true; body = null;
    records.forEach((_, element) => observeSize(element));
    interaction.start(); events.forEach(([target, name]) => target.addEventListener(name, schedule, { capture: true, passive: true }));
  };
  interaction.start(); events.forEach(([target, name]) => target.addEventListener(name, schedule, { capture: true, passive: true }));
  return { repair, suspend, resume };
})
