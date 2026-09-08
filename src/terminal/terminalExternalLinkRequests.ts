import { isExternalHttpUrl } from "../lib/externalUrl";

export type TerminalExternalLinkSource = "web-link" | "osc8";

export interface TerminalExternalLinkRequest {
  source: TerminalExternalLinkSource;
  uri: string;
}

const requestListeners = new Set<(request: TerminalExternalLinkRequest) => void>();

export function requestTerminalExternalLink(uri: string, source: TerminalExternalLinkSource): boolean {
  if (!isExternalHttpUrl(uri) || requestListeners.size === 0) return false;
  requestListeners.forEach((listener) => listener({ source, uri }));
  return true;
}

export function subscribeToTerminalExternalLinkRequests(listener: (request: TerminalExternalLinkRequest) => void): () => void {
  requestListeners.add(listener);
  return () => { requestListeners.delete(listener); };
}
