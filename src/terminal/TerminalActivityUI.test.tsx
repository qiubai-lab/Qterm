import { Terminal } from "@xterm/xterm";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TerminalHeaderMetadata } from "./TerminalHeaderMetadata";
import { TerminalCommandMenuItems } from "./TerminalCommandMenuItems";
import { registerTerminalActivity } from "./terminalActivityRegistry";

const clipboard = vi.hoisted(() => ({ writeText: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => clipboard);
vi.mock("./notifications/TerminalNotificationProvider", () => ({ useTerminalNotifications: () => ({ enabled: false, unread: () => false }) }));
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
