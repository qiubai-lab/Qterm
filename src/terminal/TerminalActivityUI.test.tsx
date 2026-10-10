import { Terminal } from "@xterm/xterm";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalHeaderMetadata } from "./TerminalHeaderMetadata";
import { TerminalCommandMenuItems } from "./TerminalCommandMenuItems";
import { registerTerminalActivity } from "./terminalActivityRegistry";

const clipboard = vi.hoisted(() => ({ writeText: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);
vi.mock("./notifications/TerminalNotificationProvider", () => ({ useTerminalNotifications: () => ({ enabled: false, unread: () => false }) }));
vi.mock("./TerminalTitleProvider", () => ({ useTerminalTitlePreference: () => ({ enabled: true }) }));
const cleanups: (() => void)[] = [];
afterEach(() => { cleanup(); cleanups.splice(0).forEach((dispose) => dispose()); vi.clearAllMocks(); });
function setup() {
  const terminal = new Terminal({ allowProposedApi: true });
  const registration = registerTerminalActivity("ui");
  terminal.loadAddon(registration.activity.addon);
  cleanups.push(() => { terminal.dispose(); registration.dispose(); });
  const write = (data: string) => act(() => new Promise<void>((resolve) => terminal.write(data, resolve)));
  return { write, terminal };
}
const osc = (value: string) => `\x1b]${value}\x07`;

it("shows bounded application metadata alongside protocol help and hides it when disconnected", async () => {
  const { write } = setup();
  const view = render(<TerminalHeaderMetadata blockId="b" sessionKey="ui" connected/>);
  await write(`${osc("2;Codex")}${osc("9;4;1;42")}`);
  expect(screen.getByLabelText("应用标题：Codex")).toHaveTextContent("Codex");
  expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  await write(osc("9;4;3"));
  expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
  expect(screen.getByRole("progressbar")).toHaveAccessibleName("正在运行");
  fireEvent.focus(screen.getByRole("button"));
  expect(screen.getByRole("tooltip")).toHaveTextContent("OSC 52");
  view.rerender(<TerminalHeaderMetadata blockId="b" sessionKey="ui" connected={false}/>);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("应用标题：Codex")).not.toBeInTheDocument();
});

it("disables missing commands, navigates and copies completed output, with retryable clipboard errors", async () => {
  const { write, terminal } = setup();
  const close = vi.fn();
  render(<TerminalCommandMenuItems sessionKey="ui" close={close}/>);
  expect(screen.getByRole("menuitem", { name: "上一条命令" })).toBeDisabled();
  expect(screen.getByRole("menuitem", { name: "复制命令输出" })).toBeDisabled();
  await write(`${osc("133;A")}$ ${osc("133;B")}echo\r\n${osc("133;C")}hello\r\n${osc("133;D;0")}${osc("133;A")}$ `);
  const scroll = vi.spyOn(terminal, "scrollToLine");
  fireEvent.click(screen.getByRole("menuitem", { name: "上一条命令" }));
  expect(scroll).toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  clipboard.writeText.mockRejectedValueOnce(new Error("clipboard busy"));
  fireEvent.click(screen.getByRole("menuitem", { name: "复制命令输出" }));
  expect(await screen.findByText("复制失败，请重试")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "复制命令输出" }));
  await act(async () => undefined);
  expect(clipboard.writeText).toHaveBeenLastCalledWith("hello");
  expect(close).toHaveBeenCalledTimes(2);
});

it("clears a previous application title on a path report while retaining independent progress", async () => {
  const { write } = setup();
  render(<TerminalHeaderMetadata blockId="b" sessionKey="ui" connected/>);
  await write(`${osc("2;Codex")}${osc("9;4;1;50")}`);
  expect(screen.getByLabelText("应用标题：Codex")).toBeInTheDocument();
  await write(osc("0;root@dev: /tmp/test"));
  expect(screen.queryByLabelText(/^应用标题：/)).not.toBeInTheDocument();
  expect(screen.getByRole("progressbar")).toHaveAccessibleName("进行中 50%");
  await write(osc("2;vim /tmp/test/config.ts"));
  expect(screen.getByLabelText("应用标题：vim /tmp/test/config.ts")).toBeInTheDocument();
  await write(`${osc("9;4;0")}${osc("2;")}`);
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  await waitFor(() => expect(document.querySelector(".terminal-activity-metadata")).not.toBeInTheDocument());
});

it.each([
  ["4;1;0", "running", "进行中 0%", "0"],
  ["4;1;100", "running", "进行中 100%", "100"],
  ["4;4;50", "paused", "已暂停 50%", "50"],
  ["4;2;50", "error", "错误 50%", "50"],
  ["4;2", "error", "错误", null],
  ["4;4", "paused", "已暂停", null],
  ["4;3", "indeterminate", "正在运行", null],
])("presents the reported progress %s without inventing a percentage", async (data, state, name, value) => {
  const { write } = setup();
  render(<TerminalHeaderMetadata blockId="b" sessionKey="ui" connected/>);
  await write(osc(`9;${data}`));
  const progress = screen.getByRole("progressbar", { name });
  expect(progress).toHaveAttribute("data-state", state);
  if (value === null) {
    expect(progress).not.toHaveAttribute("aria-valuenow");
    expect(progress).not.toHaveTextContent("%");
  } else {
    expect(progress).toHaveAttribute("aria-valuenow", value);
    expect(progress).toHaveTextContent(`${value}%`);
  }
  if (state === "paused") expect(progress.querySelector(".terminal-progress-pause")).toBeInTheDocument();
  if (state === "error") expect(progress).toHaveTextContent("!");
});

it("reveals long titles through the themed tooltip on keyboard focus only when truncated", async () => {
  const { write } = setup();
  render(<TerminalHeaderMetadata blockId="b" sessionKey="ui" connected/>);
  await write(osc("2;Codex tests with a long application title"));
  const title = screen.getByLabelText(/^应用标题：/);
  fireEvent.focus(title);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  const text = title.querySelector(".terminal-application-title-text")!;
  Object.defineProperties(text, { scrollWidth: { value: 220 }, clientWidth: { value: 100 } });
  fireEvent.focus(title);
  expect(screen.getByRole("tooltip")).toHaveTextContent("Codex tests with a long application title");
  expect(title).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
});
