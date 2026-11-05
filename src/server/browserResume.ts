/** Browser resume is a transport boundary, never an instruction to replay input. */
export function watchBrowserResume(resume: () => void) {
  const visible = () => { if (document.visibilityState === "visible") resume(); };
  const online = () => { if (document.visibilityState !== "hidden") resume(); };
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", online);
  return () => {
    document.removeEventListener("visibilitychange", visible);
    window.removeEventListener("online", online);
  };
}
