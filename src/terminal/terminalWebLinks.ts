import { WebLinksAddon } from "@xterm/addon-web-links";

import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

export function createTerminalWebLinksAddon(getBlockId?: () => string | undefined): WebLinksAddon {
  return new WebLinksAddon((event, uri) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (getBlockId) requestTerminalExternalLink(uri, "web-link", getBlockId());
    else requestTerminalExternalLink(uri, "web-link");
  });
}
