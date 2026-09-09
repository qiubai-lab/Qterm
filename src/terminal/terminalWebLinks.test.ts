import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(event: MouseEvent, uri: string) => void>,
  requestTerminalExternalLink: vi.fn(),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class {
    constructor(handler: (event: MouseEvent, uri: string) => void) {
      mocks.handlers.push(handler);
    }
  },
}));

vi.mock("./terminalExternalLinkRequests", () => ({ requestTerminalExternalLink: mocks.requestTerminalExternalLink }));

import { createTerminalWebLinksAddon } from "./terminalWebLinks";

beforeEach(() => {
  mocks.handlers.length = 0;
  mocks.requestTerminalExternalLink.mockReset();
});

it("creates a Web Links addon that requests terminal link confirmation", () => {
  createTerminalWebLinksAddon();
  const event = new MouseEvent("click", { cancelable: true });

  mocks.handlers[0](event, "https://example.com/docs");

  expect(event.defaultPrevented).toBe(true);
  expect(mocks.requestTerminalExternalLink).toHaveBeenCalledExactlyOnceWith("https://example.com/docs", "web-link");
});

it("does not activate a detected web link from a right click", () => {
  createTerminalWebLinksAddon();
  const event = new MouseEvent("click", { button: 2, cancelable: true });

  mocks.handlers[0](event, "https://example.com/docs");

  expect(event.defaultPrevented).toBe(false);
  expect(mocks.requestTerminalExternalLink).not.toHaveBeenCalled();
});
