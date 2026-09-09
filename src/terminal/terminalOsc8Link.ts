import type { ILinkHandler } from "@xterm/xterm";

import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

export const terminalOsc8LinkHandler: ILinkHandler = {
  activate(event, uri) {
    if (event.button !== 0) return;
    event.preventDefault();
    requestTerminalExternalLink(uri, "osc8");
  },
};
