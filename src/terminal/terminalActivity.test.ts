import { Terminal } from "@xterm/xterm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTerminalActivity, EMPTY_ACTIVITY, parseTerminalProgress } from "./terminalActivity";
import { getTerminalActivity, registerTerminalActivity } from "./terminalActivityRegistry";

const terminals: Terminal[] = [];
afterEach(() => { terminals.splice(0).forEach((terminal) => terminal.dispose()); });
function setup(cols = 80, rows = 4, scrollback = 100) {
  const terminal = new Terminal({ allowProposedApi: true, cols, rows, scrollback });
  terminals.push(terminal);
  const activity = createTerminalActivity();
  terminal.loadAddon(activity.addon);
  const write = (data: string) => new Promise<void>((resolve) => terminal.write(data, resolve));
  return { terminal, activity, write };
}
const osc = (value: string) => `\x1b]${value}\x07`;
const command = (text: string, code = 0) => `${osc("133;A")}$ ${osc("133;B")}echo\r\n${osc("133;C")}${text}${osc(`133;D;${code}`)}`;

describe("OSC 133 normal-buffer command regions", () => {
  it("copies output without prompts, preserves wraps and navigates command boundaries", async () => {
    const { terminal, activity, write } = setup(10);
    await write(command("abcdefghijklm\r\nsecond\r\n", 7));
    await write(command("latest\r\n"));
    expect(activity.output()).toBe("latest");
    expect(activity.snapshot().commands.exitCode).toBe(0);
    const scroll = vi.spyOn(terminal, "scrollToLine");
    activity.navigate("previous"); activity.navigate("previous");
    expect(activity.output()).toBe("abcdefghijklm\nsecond");
    expect(activity.snapshot().commands.exitCode).toBe(7);
    expect(activity.snapshot().commands.previous).toBe(false);
    expect(scroll).toHaveBeenCalled();
    activity.navigate("next");
    expect(activity.output()).toBe("latest");
    expect(activity.snapshot().commands.next).toBe(false);
  });

  it("handles partial-line bounds, empty output, incomplete and malformed commands", async () => {
    const { activity, write } = setup();
    await write(`${osc("133;C")}untracked${osc("133;D;0")}`);
    expect(activity.output()).toBeNull();
    await write(`${osc("133;A")}prompt${osc("133;B")}input${osc("133;C")}output${osc("133;D;1")}next prompt`);
    expect(activity.output()).toBe("output");
    await write(`\r\n${command("")}`);
    expect(activity.output()).toBe("");
    expect(activity.snapshot().commands.canCopy).toBe(false);
    await write(`${osc("133;A")}${osc("133;C")}unfinished${osc("133;D;invalid")}`);
    activity.navigate("previous");
    expect(activity.output()).toBeNull();
  });

  it("bounds history and discards regions evicted from scrollback", async () => {
    const { activity, write } = setup(80, 2, 1);
    await write(command("old\r\n"));
    await write("\r\n".repeat(20));
    expect(activity.snapshot().commands.count).toBe(0);
    expect(activity.output()).toBeNull();
    await write(Array.from({ length: 250 }, () => command("")).join(""));
    expect(activity.snapshot().commands.count).toBeLessThanOrEqual(200);
  });

  it("caps live command markers even when scrollback retains every command", async () => {
    const { activity, write } = setup(80, 4, 1000);
    await write(Array.from({ length: 230 }, () => command("result\r\n")).join(""));
    expect(activity.snapshot().commands.count).toBe(200);
    expect(activity.output()).toBe("result");
    await write("\x1b[2J");
    expect(activity.snapshot().commands.count).toBe(0);
  });

  it("preserves Unicode and rejects output beyond the copy limit", async () => {
    const { activity, write } = setup(1000, 4, 2000);
    await write(command("中文 👋\r\n"));
    expect(activity.output()).toBe("中文 👋");
    await write(command("x".repeat(1024 * 1024 + 1)));
    expect(activity.output()).toBeNull();
  });

  it("does not copy alternate-screen applications and clears ambiguous positions on resize", async () => {
    const { terminal, activity, write } = setup();
    await write(`${osc("133;A")}$ tui\r\n${osc("133;C")}\x1b[?1049hprivate TUI`);
    expect(activity.snapshot().commands.previous).toBe(false);
    expect(activity.output()).toBeNull();
    await write(`\x1b[?1049l${osc("133;D;0")}`);
    expect(activity.output()).toBeNull();
    await write(command("safe\r\n"));
    terminal.resize(90, 4);
    expect(activity.snapshot().commands.count).toBe(0);
  });
});

describe("progress, titles and lifecycle", () => {
  it("updates OSC 0/2 titles, strips controls/bidi and limits their length", async () => {
    const { activity, write } = setup();
    await write(osc("0;Codex")); expect(activity.snapshot().title).toBe("Codex");
    await write(osc(`2;abc\u202edef${"x".repeat(180)}`));
    expect(activity.snapshot().title).toHaveLength(160);
    expect(activity.snapshot().title).toMatch(/^abcdef/);
    await write(osc("2;")); expect(activity.snapshot().title).toBe("");
  });

  it("parses each progress state, ignores invalid input and keeps notifications separate", async () => {
    const { activity, write } = setup();
    for (const [data, state, value] of [["4;1;50", "running", 50], ["4;2;20", "error", 20], ["4;3", "indeterminate", null], ["4;4", "paused", null]] as const) {
      await write(osc(`9;${data}`));
      expect(activity.snapshot().progress).toEqual({ state, value });
    }
    for (const data of ["Hello", "4;5", "4;1;101", "4;1;-1", "4;1;NaN", "4;1", "4;1;2;3"]) {
      expect(parseTerminalProgress(data)).toBeUndefined();
      await write(osc(`9;${data}`));
    }
    expect(activity.snapshot().progress?.state).toBe("paused");
    await write(osc("9;4;0")); expect(activity.snapshot().progress).toBeNull();
  });

  it("clears all state on RIS, explicit reset and disposal", async () => {
    const { activity, write } = setup();
    const data = `${osc("2;Codex")}${osc("9;4;1;50")}${command("result\r\n")}`;
    await write(data); await write("\x1bc");
    expect(activity.snapshot()).toEqual(EMPTY_ACTIVITY);
    await write(data); activity.reset(); expect(activity.snapshot()).toEqual(EMPTY_ACTIVITY);
    await write(data); activity.addon.dispose(); expect(activity.snapshot()).toEqual(EMPTY_ACTIVITY);
    await write(data); expect(activity.snapshot()).toEqual(EMPTY_ACTIVITY);
  });

  it("does not let an old registry owner remove a replacement", () => {
    const first = registerTerminalActivity("session");
    const second = registerTerminalActivity("session");
    first.dispose(); expect(getTerminalActivity("session")).toBe(second.activity);
    second.dispose(); expect(getTerminalActivity("session")).toBeUndefined();
  });
});
