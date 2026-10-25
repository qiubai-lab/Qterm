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

  expect(screen.getByRole("dialog", { name: "打开链接？" })).toHaveTextContent("终端文本链接");
  expect(screen.getByText("https://example.com/docs?from=terminal")).toBeVisible();
  expect(screen.getByText(/终端输出可能由远程主机或程序生成/)).toBeVisible();
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "外部浏览器打开" }));

  await waitFor(() => expect(mocks.openExternalHttpUrl).toHaveBeenCalledExactlyOnceWith("https://example.com/docs?from=terminal"));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("shows OSC 8 provenance and cancels without invoking the browser", () => {
  render(<TerminalExternalLinkConfirmationHost/>);

  act(() => { requestTerminalExternalLink("http://example.com/osc8", "osc8"); });
  expect(screen.getByRole("dialog", { name: "打开链接？" })).toHaveTextContent("OSC 8");

  fireEvent.click(screen.getByRole("button", { name: "关闭" }));

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

  fireEvent.click(screen.getByRole("button", { name: "外部浏览器打开" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("无法调用系统浏览器，请检查系统设置后重试");
  expect(screen.getByRole("dialog", { name: "打开链接？" })).toBeVisible();
  expect(screen.getByRole("button", { name: "外部浏览器打开" })).toBeEnabled();
});

const origin = { workspaceId: "workspace", blockId: "terminal", profileId: "remote-a", name: "Server A" };

it("captures the source target at click time and presents equal peer destinations with icons", async () => {
  const open = vi.fn();
  const props = { internalSupported: true, resolveOrigin: () => origin, onOpenInternal: open };
  const view = render(<TerminalExternalLinkConfirmationHost {...props}/>);
  act(() => { requestTerminalExternalLink("http://localhost:3000", "web-link", "terminal"); });
  view.rerender(<TerminalExternalLinkConfirmationHost {...props} resolveOrigin={() => ({ ...origin, profileId: null, name: "本地" })}/>);
  expect(screen.getByText(/内部：Server A/)).toBeVisible();
  const internal = screen.getByRole("button", { name: "内部浏览器打开" });
  expect(internal.querySelector('[data-icon="browser"]')).not.toBeNull();
  expect(screen.getByRole("button", { name: "外部浏览器打开" }).querySelector('[data-icon="externalLink"]')).not.toBeNull();
  expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
  fireEvent.click(internal);
  await waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith(origin, "http://localhost:3000"));
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("keeps internal failures retryable and Escape closes without opening externally", async () => {
  const open = vi.fn().mockRejectedValue(new Error("此浏览器已达 99 个标签页"));
  render(<TerminalExternalLinkConfirmationHost internalSupported resolveOrigin={() => origin} onOpenInternal={open}/>);
  act(() => { requestTerminalExternalLink("http://localhost:3000", "osc8", "terminal"); });
  fireEvent.click(screen.getByRole("button", { name: "内部浏览器打开" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("99 个标签页");
  expect(screen.getByRole("button", { name: "内部浏览器打开" })).toBeEnabled();
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mocks.openExternalHttpUrl).not.toHaveBeenCalled();
});

it("prevents duplicate submits and keeps close available while ignoring stale completion", async () => {
  let finish!: () => void;
  const open = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  render(<TerminalExternalLinkConfirmationHost internalSupported resolveOrigin={() => origin} onOpenInternal={open}/>);
  act(() => { requestTerminalExternalLink("http://localhost:3000", "web-link", "terminal"); });
  const internal = screen.getByRole("button", { name: "内部浏览器打开" });
  fireEvent.click(internal); fireEvent.click(internal);
  expect(open).toHaveBeenCalledOnce();
  expect(screen.getByRole("button", { name: "外部浏览器打开" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  act(() => { requestTerminalExternalLink("https://example.com/new", "web-link", "terminal"); });
  await act(async () => finish());
  expect(screen.getByRole("dialog")).toHaveTextContent("https://example.com/new");
});

it("explains unavailable internal browsing while keeping external browsing enabled", () => {
  render(<TerminalExternalLinkConfirmationHost/>);
  act(() => { requestTerminalExternalLink("http://localhost:3000", "web-link"); });
  expect(screen.getByRole("button", { name: "内部浏览器打开" })).toBeDisabled();
  expect(screen.getByText(/Windows 或 macOS 14/)).toBeVisible();
  expect(screen.getByRole("button", { name: "外部浏览器打开" })).toBeEnabled();
});
