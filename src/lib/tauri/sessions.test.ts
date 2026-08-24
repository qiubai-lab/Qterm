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

import {
  acceptHostKey,
  closeSession,
  connectSession,
  rejectHostKey,
  resizeSession,
  writeSession,
} from "./sessions";

describe("SSH session IPC client", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.handlers.length = 0;
  });

  it("uses an ordered channel for session and host-key events", async () => {
    mocks.invoke.mockResolvedValue("session-1");
    const onEvent = vi.fn();
    const onTerminalData = vi.fn();
    await connectSession(
      {
        profileId: "profile-1",
        auth: { method: "password", password: "temporary" },
        terminalSize: { columns: 93, rows: 31 },
      },
      onEvent,
      onTerminalData,
    );

    expect(mocks.invoke).toHaveBeenCalledWith("session_connect", {
      input: {
        profileId: "profile-1",
        auth: { method: "password", password: "temporary" },
        terminalSize: { columns: 93, rows: 31 },
      },
      onEvent: expect.any(Object),
      onTerminal: expect.any(Object),
    });
    mocks.handlers[0]?.({ type: "stateChanged", state: "connecting" });
    expect(onEvent).toHaveBeenCalledWith({
      type: "stateChanged",
      state: "connecting",
    });
    mocks.handlers[1]?.({ data: [27, 91, 109] });
    expect(onTerminalData).toHaveBeenCalledWith(Uint8Array.from([27, 91, 109]));
  });

  it("sends binary terminal input and resize requests", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await writeSession("session-1", Uint8Array.from([108, 115, 13]));
    await resizeSession("session-1", 120, 40);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "session_write", {
      sessionId: "session-1",
      data: [108, 115, 13],
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "session_resize", {
      sessionId: "session-1",
      columns: 120,
      rows: 40,
    });
  });

  it("exposes explicit host-key decisions and idempotent close command", async () => {
    mocks.invoke.mockResolvedValue(undefined);
    await acceptHostKey("session-1");
    await rejectHostKey("session-2");
    await closeSession("session-3");

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "session_accept_host_key", {
      sessionId: "session-1",
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "session_reject_host_key", {
      sessionId: "session-2",
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(3, "session_close", {
      sessionId: "session-3",
    });
  });
});
