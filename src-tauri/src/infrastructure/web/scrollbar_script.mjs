// Fixed guest-only presentation. No application bridge, page globals, or scroll interception.
((palette = [[82, 161, 145, 255], [99, 196, 176, 255], [117, 230, 207, 255]]) => {
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
    @media (forced-colors: active) {
      :root, * { scrollbar-color: auto !important; }
      ::-webkit-scrollbar-thumb { background: CanvasText !important; }
    }
  `;
  const install = () => {
    const id = "qterm-native-scrollbars";
    let style = document.getElementById(id);
    if (style && style.tagName !== "STYLE") return;
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      (document.head || document.documentElement).append(style);
    }
    if (style.textContent !== css) style.textContent = css;
  };
  if (document.documentElement) install();
  else {
    // WebView2 runs this before <html> exists. DOMContentLoaded is too late:
    // streamed HTML can already paint with platform scrollbars while parsing.
    // Mutation callbacks run before rendering, so install on the first root.
    const observer = new MutationObserver(() => {
      if (!document.documentElement) return;
      observer.disconnect();
      install();
    });
    observer.observe(document, { childList: true });
  }
})
