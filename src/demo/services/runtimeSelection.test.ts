import { afterEach, expect, it, vi } from "vitest";
import { connectLocalSession, closeLocalSession } from "@qterm/services/localSessions";
import { isDemo } from "../../lib/runtime/environment";
import { resetDemoSessions } from "../sessionRegistry";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn().mockRejectedValue(new Error("native unavailable")) }));
vi.mock("@tauri-apps/api/core", () => ({ invoke, Channel: class {} }));
afterEach(() => { resetDemoSessions(); invoke.mockClear(); });

it("uses the explicitly selected service and never falls back on native failure", async () => {
  if (isDemo) {
    const connection = await connectLocalSession(80, 24, vi.fn(), vi.fn(), true);
    expect(connection.sessionId).toMatch(/^demo-session-/);
    expect(invoke).not.toHaveBeenCalled();
    await closeLocalSession(connection.sessionId);
  } else {
    await expect(connectLocalSession(80, 24, vi.fn(), vi.fn(), true)).rejects.toThrow("native unavailable");
    expect(invoke).toHaveBeenCalledWith("local_session_connect", expect.objectContaining({ columns: 80, rows: 24 }));
  }
});
