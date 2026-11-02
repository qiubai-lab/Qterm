import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AccessLogDialog } from "./AccessLogDialog";
import { AccessLogControl } from "./AccessLogControl";
import { pauseData, resumeData } from "../dataAccess";
import type { AccessEvent, AccessLogPage } from "./model";

const transport = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("../http", () => ({ api: transport.api }));
const event: AccessEvent = { id: "event-1", timestamp: Date.UTC(2026, 10, 2), kind: "vaultUnlock", success: false, reason: "verificationFailed", source: { ip: "192.0.2.1", browser: "Example browser / test", session: "independent-session" } };
const page = (entries = [event], nextCursor: string | null = null): AccessLogPage => ({ entries, nextCursor, recordingHealthy: true, droppedEvents: 0 });
beforeEach(() => { resumeData(); transport.api.mockReset().mockResolvedValue(page()); });
afterEach(() => { cleanup(); resumeData(); });

it("opens a separate detail dialog and preserves filters, scroll and row focus on close or Escape", async () => {
  const user = userEvent.setup(), close = vi.fn();
  render(<AccessLogDialog onClose={close}/>);
  await user.selectOptions(screen.getByRole("combobox", {name: "结果"}), "false");
  const row = await screen.findByRole("button", {name: /凭证库解锁 失败/});
  const viewport = row.closest(".access-log-viewport")!;
  viewport.scrollTop = 150;
  await user.click(row);
  expect(screen.getAllByRole("dialog")).toHaveLength(2);
  expect(screen.getByText("independent-session")).toBeInTheDocument();
  await user.click(within(screen.getByRole("dialog", {name: "访问记录详情"})).getByRole("button", {name:"关闭"}));
  expect(screen.queryByRole("dialog", {name:"访问记录详情"})).not.toBeInTheDocument();
  expect(screen.getByRole("combobox", {name:"结果"})).toHaveValue("false");
  expect(viewport.scrollTop).toBe(150);
  expect(row).toHaveFocus();
  expect(close).not.toHaveBeenCalled();
  await user.keyboard("{Enter}{Escape}");
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
  expect(row).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});

it("replaces pages, supports going back and resets pagination on refresh", async () => {
  const secondEvent = {...event, id:"event-2", kind:"login" as const};
  transport.api.mockResolvedValueOnce(page([event], event.id)).mockResolvedValueOnce(page([secondEvent]))
    .mockResolvedValueOnce(page([event], event.id)).mockResolvedValueOnce(page([]));
  const user = userEvent.setup();
  render(<AccessLogDialog onClose={vi.fn()}/>);
  await screen.findByRole("button", {name:/凭证库解锁 失败/});
  expect(screen.getByRole("button", {name:"上一页"})).toBeDisabled();
  const viewport = document.querySelector(".access-log-viewport")!;
  viewport.scrollTop = 150;
  await user.click(screen.getByRole("button", {name:"下一页"}));
  expect(await screen.findByRole("button", {name:/登录认证 失败/})).toBeInTheDocument();
  expect(screen.queryByRole("button", {name:/凭证库解锁 失败/})).not.toBeInTheDocument();
  expect(screen.getByText("第 2 页")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"下一页"})).toBeDisabled();
  expect(viewport.scrollTop).toBe(0);
  const first = new URL(transport.api.mock.calls[0][0], "https://test.invalid");
  const second = new URL(transport.api.mock.calls[1][0], "https://test.invalid");
  expect(second.searchParams.get("from")).toBe(first.searchParams.get("from"));
  expect(second.searchParams.get("to")).toBe(first.searchParams.get("to"));
  expect(second.searchParams.get("before")).toBe(event.id);
  await user.click(screen.getByRole("button", {name:"上一页"}));
  expect(await screen.findByRole("button", {name:/凭证库解锁 失败/})).toBeInTheDocument();
  expect(screen.getByText("第 1 页")).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"刷新"}));
  expect(await screen.findByText("没有符合条件的记录")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:"下一页"})).toBeDisabled();
});

it("opens the complete dialog immediately with skeleton rows until the request completes", async () => {
  let finish!: (value: AccessLogPage) => void;
  transport.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const user = userEvent.setup();
  render(<AccessLogControl/>);
  await user.click(screen.getByRole("button", {name:"访问记录"}));
  const dialog = screen.getByRole("dialog", {name:"访问记录"});
  expect(dialog).toHaveClass("access-log-dialog");
  expect(within(dialog).getByRole("combobox", {name:"时间范围"})).toBeInTheDocument();
  expect(within(dialog).getByRole("list", {name:"访问记录列表"})).toHaveAttribute("aria-busy", "true");
  expect(dialog.querySelectorAll(".access-log-skeleton")).toHaveLength(10);
  expect(screen.queryByText("正在加载…")).not.toBeInTheDocument();
  expect(screen.getByRole("button", {name:"下一页"})).toBeDisabled();
  await act(async () => { finish(page()); });
  expect(screen.getByRole("dialog", {name:"访问记录"})).toBe(dialog);
  expect(dialog.querySelector(".access-log-skeleton")).toBeNull();
  expect(screen.getByRole("button", {name:/凭证库解锁 失败/})).toBeInTheDocument();
});

it("retains the last successful page after a failed page request and resets to page one on filtering", async () => {
  transport.api.mockResolvedValueOnce(page([event], event.id)).mockRejectedValueOnce(new Error("翻页失败"))
    .mockResolvedValueOnce(page([{...event,id:"event-2"}])).mockResolvedValueOnce(page([]));
  const user = userEvent.setup();
  render(<AccessLogDialog onClose={vi.fn()}/>);
  await screen.findByRole("button", {name:/凭证库解锁 失败/});
  await user.click(screen.getByRole("button", {name:"下一页"}));
  expect(await screen.findByText("翻页失败")).toBeInTheDocument();
  expect(screen.getByText("第 1 页")).toBeInTheDocument();
  expect(screen.getByRole("button", {name:/凭证库解锁 失败/})).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"下一页"}));
  await waitFor(() => expect(screen.getByText("第 2 页")).toBeInTheDocument());
  await user.selectOptions(screen.getByRole("combobox", {name:"事件类型"}), "login");
  expect(await screen.findByText("没有符合条件的记录")).toBeInTheDocument();
  expect(screen.getByText("第 1 页")).toBeInTheDocument();
  expect(new URL(transport.api.mock.calls[3][0], "https://test.invalid").searchParams.has("before")).toBe(false);
});

it("ignores stale filter responses and exposes storage degradation", async () => {
  let finish!: (value: AccessLogPage) => void;
  transport.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  transport.api.mockResolvedValueOnce({...page([]), recordingHealthy:false, droppedEvents:3});
  const user = userEvent.setup();
  render(<AccessLogDialog onClose={vi.fn()}/>);
  await user.selectOptions(screen.getByRole("combobox", {name:"事件类型"}), "login");
  expect(await screen.findByText(/日志记录异常.*3 条/)).toBeInTheDocument();
  await act(async () => { finish(page()); });
  expect(screen.queryByRole("button", {name:/凭证库解锁 失败/})).not.toBeInTheDocument();
  expect(transport.api.mock.calls[0][3].aborted).toBe(true);
});

it("clears both dialogs on lock and requires reopening after resume, ignoring pending requests", async () => {
  const user = userEvent.setup();
  render(<AccessLogControl/>);
  await user.click(screen.getByRole("button", {name:"访问记录"}));
  await user.click(await screen.findByRole("button", {name:/凭证库解锁 失败/}));
  act(pauseData);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  act(resumeData);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  let finish!: (value: AccessLogPage) => void;
  transport.api.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await user.click(screen.getByRole("button", {name:"访问记录"}));
  act(pauseData);
  await act(async () => { finish(page()); });
  act(resumeData);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("shows an actionable error without losing the dialog and retries on refresh", async () => {
  transport.api.mockRejectedValueOnce(new Error("读取失败"));
  const user = userEvent.setup();
  render(<AccessLogDialog onClose={vi.fn()}/>);
  expect(await screen.findByText("读取失败")).toBeInTheDocument();
  await user.click(screen.getByRole("button", {name:"刷新"}));
  expect(await screen.findByRole("button", {name:/凭证库解锁 失败/})).toBeInTheDocument();
});

it("shows truncated row metadata in a themed tooltip and dismisses it when opening full details", async () => {
  const user = userEvent.setup();
  const longIp = "2001:db8:1234:5678:1234:5678:abcd:1234";
  transport.api.mockResolvedValue(page([{...event, source:{...event.source, ip:longIp}}]));
  render(<AccessLogDialog onClose={vi.fn()}/>);
  const row = await screen.findByRole("button", {name:/凭证库解锁 失败/});
  await user.hover(row);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  await user.unhover(row);
  const source = within(row).getByText(longIp);
  Object.defineProperties(source, { scrollWidth:{value:260}, clientWidth:{value:132} });
  await user.hover(row);
  expect(screen.getByRole("tooltip")).toHaveTextContent(longIp);
  await user.click(row);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(within(screen.getByRole("dialog", {name:"访问记录详情"})).getByText(longIp)).toBeInTheDocument();
});
