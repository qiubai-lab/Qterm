// Document-scoped aggregate only: no resource URLs, payloads, credentials, or IPC bridge.
(() => {
  if (window.top !== window || Object.hasOwn(window, "__qtermPageMetrics")) return;
  if (typeof PerformanceObserver === "undefined") return;
  let resources = 0;
  const count = entries => { resources = Math.min(1000000, resources + entries.length); };
  const observer = new PerformanceObserver(list => count(list.getEntries()));
  observer.observe({ type: "resource", buffered: true });
  Object.defineProperty(window, "__qtermPageMetrics", {
    value: () => {
      count(observer.takeRecords());
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        url: location.href,
        documentId: performance.timeOrigin,
        resources: Math.min(1000000, resources + (navigation?.responseEnd > 0 ? 1 : 0)),
        loadMs: Math.round(navigation?.loadEventEnd || 0),
      };
    },
  });
})();
