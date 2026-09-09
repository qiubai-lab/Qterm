import { WebLinksAddon } from "@xterm/addon-web-links";

import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

export function createTerminalWebLinksAddon(): WebLinksAddon {
  return new WebLinksAddon((event, uri) => {
    if (event.button !== 0) return;
    event.preventDefault();
    requestTerminalExternalLink(uri, "web-link");
  });
}
