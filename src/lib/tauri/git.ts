import { Channel, invoke } from "@tauri-apps/api/core";

import type { SessionConnectInput, SessionEvent } from "./sessions";

export interface GitHead { name: string | null; oid: string | null; detached: boolean; unborn: boolean; upstream: string | null; ahead: number; behind: number }
export type GitConflictKind = "bothModified" | "bothAdded" | "currentDeleted" | "incomingDeleted" | "bothDeleted" | "other";
export type GitConflictContentKind = "missing" | "text" | "binary" | "unsupported";
export interface GitChange { path: string; originalPath: string | null; status: string; staged: boolean; conflict: boolean; conflictKind?: GitConflictKind | null }
export interface GitBranch { refName: string; name: string; kind: "local" | "remote"; oid: string; current: boolean; upstream: string | null; upstreamRef: string | null }
export interface GitCommit { oid: string; parents: string[]; decorations: string[]; subject: string; body: string; author: string; timestamp: number }
export interface GitCommitFile { path: string; originalPath: string | null; status: string }
export interface GitCommitFileDiff { commitOid: string; parentOid: string | null; path: string; originalPath: string | null; status: string; before: GitConflictVersion; after: GitConflictVersion }
export interface GitDirectoryEntry { name: string; path: string; isSymlink: boolean }
export interface GitDirectoryListing { path: string; entries: GitDirectoryEntry[] }
export interface GitSnapshot { repositoryPath: string; repositoryName: string; head: GitHead; changes: GitChange[]; branches: GitBranch[]; remotes: string[]; commits: GitCommit[]; mergeInProgress: boolean; mergeHeadOid?: string | null }
export interface GitConflictVersion { kind: GitConflictContentKind; content: string | null; size: number; mode: number | null }
export type GitDiffScope = "staged" | "unstaged";
export type GitDiffSource = "head" | "index" | "worktree";
export interface GitChangeDiff { path: string; originalPath: string | null; status: string; scope: GitDiffScope; beforeSource: GitDiffSource; afterSource: GitDiffSource; before: GitConflictVersion; after: GitConflictVersion }
export interface GitConflictResult extends GitConflictVersion { revision: string }
export interface GitConflictDetail { path: string; kind: GitConflictKind; base: GitConflictVersion; current: GitConflictVersion; incoming: GitConflictVersion; result: GitConflictResult; editable: boolean; unsupportedReason: string | null }
export type GitConflictResolution =
  | { type: "saveText"; content: string; expectedRevision: string }
  | { type: "useCurrent" }
  | { type: "useIncoming" }
  | { type: "delete" }
  | { type: "markResolved" };

export type RemoteGitAction =
  | { type: "snapshot"; path: string }
  | { type: "initialize"; path: string }
  | { type: "stage"; repository: string; paths: string[] }
  | { type: "stageAll"; repository: string }
  | { type: "unstage"; repository: string; paths: string[] }
  | { type: "unstageAll"; repository: string }
  | { type: "commit"; repository: string; message: string }
  | { type: "createBranch"; repository: string; name: string }
  | { type: "createBranchFrom"; repository: string; name: string; sourceRef: string }
  | { type: "createBranchFromCommit"; repository: string; name: string; oid: string }
  | { type: "renameBranch"; repository: string; refName: string; newName: string }
  | { type: "deleteBranch"; repository: string; refName: string }
  | { type: "switchBranch"; repository: string; name: string }
  | { type: "fetch"; repository: string }
  | { type: "pull"; repository: string }
  | { type: "push"; repository: string; remote?: string | null }
  | { type: "trackRemoteBranch"; repository: string; refName: string }
  | { type: "mergeBranch"; repository: string; sourceRef: string }
  | { type: "continueMerge"; repository: string }
  | { type: "abortMerge"; repository: string };

export function gitAvailable(): Promise<boolean> { return invoke("git_available"); }
export function selectGitRepositoryDirectory(initialPath?: string | null): Promise<string | null> { return invoke("git_select_repository_directory", { input: { initialPath: initialPath ?? null } }); }
export function loadGitSnapshot(path: string): Promise<GitSnapshot> { return invoke("git_snapshot", { input: { path } }); }
export function fetchGitRepository(repository: string): Promise<GitSnapshot> { return invoke("git_fetch", { input: { repository } }); }
export function pullGitRepository(repository: string): Promise<GitSnapshot> { return invoke("git_pull", { input: { repository } }); }
export function pushGitRepository(repository: string, remote?: string | null): Promise<GitSnapshot> { return invoke("git_push", { input: { repository, remote: remote ?? null } }); }
export function initializeGitRepository(path: string): Promise<GitSnapshot> { return invoke("git_initialize", { input: { path } }); }
export function stageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return invoke("git_stage", { input: { repository, paths } }); }
export function stageAllGitChanges(repository: string): Promise<GitSnapshot> { return invoke("git_stage_all", { input: { repository } }); }
export function unstageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return invoke("git_unstage", { input: { repository, paths } }); }
export function unstageAllGitChanges(repository: string): Promise<GitSnapshot> { return invoke("git_unstage_all", { input: { repository } }); }
export function commitGitChanges(repository: string, message: string): Promise<GitSnapshot> { return invoke("git_commit", { input: { repository, message } }); }
export function loadGitCommitFiles(repository: string, oid: string): Promise<GitCommitFile[]> { return invoke("git_commit_files", { input: { repository, oid } }); }
export function loadGitCommitFileDiff(repository: string, oid: string, path: string): Promise<GitCommitFileDiff> { return invoke("git_commit_file_diff", { input: { repository, oid, path } }); }
export function loadGitConflictDetail(repository: string, path: string): Promise<GitConflictDetail> { return invoke("git_conflict_detail", { input: { repository, path } }); }
export function loadGitChangeDiff(repository: string, path: string, staged: boolean): Promise<GitChangeDiff> { return invoke("git_change_diff", { input: { repository, path, staged } }); }
export function resolveGitConflict(repository: string, path: string, resolution: GitConflictResolution): Promise<GitSnapshot> { return invoke("git_resolve_conflict", { input: { repository, path, resolution } }); }
export function createGitBranch(repository: string, name: string): Promise<GitSnapshot> { return invoke("git_create_branch", { input: { repository, name } }); }
export function createGitBranchFrom(repository: string, name: string, sourceRef: string): Promise<GitSnapshot> { return invoke("git_create_branch_from", { input: { repository, name, sourceRef } }); }
export function createGitBranchFromCommit(repository: string, name: string, oid: string): Promise<GitSnapshot> { return invoke("git_create_branch_from_commit", { input: { repository, name, oid } }); }
export function renameGitBranch(repository: string, refName: string, newName: string): Promise<GitSnapshot> { return invoke("git_rename_branch", { input: { repository, refName, newName } }); }
export function deleteGitBranch(repository: string, refName: string): Promise<GitSnapshot> { return invoke("git_delete_branch", { input: { repository, refName } }); }
export function switchGitBranch(repository: string, name: string): Promise<GitSnapshot> { return invoke("git_switch_branch", { input: { repository, name } }); }
export function trackGitRemoteBranch(repository: string, refName: string): Promise<GitSnapshot> { return invoke("git_track_remote_branch", { input: { repository, refName } }); }
export function mergeGitBranch(repository: string, sourceRef: string): Promise<GitSnapshot> { return invoke("git_merge_branch", { input: { repository, sourceRef } }); }
export function continueGitMerge(repository: string): Promise<GitSnapshot> { return invoke("git_continue_merge", { input: { repository } }); }
export function abortGitMerge(repository: string): Promise<GitSnapshot> { return invoke("git_abort_merge", { input: { repository } }); }

export function connectGitSession(input: SessionConnectInput, onEvent: (event: SessionEvent) => void): Promise<string> {
  return invoke<string>("git_session_connect", { input, onEvent: new Channel<SessionEvent>(onEvent) });
}

export function executeRemoteGit(sessionId: string, profileId: string, action: RemoteGitAction): Promise<GitSnapshot> {
  return invoke("git_remote_execute", { input: { sessionId, profileId, action } });
}

export function loadRemoteGitCommitFiles(sessionId: string, profileId: string, repository: string, oid: string): Promise<GitCommitFile[]> {
  return invoke("git_remote_commit_files", { input: { sessionId, profileId, repository, oid } });
}

export function loadRemoteGitCommitFileDiff(sessionId: string, profileId: string, repository: string, oid: string, path: string): Promise<GitCommitFileDiff> {
  return invoke("git_remote_commit_file_diff", { input: { sessionId, profileId, repository, oid, path } });
}

export function loadRemoteGitConflictDetail(sessionId: string, profileId: string, repository: string, path: string): Promise<GitConflictDetail> {
  return invoke("git_remote_conflict_detail", { input: { sessionId, profileId, repository, path } });
}

export function loadRemoteGitChangeDiff(sessionId: string, profileId: string, repository: string, path: string, staged: boolean): Promise<GitChangeDiff> {
  return invoke("git_remote_change_diff", { input: { sessionId, profileId, repository, path, staged } });
}

export function resolveRemoteGitConflict(sessionId: string, profileId: string, repository: string, path: string, resolution: GitConflictResolution): Promise<GitSnapshot> {
  return invoke("git_remote_resolve_conflict", { input: { sessionId, profileId, repository, path, resolution } });
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
