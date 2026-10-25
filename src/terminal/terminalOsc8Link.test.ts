import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requestTerminalExternalLink: vi.fn() }));

vi.mock("./terminalExternalLinkRequests", () => ({ requestTerminalExternalLink: mocks.requestTerminalExternalLink }));

import { createTerminalOsc8LinkHandler, terminalOsc8LinkHandler } from "./terminalOsc8Link";

beforeEach(() => mocks.requestTerminalExternalLink.mockReset());

it("requests confirmation for an activated OSC 8 link", () => {
  const event = new MouseEvent("click", { cancelable: true });

  terminalOsc8LinkHandler.activate(event, "https://example.com/docs", { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } });

  expect(event.defaultPrevented).toBe(true);
  expect(mocks.requestTerminalExternalLink).toHaveBeenCalledExactlyOnceWith("https://example.com/docs", "osc8");
});

it("does not activate an OSC 8 link from a right click", () => {
  const event = new MouseEvent("click", { button: 2, cancelable: true });

  terminalOsc8LinkHandler.activate(event, "https://example.com/docs", { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } });

  expect(event.defaultPrevented).toBe(false);
  expect(mocks.requestTerminalExternalLink).not.toHaveBeenCalled();
});

it("includes the source terminal for an OSC 8 activation", () => {
  const handler = createTerminalOsc8LinkHandler(() => "source-terminal");
  handler.activate(new MouseEvent("click"), "http://localhost:3000", { start: { x: 1, y: 1 }, end: { x: 4, y: 1 } });
  expect(mocks.requestTerminalExternalLink).toHaveBeenCalledExactlyOnceWith("http://localhost:3000", "osc8", "source-terminal");
});
