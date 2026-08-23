import type { ConnectionProfile, ProfileInput } from "../../../lib/tauri/profiles";
import type { LayoutNode } from "../../../workspace/model";

export function findProfileId(node: LayoutNode, blockId: string): string | null {
  if (node.type === "terminal") return node.blockId === blockId ? node.profileId : null;
  if (node.type === "files" || node.type === "network") return null;
  return findProfileId(node.first, blockId) ?? findProfileId(node.second, blockId);
}

export function profileToInput(profile: ConnectionProfile, groupId: string | null): ProfileInput {
  return {
    name: profile.name,
    host: profile.host,
    port: profile.port,
    username: profile.username,
    authPreference: profile.authPreference,
    credentialId: profile.credentialId,
    groupId,
    jumpProfileIds: profile.jumpProfileIds ?? [],
  };
}

export function duplicateProfileName(name: string, profiles: ConnectionProfile[]): string {
  const names = new Set(profiles.map((profile) => profile.name));
  const base = `${name} 副本`;
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

export function dropGroupAtPoint(x: number, y: number, draggedProfiles: ConnectionProfile[]): string | null | undefined {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-profile-drop-group]");
  if (!target) return undefined;
  const groupId = target.dataset.profileDropGroup || null;
  return draggedProfiles.every((profile) => (profile.groupId ?? null) === groupId) ? undefined : groupId;
}

export function connectionErrorMessage(error: unknown): string {
  return typeof error === "object" && error && "message" in error ? String(error.message) : "操作失败";
}

export function connectionErrorCode(error: unknown): string | null {
  return typeof error === "object" && error && "code" in error ? String(error.code) : null;
}

export function authPreferenceLabel(preference: ConnectionProfile["authPreference"]): string {
  if (preference === "privateKey") return "私钥";
  if (preference === "sshAgent") return "代理";
  if (preference === "manual") return "手动";
  return "密码";
}
