import type { ConnectionProfile } from "../lib/tauri/profiles";
import { findLeaf } from "../workspace/layout";
import type { WorkspaceDocument } from "../workspace/model";

export interface WebLinkOrigin {
  workspaceId: string;
  blockId: string;
  profileId: string | null;
  name: string;
}

export function resolveWebLinkOrigin(document: WorkspaceDocument, profiles: ConnectionProfile[], blockId?: string): WebLinkOrigin | null {
  if (!blockId) return null;
  for (const workspace of document.workspaces) {
    const node = findLeaf(workspace.layout, blockId);
    if (node?.type !== "terminal") continue;
    return { workspaceId: workspace.id, blockId, profileId: node.profileId,
      name: node.profileId === null ? "本地" : profiles.find(profile => profile.id === node.profileId)?.name ?? "连接已失效" };
  }
  return null;
}
