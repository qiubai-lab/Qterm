import type { SessionConnectInput, SessionEvent } from "../../lib/tauri/sessions";
import type { GitSnapshot, GitCommitFile, GitCommitFileDiff, GitConflictDetail, GitChangeDiff, GitConflictResolution, RemoteGitAction, GitDirectoryListing } from "../../lib/tauri/git";
export type * from "../../lib/tauri/git";
import { api } from "../http";
import { openSession } from "../sessionTransport";
export function gitAvailable(): Promise<boolean> { return api("/git/available"); }
export async function selectGitRepositoryDirectory(_initialPath?: string | null): Promise<string | null> { void _initialPath; return null; }
export function loadGitSnapshot(path: string): Promise<GitSnapshot> { return api("/git/snapshot", "POST", { path }); }
export function fetchGitRepository(repository: string): Promise<GitSnapshot> { return api("/git/fetch", "POST", { repository }); }
export function pullGitRepository(repository: string): Promise<GitSnapshot> { return api("/git/pull", "POST", { repository }); }
export function pushGitRepository(repository: string, remote?: string | null): Promise<GitSnapshot> { return api("/git/push", "POST", { repository, remote: remote ?? null }); }
export function initializeGitRepository(path: string): Promise<GitSnapshot> { return api("/git/initialize", "POST", { path }); }
export function stageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return api("/git/stage", "POST", { repository, paths }); }
export function initializeGitSubmodule(repository: string, path: string): Promise<GitSnapshot> { return api("/git/initialize_submodule", "POST", { repository, path }); }
export function checkoutGitSubmodule(repository: string, path: string): Promise<GitSnapshot> { return api("/git/checkout_submodule", "POST", { repository, path }); }
export function stageAllGitChanges(repository: string): Promise<GitSnapshot> { return api("/git/stage_all", "POST", { repository }); }
export function unstageGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return api("/git/unstage", "POST", { repository, paths }); }
export function unstageAllGitChanges(repository: string): Promise<GitSnapshot> { return api("/git/unstage_all", "POST", { repository }); }
export function discardGitPaths(repository: string, paths: string[]): Promise<GitSnapshot> { return api("/git/discard", "POST", { repository, paths }); }
export function commitGitChanges(repository: string, message: string): Promise<GitSnapshot> { return api("/git/commit", "POST", { repository, message }); }
export function loadGitCommitFiles(repository: string, oid: string): Promise<GitCommitFile[]> { return api("/git/commit_files", "POST", { repository, oid }); }
export function loadGitCommitFileDiff(repository: string, oid: string, path: string): Promise<GitCommitFileDiff> { return api("/git/commit_file_diff", "POST", { repository, oid, path }); }
export function loadGitConflictDetail(repository: string, path: string): Promise<GitConflictDetail> { return api("/git/conflict_detail", "POST", { repository, path }); }
export function loadGitChangeDiff(repository: string, path: string, staged: boolean): Promise<GitChangeDiff> { return api("/git/change_diff", "POST", { repository, path, staged }); }
export function resolveGitConflict(repository: string, path: string, resolution: GitConflictResolution): Promise<GitSnapshot> { return api("/git/resolve_conflict", "POST", { repository, path, resolution }); }
export function createGitBranch(repository: string, name: string): Promise<GitSnapshot> { return api("/git/create_branch", "POST", { repository, name }); }
export function createGitBranchFrom(repository: string, name: string, sourceRef: string): Promise<GitSnapshot> { return api("/git/create_branch_from", "POST", { repository, name, sourceRef }); }
export function createGitBranchFromCommit(repository: string, name: string, oid: string): Promise<GitSnapshot> { return api("/git/create_branch_from_commit", "POST", { repository, name, oid }); }
export function renameGitBranch(repository: string, refName: string, newName: string): Promise<GitSnapshot> { return api("/git/rename_branch", "POST", { repository, refName, newName }); }
export function deleteGitBranch(repository: string, refName: string): Promise<GitSnapshot> { return api("/git/delete_branch", "POST", { repository, refName }); }
export function switchGitBranch(repository: string, name: string): Promise<GitSnapshot> { return api("/git/switch_branch", "POST", { repository, name }); }
export function trackGitRemoteBranch(repository: string, refName: string): Promise<GitSnapshot> { return api("/git/track_remote_branch", "POST", { repository, refName }); }
export function mergeGitBranch(repository: string, sourceRef: string): Promise<GitSnapshot> { return api("/git/merge_branch", "POST", { repository, sourceRef }); }
export function continueGitMerge(repository: string): Promise<GitSnapshot> { return api("/git/continue_merge", "POST", { repository }); }
export function abortGitMerge(repository: string): Promise<GitSnapshot> { return api("/git/abort_merge", "POST", { repository }); }

export function connectGitSession(input: SessionConnectInput, onEvent: (event: SessionEvent) => void): Promise<string> {
  return openSession("git",input,onEvent);
}

export function executeRemoteGit(sessionId: string, profileId: string, action: RemoteGitAction): Promise<GitSnapshot> {
  return api("/git/remote_execute", "POST", { sessionId, profileId, action });
}

export function loadRemoteGitCommitFiles(sessionId: string, profileId: string, repository: string, oid: string): Promise<GitCommitFile[]> {
  return api("/git/remote_commit_files", "POST", { sessionId, profileId, repository, oid });
}

export function loadRemoteGitCommitFileDiff(sessionId: string, profileId: string, repository: string, oid: string, path: string): Promise<GitCommitFileDiff> {
  return api("/git/remote_commit_file_diff", "POST", { sessionId, profileId, repository, oid, path });
}

export function loadRemoteGitConflictDetail(sessionId: string, profileId: string, repository: string, path: string): Promise<GitConflictDetail> {
  return api("/git/remote_conflict_detail", "POST", { sessionId, profileId, repository, path });
}

export function loadRemoteGitChangeDiff(sessionId: string, profileId: string, repository: string, path: string, staged: boolean): Promise<GitChangeDiff> {
  return api("/git/remote_change_diff", "POST", { sessionId, profileId, repository, path, staged });
}

export function resolveRemoteGitConflict(sessionId: string, profileId: string, repository: string, path: string, resolution: GitConflictResolution): Promise<GitSnapshot> {
  return api("/git/remote_resolve_conflict", "POST", { sessionId, profileId, repository, path, resolution });
}

export function listRemoteGitDirectory(sessionId: string, profileId: string, path: string): Promise<GitDirectoryListing> {
  return api("/git/remote_list_directory", "POST", { sessionId, profileId, path });
}

export function gitError(error: unknown): { code: string; message: string } {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.code === "string" && typeof record.message === "string") return { code: record.code, message: record.message };
  }
  return { code: "gitUnavailable", message: error instanceof Error ? error.message : String(error) };
}
