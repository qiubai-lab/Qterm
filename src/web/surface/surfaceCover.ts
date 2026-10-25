import type { WebSnapshot } from "../../lib/tauri/web";

// decode() only prepares pixels. Give the host a paint opportunity before the
// native region is removed; a suspended renderer must never stall restoration.
function painted() {
  return new Promise<void>(resolve => {
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); window.clearTimeout(timer); resolve(); };
    const timer = window.setTimeout(finish, 100);
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(finish); });
  });
}

/** Imperative native-surface presentation, owned and removed with that guest. */
export function createSurfaceCover(surface: HTMLElement) {
  let node: HTMLElement | null = null;
  let generation = 0;
  const replace = (next: HTMLElement) => {
    next.classList.add("web-surface-cover");
    next.setAttribute("aria-hidden", "true");
    node?.remove(); node = next; surface.prepend(next);
  };
  return {
    async show(snapshot: WebSnapshot, valid: () => boolean) {
      const epoch = ++generation;
      const image = document.createElement("img");
      image.alt = ""; image.draggable = false;
      image.src = `data:image/png;base64,${snapshot.png}`;
      let timer = 0;
      try {
        await Promise.race([image.decode(), new Promise<never>((_, reject) => { timer = window.setTimeout(() => reject(new Error("预览解码超时")), 1500); })]);
        if (epoch !== generation || !valid()) return false;
        replace(image); await painted();
        return epoch === generation && valid();
      } finally { window.clearTimeout(timer); }
    },
    async fallback(valid: () => boolean) {
      if (!valid()) return false;
      const epoch = ++generation;
      const message = document.createElement("div");
      message.className = "web-surface-cover-fallback";
      message.textContent = "网页预览暂不可用";
      replace(message); await painted();
      return epoch === generation && valid();
    },
    clear() { generation++; node?.remove(); node = null; },
  };
}
