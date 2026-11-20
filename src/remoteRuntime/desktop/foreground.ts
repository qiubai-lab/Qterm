import { framePort } from "./frame";
export function environmentForeground() {
  if (!framePort) return !document.documentElement.hasAttribute("data-remote-foreground");
  if (!framePort.foreground()) return false;
  const overlays = window.parent.document.querySelectorAll<HTMLElement>('[aria-modal="true"],[role="menu"]');
  return !Array.from(overlays).some(element => element.getClientRects().length > 0);
}
