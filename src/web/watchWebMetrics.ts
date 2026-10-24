import { readWebMetrics, type WebMetrics } from "../lib/tauri/web";

/** Serialized sampling with generation guards; visibility never resets document totals. */
export function watchWebMetrics(id: string, visible: () => boolean, receive: (value: WebMetrics | null) => void) {
  let disposed = false;
  let generation = 0;
  let documentId: number | null = null;
  let blockedDocument: number | null = null;
  let timer: ReturnType<typeof setTimeout>;
  async function sample() {
    const epoch = generation;
    if (visible()) {
      try {
        const value = await readWebMetrics(id);
        if (!disposed && epoch === generation && visible() && (value === null || value.documentId !== blockedDocument)) {
          if (value) documentId = value.documentId;
          receive(value);
        }
      } catch {
        if (!disposed && epoch === generation && visible()) receive(null);
      }
    }
    if (!disposed) timer = setTimeout(() => void sample(), 750);
  }
  void sample();
  return {
    reset() { generation++; blockedDocument = documentId; receive(null); },
    settled() { blockedDocument = null; },
    dispose() { disposed = true; generation++; clearTimeout(timer); },
  };
}
