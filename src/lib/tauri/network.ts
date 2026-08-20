import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionConnectInput, SessionEvent } from "./sessions";

interface NetworkRuleBase {
  id: string;
  profileId: string;
  name: string;
  bindHost: string;
  bindPort: number;
  exposed: boolean;
}

export type NetworkRule =
  | NetworkRuleBase & { type: "local" | "remote"; targetHost: string; targetPort: number }
  | NetworkRuleBase & { type: "socks5" };

export type NetworkRuleInput =
  | { type: "local" | "remote"; profileId: string; name: string; bindHost: string; bindPort: number; targetHost: string; targetPort: number }
  | { type: "socks5"; profileId: string; name: string; bindHost: string; bindPort: number };

export type NetworkRuleRuntimeState = "stopped" | "starting" | "running" | "stopping" | "failed";

export function listNetworkRules(profileId?: string): Promise<NetworkRule[]> {
  return invoke<NetworkRule[]>("network_rule_list", { profileId });
}

export function createNetworkRule(input: NetworkRuleInput): Promise<NetworkRule> {
  return invoke<NetworkRule>("network_rule_create", { input });
}

export function updateNetworkRule(id: string, input: NetworkRuleInput): Promise<NetworkRule> {
  return invoke<NetworkRule>("network_rule_update", { id, input });
}

export function deleteNetworkRule(id: string): Promise<void> {
  return invoke<void>("network_rule_delete", { id });
}

export function connectNetworkSession(profileId: string, input: SessionConnectInput, onEvent: (event: SessionEvent) => void): Promise<string> {
  return invoke<string>("network_session_connect", { profileId, input, onEvent: new Channel<SessionEvent>(onEvent) });
}

export function startNetworkRule(sessionId: string, ruleId: string): Promise<void> {
  return invoke<void>("network_rule_start", { sessionId, ruleId });
}

export function stopNetworkRule(sessionId: string, ruleId: string): Promise<void> {
  return invoke<void>("network_rule_stop", { sessionId, ruleId });
}
