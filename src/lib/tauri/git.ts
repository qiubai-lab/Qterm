import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionConnectInput, SessionEvent } from "./sessions";

export interface GitHead { name: string | null; oid: string | null; detached: boolean; unborn: boolean; upstream: string | null; ahead: number; behind: number }
export interface GitChange { path: string; originalPath: string | null; status: string; staged: boolean; conflict: boolean }
export interface GitBranch { name: string; oid: string; current: boolean; upstream: string | null }
export interface GitCommit { oid: string; parents: string[]; decorations: string[]; subject: string; body: string; author: string; timestamp: number }
export interface GitCommitFile { path: string; originalPath: string | null; status: string }
export interface GitDirectoryEntry { name: string; path: string; isSymlink: boolean }
export interface GitDirectoryListing { path: string; entries: GitDirectoryEntry[] }
export interface GitSnapshot { repositoryPath: string; repositoryName: string; head: GitHead; changes: GitChange[]; branches: GitBranch[]; commits: GitCommit[] }

export type RemoteGitAction =
  | { type: "snapshot"; path: string }
  | { type: "initialize"; path: string }
  | { type: "stage"; repository: string; paths: string[] }
  | { type: "stageAll"; repository: string }
  | { type: "unstage"; repository: string; paths: string[] }
  | { type: "unstageAll"; repository: string }
  | { type: "commit"; repository: string; message: string }
  | { type: "createBranch"; repository: string; name: string }
  | { type: "switchBranch"; repository: string; name: string };

export function gitAvailable(): Promise<boolean> { return invoke("git_available"); }
export function selectGitRepositoryDirectory(initialPath?: string | null): Promise<string | null> { return invoke("git_select_repository_directory", { input: { initialPath: initialPath ?? null } }); }
export function loadGitSnapshot(path: string): Promise<GitSnapshot> { return invoke("git_snapshot", { input: { path } }); }
export function initializeGitRepository(path: string): Promise<GitSnapshot> { return invoke("git_initialize", { input: { path } }); }
export function stageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return invoke("git_stage", { input: { repository, paths } }); }
export function stageAllGitChanges(repository: string): Promise<GitSnapshot> { return invoke("git_stage_all", { input: { repository } }); }
export function unstageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return invoke("git_unstage", { input: { repository, paths } }); }
export function unstageAllGitChanges(repository: string): Promise<GitSnapshot> { return invoke("git_unstage_all", { input: { repository } }); }
export function commitGitChanges(repository: string, message: string): Promise<GitSnapshot> { return invoke("git_commit", { input: { repository, message } }); }
export function loadGitCommitFiles(repository: string, oid: string): Promise<GitCommitFile[]> { return invoke("git_commit_files", { input: { repository, oid } }); }
export function createGitBranch(repository: string, name: string): Promise<GitSnapshot> { return invoke("git_create_branch", { input: { repository, name } }); }
export function switchGitBranch(repository: string, name: string): Promise<GitSnapshot> { return invoke("git_switch_branch", { input: { repository, name } }); }

export function connectGitSession(input: SessionConnectInput, onEvent: (event: SessionEvent) => void): Promise<string> {
  return invoke<string>("git_session_connect", { input, onEvent: new Channel<SessionEvent>(onEvent) });
}

export function executeRemoteGit(sessionId: string, profileId: string, action: RemoteGitAction): Promise<GitSnapshot> {
  return invoke("git_remote_execute", { input: { sessionId, profileId, action } });
}

export function loadRemoteGitCommitFiles(sessionId: string, profileId: string, repository: string, oid: string): Promise<GitCommitFile[]> {
  return invoke("git_remote_commit_files", { input: { sessionId, profileId, repository, oid } });
}

export function listRemoteGitDirectory(sessionId: string, profileId: string, path: string): Promise<GitDirectoryListing> {
  return invoke("git_remote_list_directory", { input: { sessionId, profileId, path } });
}

export function gitError(error: unknown): { code: string; message: string } {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.message === "string") return { code: record.code, message: record.message };
  }
  return { code: "gitUnavailable", message: error instanceof Error ? error.message : String(error) };
}
