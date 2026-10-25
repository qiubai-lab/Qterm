/** Declarative registration: the painted root declares data-app-overlay. ARIA
 * roles describe accessibility only and never determine native visibility. */
export const appOverlaySelector = '[data-app-overlay="floating"], [data-app-overlay="modal"], [data-app-overlay="transition"]';
export interface AppOverlay {
  element: HTMLElement;
  kind: "floating" | "modal" | "transition";
  rect: DOMRect;
  clip: DOMRect | null;
  style: CSSStyleDeclaration;
}

export function measureAppOverlays(elements: Iterable<HTMLElement> = document.querySelectorAll(appOverlaySelector)): AppOverlay[] {
  const result: AppOverlay[] = [];
  for (const element of elements) {
    if (!element.isConnected || !element.matches(appOverlaySelector)) continue;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    let hidden = false;
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent);
      if (parentStyle.display === "none" || parentStyle.visibility === "hidden" || parentStyle.opacity === "0") { hidden = true; break; }
    }
    if (hidden) continue;
    result.push({ element, kind: element.dataset.appOverlay as AppOverlay["kind"], rect, style,
      clip: element.dataset.overlayClip === "parent" ? element.parentElement?.getBoundingClientRect() ?? null : null });
  }
  return result.sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0));
}

/** One observer for all native guests. Steady frames never rescan document. */
export function observeAppOverlays() {
  const elements = new Set(document.querySelectorAll<HTMLElement>(appOverlaySelector));
  const add = (node: Node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(appOverlaySelector)) elements.add(node);
    node.querySelectorAll<HTMLElement>(appOverlaySelector).forEach(element => elements.add(element));
  };
  const refresh = (records: MutationRecord[]) => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLElement) {
        if (record.target.matches(appOverlaySelector)) elements.add(record.target);
        else elements.delete(record.target);
      } else record.addedNodes.forEach(add);
    }
    for (const element of elements) if (!element.isConnected) elements.delete(element);
  };
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-app-overlay"] });
  return { measure: () => { refresh(observer.takeRecords()); return measureAppOverlays(elements); }, dispose: () => { observer.disconnect(); elements.clear(); } };
}

export function overlaps(a: DOMRect, b: DOMRect) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
