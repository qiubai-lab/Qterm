import type { ILinkHandler } from "@xterm/xterm";

import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

export function createTerminalOsc8LinkHandler(getBlockId?: () => string | undefined): ILinkHandler { return {
  activate(event, uri) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (getBlockId) requestTerminalExternalLink(uri, "osc8", getBlockId());
    else requestTerminalExternalLink(uri, "osc8");
  },
}; }

export const terminalOsc8LinkHandler = createTerminalOsc8LinkHandler();
