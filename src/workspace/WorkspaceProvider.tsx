/* eslint-disable react-refresh/only-export-components -- provider and its typed hook are one public boundary. */
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from "react";

import type { LocalTerminalCapabilities } from "../lib/tauri/localSessions";
import type { ConnectionProfile, ProfileGroup } from "../lib/tauri/profiles";
import type { SessionAuth, TerminalSizeInput } from "../lib/tauri/sessions";
import { createWorkspaceDocument, type GitTarget, type SplitDirection, type Workspace, type WorkspaceDocument } from "./model";
import { workspaceReducer, type WorkspaceAction } from "./reducer";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { useWorkspaceRuntimeController } from "./useWorkspaceRuntimeController";
import { useWorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import type { FileRuntime, GitRuntime, NetworkRuntime, TerminalRuntime } from "./workspaceRuntime";

export type { FileRuntime, GitRuntime, HostKeyPrompt, NetworkRuntime, TerminalRuntime } from "./workspaceRuntime";

interface WorkspaceContextValue {
  hydrated: boolean;
  document: WorkspaceDocument;
  dispatch: Dispatch<WorkspaceAction>;
  profiles: ConnectionProfile[];
  profileGroups: ProfileGroup[];
  refreshProfiles: () => Promise<void>;
  runtimes: Record<string, TerminalRuntime>;
  fileRuntimes: Record<string, FileRuntime>;
  networkRuntimes: Record<string, NetworkRuntime>;
  gitRuntimes: Record<string, GitRuntime>;
  localTerminalCapabilities: LocalTerminalCapabilities | null;
  activeWorkspace: Workspace;
  activeBlockId: string;
  registerWriter: (blockId: string, writer: (data: Uint8Array) => void, clearer: (reset: boolean) => void, readSize: () => TerminalSizeInput) => () => void;
  clearBlockBuffer: (blockId: string, reset?: boolean) => void;
  setBlockCwd: (blockId: string, cwd: string) => void;
  clearTerminalOsc7State: () => void;
  splitTerminalBlock: (workspaceId: string, blockId: string, direction: SplitDirection, inheritCurrentDirectory?: boolean) => void;
  startLocalBlock: (blockId: string, columns: number, rows: number, osc7Enabled: boolean) => Promise<void>;
  restartLocalBlock: (blockId: string, osc7Enabled: boolean) => Promise<void>;
  selectBlockTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  selectFileTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectFileBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  disconnectFileBlock: (blockId: string) => Promise<void>;
  selectNetworkTarget: (workspaceId: string, blockId: string, profileId: string | null) => Promise<void>;
  connectNetworkBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  disconnectNetworkBlock: (blockId: string) => Promise<void>;
  selectGitTarget: (workspaceId: string, blockId: string, target: GitTarget, currentTarget?: GitTarget) => Promise<void>;
  stageGitRemoteTarget: (blockId: string, profileId: string) => void;
  cancelStagedGitTarget: (blockId: string, target: GitTarget) => Promise<void>;
  connectGitBlock: (blockId: string, profile: ConnectionProfile, auth: SessionAuth, onFailure?: () => void) => Promise<void>;
  disconnectGitBlock: (blockId: string) => Promise<void>;
  isConnectionTargetCurrent: (owner: "terminal" | "files" | "network" | "git", blockId: string, profileId: string) => boolean;
  startNetworkBlockRule: (blockId: string, ruleId: string) => Promise<void>;
  stopNetworkBlockRule: (blockId: string, ruleId: string) => Promise<void>;
  disconnectBlock: (blockId: string) => Promise<void>;
  writeBlock: (blockId: string, data: Uint8Array) => Promise<void>;
  resizeBlock: (blockId: string, columns: number, rows: number) => Promise<void>;
  acceptBlockHostKey: (blockId: string) => Promise<void>;
  rejectBlockHostKey: (blockId: string) => Promise<void>;
  acceptFileHostKey: (blockId: string) => Promise<void>;
  rejectFileHostKey: (blockId: string) => Promise<void>;
  acceptNetworkHostKey: (blockId: string) => Promise<void>;
  rejectNetworkHostKey: (blockId: string) => Promise<void>;
  acceptGitHostKey: (blockId: string) => Promise<void>;
  rejectGitHostKey: (blockId: string) => Promise<void>;
  connectedCount: (ids: string[]) => number;
  closeSessions: (ids: string[]) => Promise<void>;
  blocksForWorkspace: (workspace: Workspace) => string[];
  storageNotice: string;
  dismissStorageNotice: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [document, dispatch] = useReducer(workspaceReducer, undefined, createWorkspaceDocument);
  const persistence = useWorkspacePersistence(document, dispatch);
  const runtimeState = useWorkspaceRuntimeState(document, persistence.setStorageNotice);
  const runtime = useWorkspaceRuntimeController(runtimeState, document, dispatch);
  const value = useMemo<WorkspaceContextValue>(() => ({
    hydrated: persistence.hydrated,
    document,
    dispatch,
    profiles: persistence.profiles,
    profileGroups: persistence.profileGroups,
    refreshProfiles: persistence.refreshProfiles,
    ...runtime,
    storageNotice: persistence.storageNotice,
    dismissStorageNotice: persistence.dismissStorageNotice,
  }), [document, persistence.dismissStorageNotice, persistence.hydrated, persistence.profileGroups, persistence.profiles, persistence.refreshProfiles, persistence.storageNotice, runtime]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("WorkspaceProvider is missing");
  return context;
}
