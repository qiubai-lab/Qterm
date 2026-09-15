import type * as Desktop from "../../lib/tauri/network";
import { featureTarget, openFeatureSession } from "../featureSessions";
import { demoProfiles } from "../fixtures";
export type * from "../../lib/tauri/network";
const rules = new Map<string, Desktop.NetworkRule>();
function validate(input: Desktop.NetworkRuleInput) {
  if (!demoProfiles.some(profile => profile.id === input.profileId)) throw new Error("请选择虚构演示连接。");
  if (!input.name.trim() || !input.bindHost.trim() || !Number.isInteger(input.bindPort) || input.bindPort < 1 || input.bindPort > 65535) throw new Error("请填写有效规则名称、监听地址和端口。");
  if (input.type !== "socks5" && (!input.targetHost.trim() || !Number.isInteger(input.targetPort) || input.targetPort < 1 || input.targetPort > 65535)) throw new Error("请填写有效目标地址和端口。");
}
export const listNetworkRules: typeof Desktop.listNetworkRules = async profileId => [...rules.values()].filter(rule => !profileId || rule.profileId === profileId).map(rule => ({ ...rule }));
export const createNetworkRule: typeof Desktop.createNetworkRule = async input => { validate(input); const rule = { ...input, id: crypto.randomUUID(), exposed: !["localhost", "127.0.0.1", "::1"].includes(input.bindHost) }; rules.set(rule.id, rule); return { ...rule }; };
export const updateNetworkRule: typeof Desktop.updateNetworkRule = async (id, input) => { validate(input); if (!rules.has(id)) throw new Error("规则已移除。"); const rule = { ...input, id, exposed: !["localhost", "127.0.0.1", "::1"].includes(input.bindHost) }; rules.set(id, rule); return { ...rule }; };
export const deleteNetworkRule: typeof Desktop.deleteNetworkRule = async id => { rules.delete(id); };
export const connectNetworkSession: typeof Desktop.connectNetworkSession = async (input, event) => openFeatureSession("network", input.profileId, event);
export const startNetworkRule: typeof Desktop.startNetworkRule = async (sessionId, ruleId) => {
  const profileId = featureTarget(sessionId, "network");
  if (rules.get(ruleId)?.profileId !== profileId) throw new Error("规则与当前演示连接不匹配。");
};
export const stopNetworkRule: typeof Desktop.stopNetworkRule = async (sessionId, ruleId) => { featureTarget(sessionId, "network"); if (rules.get(ruleId)?.profileId !== featureTarget(sessionId, "network")) throw new Error("规则与当前演示连接不匹配。"); };
export function resetDemoNetwork() { rules.clear(); }
