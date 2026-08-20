export type SplitDirection = "horizontal" | "vertical";

export interface TerminalNode {
  type: "terminal";
  blockId: string;
  profileId: string | null;
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

export interface SplitNode {
  type: "split";
  id: string;
  direction: SplitDirection;
  ratio: number;
  first: LayoutNode;
  second: LayoutNode;
}

export type LayoutLeaf = TerminalNode | FilesNode | NetworkNode;
export type LayoutNode = LayoutLeaf | SplitNode;

export interface Workspace {
  id: string;
  name: string;
  activeBlockId: string;
  layout: LayoutNode;
}

export interface WorkspaceDocument {
  schemaVersion: 5;
  activeWorkspaceId: string;
  workspaces: Workspace[];
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function createTerminalNode(profileId: string | null = null): TerminalNode {
  return { type: "terminal", blockId: createId("block"), profileId };
}

export function createFilesNode(profileId: string | null, path: string): FilesNode {
  return { type: "files", blockId: createId("files"), profileId, path };
}

export function createNetworkNode(profileId: string | null): NetworkNode {
  return { type: "network", blockId: createId("network"), profileId };
}

export function createWorkspace(name = "Workspace 1"): Workspace {
  const terminal = createTerminalNode();
  return { id: createId("workspace"), name, activeBlockId: terminal.blockId, layout: terminal };
}

export function createWorkspaceDocument(): WorkspaceDocument {
  const workspace = createWorkspace();
  return { schemaVersion: 5, activeWorkspaceId: workspace.id, workspaces: [workspace] };
}
