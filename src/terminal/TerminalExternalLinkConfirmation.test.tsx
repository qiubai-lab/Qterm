import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openExternalHttpUrl: vi.fn() }));

vi.mock("../lib/externalUrl", async (importOriginal) => ({
  ...await importOriginal<typeof import("../lib/externalUrl")>(),
  openExternalHttpUrl: mocks.openExternalHttpUrl,
}));

import { TerminalExternalLinkConfirmationHost } from "./TerminalExternalLinkConfirmation";
import { requestTerminalExternalLink } from "./terminalExternalLinkRequests";

beforeEach(() => mocks.openExternalHttpUrl.mockReset().mockResolvedValue(true));
afterEach(cleanup);

it("shows the actual Web Link target and opens it only after confirmation", async () => {
  render(<TerminalExternalLinkConfirmationHost/>);

  act(() => { requestTerminalExternalLink("https://example.com/docs?from=terminal", "web-link"); });

  expect(screen.getByRole("dialog", { name: "打开外部链接？" })).toHaveTextContent("终端文本链接");
  expect(screen.getByText("https://example.com/docs?from=terminal")).toBeVisible();
  expect(screen.getByText(/终端输出可能由远程主机或程序生成/)).toBeVisible();
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "继续访问" }));

  await waitFor(() => expect(mocks.openExternalHttpUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/docs?from=terminal"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows OSC 8 provenance and cancels without invoking the browser", () => {
  render(<TerminalExternalLinkConfirmationHost/>);

  act(() => { requestTerminalExternalLink("http://example.com/osc8", "osc8"); });
  expect(screen.getByRole("dialog", { name: "打开外部链接？" })).toHaveTextContent("OSC 8");

  fireEvent.click(screen.getByRole("button", { name: "取消" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();
});

it("rejects unsafe targets before displaying a confirmation", () => {
  render(<TerminalExternalLinkConfirmationHost/>);

  act(() => { requestTerminalExternalLink("javascript:alert(1)", "osc8"); });

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();
});

it("keeps the dialog open with feedback when the browser cannot be opened", async () => {
  mocks.openExternalHttpUrl.mockResolvedValue(false);
  render(<TerminalExternalLinkConfirmationHost/>);
  act(() => { requestTerminalExternalLink("https://example.com/retry", "web-link"); });

  fireEvent.click(screen.getByRole("button", { name: "继续访问" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("无法调用系统浏览器，请检查系统设置后重试");
  expect(screen.getByRole("dialog", { name: "打开外部链接？" })).toBeVisible();
  expect(screen.getByRole("button", { name: "继续访问" })).toBeEnabled();
});
