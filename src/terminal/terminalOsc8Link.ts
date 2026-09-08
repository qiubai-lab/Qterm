import type { ILinkHandler } from "@xterm/xterm";

import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

export const terminalOsc8LinkHandler: ILinkHandler = {
  activate(event, uri) {
    event.preventDefault();
    requestTerminalExternalLink(uri, "osc8");
  },
};
