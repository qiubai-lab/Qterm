import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { connectNetworkSession, createNetworkRule, deleteNetworkRule, listNetworkRules, startNetworkRule, stopNetworkRule, updateNetworkRule, type NetworkRuleInput } from "./network";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class {
    constructor(readonly onmessage: (message: unknown) => void) {}
  },
}));

describe("network IPC adapter", () => {
  const input: NetworkRuleInput = { type: "socks5", profileId: "profile-1", name: "Proxy", bindHost: "127.0.0.1", bindPort: 1080 };

  beforeEach(() => vi.mocked(invoke).mockReset());

  it("uses narrow rule CRUD commands", async () => {
    vi.mocked(invoke).mockResolvedValue(undefined);
    await listNetworkRules("profile-1");
    expect(invoke).toHaveBeenLastCalledWith("network_rule_list", { profileId: "profile-1" });
    await createNetworkRule(input);
    expect(invoke).toHaveBeenLastCalledWith("network_rule_create", { input });
    await updateNetworkRule("rule-1", input);
    expect(invoke).toHaveBeenLastCalledWith("network_rule_update", { id: "rule-1", input });
    await deleteNetworkRule("rule-1");
    expect(invoke).toHaveBeenLastCalledWith("network_rule_delete", { id: "rule-1" });
    await connectNetworkSession("profile-1", { host: "host", port: 22, username: "dev", auth: { method: "sshAgent" } }, vi.fn());
    expect(invoke).toHaveBeenLastCalledWith("network_session_connect", expect.objectContaining({ profileId: "profile-1", input: expect.any(Object), onEvent: expect.any(Object) }));
    await startNetworkRule("session-1", "rule-1");
    expect(invoke).toHaveBeenLastCalledWith("network_rule_start", { sessionId: "session-1", ruleId: "rule-1" });
    await stopNetworkRule("session-1", "rule-1");
    expect(invoke).toHaveBeenLastCalledWith("network_rule_stop", { sessionId: "session-1", ruleId: "rule-1" });
  });
});
