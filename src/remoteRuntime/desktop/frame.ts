import type { WorkspaceBatchActions } from "../../workspace/useWorkspaceBatchActions";
import type { ServerEntry } from "../model";
import type { frameFileDrop } from "./frameFileDrop";

export interface EnvironmentTabs {
  activeId: string;
  items: { id: string; name: string; unread?: boolean }[];
  enabled: boolean;
}
export interface WorkspaceCommands extends WorkspaceBatchActions {
  create(): void;
  select(id: string): void;
  close(id: string): void;
  rename(id: string, name: string): void;
  reorder(id: string, target: string, order: string[]): void;
}
export interface WorkspacePort {
  publish(tabs: EnvironmentTabs, commands: WorkspaceCommands): () => void;
}
export interface FramePort extends WorkspacePort {
  entry: ServerEntry;
  runtimeId: string;
  apiBase: string;
  status(label: string, leave: () => Promise<void>, flush: () => Promise<void>, transfers: () => number, showLog?: () => void): void;
  shortcut(event: KeyboardEvent): void;
  foreground(): boolean;
  subscribe(listener: () => void): () => void;
}
export type RuntimeFrame = HTMLIFrameElement & { qtermWorkbench?: FramePort & { fileDrop: ReturnType<typeof frameFileDrop> } };

// Only a bundled, same-origin document mounted by the desktop host receives a port.
// The frame URL never contains an upstream URL, access proof or API capability.
export const framePort = typeof window === "undefined" ? undefined :
  (window.frameElement as RuntimeFrame | null)?.qtermWorkbench;
