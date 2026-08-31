import { useCallback, useMemo } from "react";

import {
  abortGitMerge,
  commitGitChanges,
  continueGitMerge,
  createGitBranch,
  createGitBranchFrom,
  deleteGitBranch,
  executeRemoteGit,
  fetchGitRepository,
  initializeGitRepository,
  loadGitCommitFiles,
  loadGitSnapshot,
  loadRemoteGitCommitFiles,
  mergeGitBranch,
  pullGitRepository,
  pushGitRepository,
  renameGitBranch,
  stageAllGitChanges,
  stageGitPaths,
  switchGitBranch,
  trackGitRemoteBranch,
  unstageAllGitChanges,
  unstageGitPaths,
  type GitCommitFile,
  type GitSnapshot,
  type RemoteGitAction,
} from "../lib/tauri/git";

interface GitRepositoryClientContext {
  remote: boolean;
  profileId: string | null;
  sessionId?: string | null;
  status?: string | null;
}

export interface GitRepositoryClient {
  loadSnapshot: (path: string) => Promise<GitSnapshot>;
  fetchSnapshot: (repository: string) => Promise<GitSnapshot>;
  initialize: (path: string) => Promise<GitSnapshot>;
  stagePaths: (repository: string, paths: string[]) => Promise<GitSnapshot>;
  stageAll: (repository: string) => Promise<GitSnapshot>;
  unstagePaths: (repository: string, paths: string[]) => Promise<GitSnapshot>;
  unstageAll: (repository: string) => Promise<GitSnapshot>;
  commit: (repository: string, message: string) => Promise<GitSnapshot>;
  createBranch: (repository: string, name: string) => Promise<GitSnapshot>;
  createBranchAt: (repository: string, name: string, sourceRef: string) => Promise<GitSnapshot>;
  renameBranch: (repository: string, refName: string, newName: string) => Promise<GitSnapshot>;
  deleteBranch: (repository: string, refName: string) => Promise<GitSnapshot>;
  switchBranch: (repository: string, name: string) => Promise<GitSnapshot>;
  pullRepository: (repository: string) => Promise<GitSnapshot>;
  pushRepository: (repository: string, remote?: string | null) => Promise<GitSnapshot>;
  trackRemoteBranch: (repository: string, refName: string) => Promise<GitSnapshot>;
  mergeBranch: (repository: string, sourceRef: string) => Promise<GitSnapshot>;
  continueMerge: (repository: string) => Promise<GitSnapshot>;
  abortMerge: (repository: string) => Promise<GitSnapshot>;
  loadCommitFiles: (repository: string, oid: string) => Promise<GitCommitFile[]>;
}

export function useGitRepositoryClient({ remote, profileId, sessionId, status }: GitRepositoryClientContext): GitRepositoryClient {
  const remoteExecute = useCallback((action: RemoteGitAction) => {
    if (!remote || !profileId || !sessionId || status !== "connected") {
      return Promise.reject(new Error("远程 Git 连接尚未建立"));
    }
    return executeRemoteGit(sessionId, profileId, action);
  }, [profileId, remote, sessionId, status]);

  return useMemo<GitRepositoryClient>(() => ({
    loadSnapshot: (path) => remote ? remoteExecute({ type: "snapshot", path }) : loadGitSnapshot(path),
    fetchSnapshot: (repository) => remote ? remoteExecute({ type: "fetch", repository }) : fetchGitRepository(repository),
    initialize: (path) => remote ? remoteExecute({ type: "initialize", path }) : initializeGitRepository(path),
    stagePaths: (repository, paths) => remote ? remoteExecute({ type: "stage", repository, paths }) : stageGitPaths(repository, paths),
    stageAll: (repository) => remote ? remoteExecute({ type: "stageAll", repository }) : stageAllGitChanges(repository),
    unstagePaths: (repository, paths) => remote ? remoteExecute({ type: "unstage", repository, paths }) : unstageGitPaths(repository, paths),
    unstageAll: (repository) => remote ? remoteExecute({ type: "unstageAll", repository }) : unstageAllGitChanges(repository),
    commit: (repository, message) => remote ? remoteExecute({ type: "commit", repository, message }) : commitGitChanges(repository, message),
    createBranch: (repository, name) => remote ? remoteExecute({ type: "createBranch", repository, name }) : createGitBranch(repository, name),
    createBranchAt: (repository, name, sourceRef) => remote ? remoteExecute({ type: "createBranchFrom", repository, name, sourceRef }) : createGitBranchFrom(repository, name, sourceRef),
    renameBranch: (repository, refName, newName) => remote ? remoteExecute({ type: "renameBranch", repository, refName, newName }) : renameGitBranch(repository, refName, newName),
    deleteBranch: (repository, refName) => remote ? remoteExecute({ type: "deleteBranch", repository, refName }) : deleteGitBranch(repository, refName),
    switchBranch: (repository, name) => remote ? remoteExecute({ type: "switchBranch", repository, name }) : switchGitBranch(repository, name),
    pullRepository: (repository) => remote ? remoteExecute({ type: "pull", repository }) : pullGitRepository(repository),
    pushRepository: (repository, selectedRemote) => remote ? remoteExecute({ type: "push", repository, remote: selectedRemote ?? null }) : pushGitRepository(repository, selectedRemote ?? null),
    trackRemoteBranch: (repository, refName) => remote ? remoteExecute({ type: "trackRemoteBranch", repository, refName }) : trackGitRemoteBranch(repository, refName),
    mergeBranch: (repository, sourceRef) => remote ? remoteExecute({ type: "mergeBranch", repository, sourceRef }) : mergeGitBranch(repository, sourceRef),
    continueMerge: (repository) => remote ? remoteExecute({ type: "continueMerge", repository }) : continueGitMerge(repository),
    abortMerge: (repository) => remote ? remoteExecute({ type: "abortMerge", repository }) : abortGitMerge(repository),
    loadCommitFiles: (repository, oid) => remote
      ? profileId && sessionId && status === "connected"
        ? loadRemoteGitCommitFiles(sessionId, profileId, repository, oid)
        : Promise.reject(new Error("远程 Git 连接尚未建立"))
      : loadGitCommitFiles(repository, oid),
  }), [profileId, remote, remoteExecute, sessionId, status]);
}
