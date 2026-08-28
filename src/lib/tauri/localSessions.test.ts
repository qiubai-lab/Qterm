import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  handlers: [] as Array<(event: unknown) => void>,
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  Channel: class {
    constructor(handler: (event: unknown) => void) {
      mocks.handlers.push(handler);
    }
  },
}));

import { closeLocalSession, connectLocalSession, getLocalTerminalCapabilities, resizeLocalSession, writeLocalSession } from "./localSessions";

describe("local terminal IPC client", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.handlers.length = 0;
  });

  it("opens the default shell with ordered event and terminal channels", async () => {
    mocks.invoke.mockResolvedValue({ sessionId: "local-1", cwd: "/Users/tester" });
    const onEvent = vi.fn();
    const onTerminalData = vi.fn();

    await expect(connectLocalSession(120, 40, onEvent, onTerminalData)).resolves.toEqual({ sessionId: "local-1", cwd: "/Users/tester" });

    expect(mocks.invoke).toHaveBeenCalledWith("local_session_connect", {
      columns: 120,
      rows: 40,
      onEvent: expect.any(Object),
      onTerminal: expect.any(Object),
    });
    mocks.handlers[0]?.({ type: "stateChanged", state: "connected" });
    mocks.handlers[1]?.({ data: [65, 66] });
    expect(onEvent).toHaveBeenCalledWith({ type: "stateChanged", state: "connected" });
    expect(onTerminalData).toHaveBeenCalledWith(Uint8Array.from([65, 66]));
  });

  it("passes an inherited working directory only when one is supplied", async () => {
    mocks.invoke.mockResolvedValue({ sessionId: "local-2", cwd: "C:/work/project" });

    await connectLocalSession(80, 24, vi.fn(), vi.fn(), "C:/work/project");

    expect(mocks.invoke).toHaveBeenCalledWith("local_session_connect", expect.objectContaining({
      initialDirectory: "C:/work/project",
    }));
  });

  it("routes input, resize, and close to local session commands", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await writeLocalSession("local-1", Uint8Array.from([100, 105, 114, 13]));
    await resizeLocalSession("local-1", 100, 32);
    await closeLocalSession("local-1");

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "local_session_write", { sessionId: "local-1", data: [100, 105, 114, 13] });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "local_session_resize", { sessionId: "local-1", columns: 100, rows: 32 });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, "local_session_close", { sessionId: "local-1" });
  });

  it("loads the native PTY compatibility metadata", async () => {
    mocks.invoke.mockResolvedValue({ windowsPty: { backend: "conpty", buildNumber: 26100 } });

    await expect(getLocalTerminalCapabilities()).resolves.toEqual({
      windowsPty: { backend: "conpty", buildNumber: 26100 },
    });
    expect(mocks.invoke).toHaveBeenCalledWith("local_terminal_capabilities");
  });
});
