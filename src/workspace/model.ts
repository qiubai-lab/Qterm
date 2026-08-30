export type SplitDirection = "horizontal" | "vertical";

export interface TerminalNode {
  type: "terminal";
  blockId: string;
  profileId: string | null;
  restoreDirectory: string | null;
}

export interface FilesNode {
  type: "files";
  blockId: string;
  profileId: string | null;
  path: string;
}

export interface NetworkNode {
  type: "network";
  blockId: string;
  profileId: string | null;
}

export interface GitNode {
  type: "git";
  blockId: string;
  target: GitTarget;
}

export type GitTarget =
  | { type: "unbound" }
  | { type: "local"; path: string }
  | { type: "remote"; profileId: string; path: string };

export interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutLeaf = TerminalNode | FilesNode | NetworkNode | GitNode;
export type LayoutNode = LayoutLeaf | SplitNode;

export interface Workspace {
  id: string;
  name: string;
  activeBlockId: string;
  layout: LayoutNode;
}

export interface WorkspaceDocument {
  schemaVersion: 9;
  activeWorkspaceId: string;
  recentProfileIds: string[];
  workspaces: Workspace[];
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createTerminalNode(profileId: string | null = null, blockId = createId("block")): TerminalNode {
  return { type: "terminal", blockId, profileId, restoreDirectory: null };
}

export function createFilesNode(profileId: string | null, path: string): FilesNode {
  return { type: "files", blockId: createId("files"), profileId, path };
}

export function createNetworkNode(profileId: string | null): NetworkNode {
  return { type: "network", blockId: createId("network"), profileId };
}

export function createGitNode(target: GitTarget): GitNode {
  return { type: "git", blockId: createId("git"), target };
}

export function createWorkspace(name = "Workspace 1"): Workspace {
  const terminal = createTerminalNode();
  return { id: createId("workspace"), name, activeBlockId: terminal.blockId, layout: terminal };
}

export function createWorkspaceDocument(): WorkspaceDocument {
  const workspace = createWorkspace();
  return { schemaVersion: 9, activeWorkspaceId: workspace.id, recentProfileIds: [], workspaces: [workspace] };
}

export function isValidTerminalRestoreDirectory(value: string): boolean {
  return value.length > 0 && !value.includes("\0") && new TextEncoder().encode(value).byteLength <= 4 * 1024;
}
