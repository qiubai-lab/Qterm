import { describe, expect, it } from "vitest";
import { applicationTerminalTitle } from "./terminalTitle";

describe("application title presentation", () => {
  it.each([
    "root@dev: /tmp/test", "root@dev:~/projects/test", "user@dev: ~",
    "user@[::1]: /srv/app", "/tmp/test", "/", "~/projects/test", "~",
    "C:\\projects\\test", "C:/projects/test", "\\\\server\\share\\test", " /tmp/a b ",
  ])("hides the complete path title %s", title => {
    expect(applicationTerminalTitle(title)).toBe("");
  });

  it.each([
    "Codex", "vim /tmp/test/config.ts", "Codex — ~/projects/test", "任务执行中",
    "build/test", "https://example.com/task", "root@dev", "root@dev: Codex", "C:build",
  ])("preserves the application title %s", title => {
    expect(applicationTerminalTitle(title)).toBe(title);
  });

  it("trims ordinary titles and accepts clearing", () => {
    expect(applicationTerminalTitle("  Codex  ")).toBe("Codex");
    expect(applicationTerminalTitle(" ")).toBe("");
  });
});
