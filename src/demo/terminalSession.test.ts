import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_HOME } from "./fixtures";
import { DemoTerminalSession } from "./terminalSession";

function session() {
  let output = "";
  const closed = vi.fn();
  const terminal = new DemoTerminalSession({ host: "localhost", columns: 100, rows: 24, closed, output: data => { output += new TextDecoder().decode(data); } });
  terminal.start();
  return { terminal, closed, text: () => output, write: (text: string) => terminal.write(new TextEncoder().encode(text)) };
}

describe("simulated terminal behavior", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("isolates directories and command histories between sessions", () => {
    const first = session(); const second = session();
    first.write("cd src\r");
    expect(first.terminal.cwd).toBe(`${DEMO_HOME}/src`);
    expect(second.terminal.cwd).toBe(DEMO_HOME);
    second.write("\x1b[A\r");
    expect(second.terminal.cwd).toBe(DEMO_HOME);
    first.write("cat main.ts\r");
    expect(first.text()).toContain('console.log("Welcome to Qterm");');
    first.write("cd /missing\r");
    expect(first.terminal.cwd).toBe(`${DEMO_HOME}/src`);
    expect(first.text()).toContain("没有该演示目录");
  });

  it("accepts split escape sequences, cursor editing, history and UTF-8 bytes", () => {
    const client = session();
    client.write("cd srX\x7fc\x1b["); client.write("D\x1b[C\r");
    expect(client.terminal.cwd).toBe(`${DEMO_HOME}/src`);
    client.write("cd ..\r\x1b[A\r");
    expect(client.terminal.cwd).toBe("/home/demo");
    const bytes = new TextEncoder().encode("echo 你好\r");
    for (const byte of bytes) client.terminal.write(Uint8Array.of(byte));
    expect(client.text()).toContain("\r\n你好\r\n");
  });

  it("handles CRLF once, bracketed paste and unsupported commands without execution", () => {
    const client = session();
    client.write("\x1b[200~echo first\r\necho second\x1b[201~\r");
    expect(client.text()).toContain("\r\nfirst\r\n");
    expect(client.text()).toContain("\r\nsecond\r\n");
    client.write("curl https://example.test\r");
    expect(client.text()).toContain("未模拟此命令");
  });

  it("finishes builds and cancels continuous logs with Ctrl+C", () => {
    const client = session();
    client.write("npm run build\r");
    vi.advanceTimersByTime(1600);
    expect(client.text()).toContain("built in 1.20s");
    expect(vi.getTimerCount()).toBe(0);
    client.write("tail -f logs/app.log\r");
    vi.advanceTimersByTime(2100);
    expect(client.text()).toContain("request 003");
    client.write("\x03");
    const stopped = client.text();
    vi.advanceTimersByTime(5000);
    expect(client.text()).toBe(stopped);
    expect(vi.getTimerCount()).toBe(0);
    client.write("pwd\r");
    expect(client.text()).toContain(`\r\n${DEMO_HOME}\r\n`);
  });

  it("resizes without resetting state and closes idempotently without late output", () => {
    const client = session();
    client.write("cd src\r"); client.terminal.resize(45, 12);
    expect([client.terminal.columns, client.terminal.rows, client.terminal.cwd]).toEqual([45, 12, `${DEMO_HOME}/src`]);
    client.write("npm run build\r"); client.terminal.close(); client.terminal.close();
    const stopped = client.text();
    vi.advanceTimersByTime(5000); client.write("help\r");
    expect(client.text()).toBe(stopped);
    expect(client.closed).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
