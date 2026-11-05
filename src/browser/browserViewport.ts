/** Follow keyboard/browser chrome without treating pinch zoom as a PTY resize. */
export function bindBrowserViewport() {
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const properties = ["--browser-height", "--browser-top"] as const;
  const previous = properties.map(name => root.style.getPropertyValue(name));
  let frame = 0;
  const sync = () => {
    frame = 0;
    if (viewport && Math.abs(viewport.scale - 1) > 0.01) return;
    root.style.setProperty("--browser-height", `${Math.max(1, viewport?.height ?? window.innerHeight)}px`);
    root.style.setProperty("--browser-top", `${viewport?.offsetTop ?? 0}px`);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(sync); };
  sync();
  viewport?.addEventListener("resize", schedule);
  viewport?.addEventListener("scroll", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("pageshow", schedule);
  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", schedule);
    viewport?.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("pageshow", schedule);
    properties.forEach((name, index) => previous[index] ? root.style.setProperty(name, previous[index]) : root.style.removeProperty(name));
  };
}
