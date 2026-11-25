import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { listenFileDrop, readDroppedEntries, releaseDrop } from "../../lib/tauri/fileDrop";

// WebView2 delivers native events to the main document's callback registry.
// Both the subscription and the one-time file read must originate in that realm.
export function frameFileDrop(frame: HTMLIFrameElement, foreground: () => boolean, lifetime: AbortSignal, runtimeId: string) {
  const listen: typeof listenFileDrop = async handler => {
    const stop = await listenFileDrop(event => {
      if (lifetime.aborted || !foreground()) return;
      const payload = event.payload;
      if (payload.type === "leave") { handler(event); return; }
      const rect = frame.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const position = new PhysicalPosition(
        payload.position.x - rect.left * ratio,
        payload.position.y - rect.top * ratio,
      );
      handler({ ...event, payload: { ...payload, position } });
    });
    // Removing an iframe can discard its document without running React cleanup.
    if (lifetime.aborted) { stop(); return () => {}; }
    lifetime.addEventListener("abort", stop, { once: true });
    return () => {
      if (lifetime.aborted) return;
      lifetime.removeEventListener("abort", stop);
      stop();
    };
  };
  const pending = new Set<string>();
  const release = async (id: string) => {
    if (pending.delete(id)) await releaseDrop(runtimeId, id);
  };
  const releaseAll = () => { for (const id of pending) void release(id); };
  lifetime.addEventListener("abort", releaseAll, { once: true });
  async function prepare(paths: string[]) {
    lifetime.throwIfAborted();
    const owner = frame.contentDocument;
    frame.contentWindow?.addEventListener("pagehide", releaseAll, { once: true });
    const selection = await readDroppedEntries(runtimeId, paths);
    if (lifetime.aborted || frame.contentDocument !== owner) {
      await releaseDrop(runtimeId, selection.id);
      throw new Error("工作区已关闭");
    }
    pending.add(selection.id);
    return selection;
  }
  return { listen, release, prepare };
}
