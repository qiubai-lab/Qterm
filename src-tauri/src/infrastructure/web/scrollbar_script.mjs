// Document-owned presentation only. No application bridge or scroll interception.
((palette = [[82, 161, 145, 255], [99, 196, 176, 255], [117, 230, 207, 255]], createOverlay = () => null) => {
  if (window.top !== window) return;
  const colors = palette.map(([r, g, b, a]) => `rgba(${r},${g},${b},${a / 255})`);
  const css = `
    :root, * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
    ::-webkit-scrollbar { width: 3px !important; height: 3px !important; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent !important; }
    ::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
    ::-webkit-scrollbar-thumb { background: ${colors[0]} !important; border: 0 !important; border-radius: 999px !important; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors[1]} !important; }
    ::-webkit-scrollbar-thumb:active { background: ${colors[2]} !important; }
    :root[data-qterm-scroll], [data-qterm-scroll] { scrollbar-width: none !important; }
    [data-qterm-scroll]::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    @media (forced-colors: active) {
      :root, * { scrollbar-color: auto !important; }
      ::-webkit-scrollbar-thumb { background: CanvasText !important; }
    }
  `;
  const key = Symbol.for("qterm.native-scrollbars");
  if (document[key]) {
    document[key].update(css, colors);
    return;
  }

  const id = "qterm-native-scrollbars";
  const previous = document.getElementById(id);
  const style = previous?.tagName === "STYLE" ? previous : document.createElement("style");
  const overlay = createOverlay(document, window);
  let currentCss = css, currentColors = colors, root = null, frame = 0, active = true;
  const cancel = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const repair = () => {
    cancel();
    observer.disconnect(); // Do not observe our own repairs or leave old roots attached.
    root = document.documentElement;
    if (root) {
      const parent = document.head || root;
      if (style.id !== id) style.id = id;
      for (const attribute of ["media", "type", "disabled"]) style.removeAttribute(attribute);
      if (style.textContent !== currentCss) style.textContent = currentCss;
      // Keep ordinary late styles from replacing equal-specificity scrollbar rules.
      if (style.parentNode !== parent || style.nextSibling) parent.append(style);
      if (style.sheet?.disabled) style.sheet.disabled = false;
      observer.observe(root, { childList: true });
      if (document.head) observer.observe(document.head, { childList: true, subtree: true, characterData: true });
      observer.observe(style, { childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["id", "media", "type", "disabled"] });
    }
    observer.observe(document, { childList: true });
    overlay?.repair(currentColors);
  };
  const observer = new MutationObserver(() => {
    if (!active) return;
    // The first parsed HTML root must be styled before its first paint.
    if (!root && document.documentElement) repair();
    else if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; if (active) repair(); });
  });
  Object.defineProperty(document, key, { value: {
    update(nextCss, nextColors) { currentCss = nextCss; currentColors = nextColors; if (active) repair(); },
  } });
  window.addEventListener("pagehide", () => { active = false; cancel(); observer.disconnect(); overlay?.suspend(); });
  window.addEventListener("pageshow", () => { active = true; overlay?.resume(); repair(); });
  repair();
})
