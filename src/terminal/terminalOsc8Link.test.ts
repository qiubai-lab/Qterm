import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestTerminalExternalLink: vi.fn() }));

vi.mock("./terminalExternalLinkRequests", () => ({ requestTerminalExternalLink: mocks.requestTerminalExternalLink }));

import { terminalOsc8LinkHandler } from "./terminalOsc8Link";

beforeEach(() => mocks.requestTerminalExternalLink.mockReset());

it("requests confirmation for an activated OSC 8 link", () => {
  const event = new MouseEvent("click", { cancelable: true });

  terminalOsc8LinkHandler.activate(event, "https://example.com/docs", { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } });

  expect(event.defaultPrevented).toBe(true);
  expect(mocks.requestTerminalExternalLink).toHaveBeenCalledExactlyOnceWith("https://example.com/docs", "osc8");
});
