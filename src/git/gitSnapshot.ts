import type { GitBranch, GitChange, GitCommit, GitHead, GitSnapshot, GitSubmodule } from "../lib/tauri/git";

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameHead(left: GitHead, right: GitHead): boolean {
  return left.name === right.name
    && left.oid === right.oid
    && left.detached === right.detached
    && left.unborn === right.unborn
    && left.upstream === right.upstream
    && left.ahead === right.ahead
    && left.behind === right.behind;
}

function sameChange(left: GitChange, right: GitChange): boolean {
  return left.path === right.path
    && left.originalPath === right.originalPath
    && left.status === right.status
    && left.staged === right.staged
    && left.conflict === right.conflict
    && (left.conflictKind ?? null) === (right.conflictKind ?? null)
    && (left.submodule?.commitChanged ?? false) === (right.submodule?.commitChanged ?? false)
    && (left.submodule?.trackedModified ?? false) === (right.submodule?.trackedModified ?? false)
    && (left.submodule?.untrackedContent ?? false) === (right.submodule?.untrackedContent ?? false);
}

function sameSubmodule(left: GitSubmodule, right: GitSubmodule): boolean {
  return left.name === right.name
    && left.path === right.path
    && left.recordedOid === right.recordedOid
    && left.currentOid === right.currentOid
    && left.initialized === right.initialized
    && left.commitChanged === right.commitChanged
    && left.trackedModified === right.trackedModified
    && left.untrackedContent === right.untrackedContent
    && left.conflict === right.conflict
    && left.issue === right.issue;
}

function sameBranch(left: GitBranch, right: GitBranch): boolean {
  return left.refName === right.refName
    && left.name === right.name
    && left.kind === right.kind
    && left.oid === right.oid
    && left.current === right.current
    && left.upstream === right.upstream
    && left.upstreamRef === right.upstreamRef;
}

function sameCommit(left: GitCommit, right: GitCommit): boolean {
  return left.oid === right.oid
    && sameStrings(left.parents, right.parents)
    && sameStrings(left.decorations, right.decorations)
    && left.subject === right.subject
    && left.body === right.body
    && left.author === right.author
    && left.timestamp === right.timestamp;
}

function sameItems<T>(left: T[], right: T[], equal: (left: T, right: T) => boolean): boolean {
  return left.length === right.length && left.every((value, index) => equal(value, right[index]));
}

/** Compares only data represented by the Git pane; it is not a worktree content fingerprint. */
export function gitSnapshotsPresentSameState(left: GitSnapshot, right: GitSnapshot): boolean {
  return left.repositoryPath === right.repositoryPath
    && left.repositoryName === right.repositoryName
    && sameHead(left.head, right.head)
    && sameItems(left.changes, right.changes, sameChange)
    && sameItems(left.submodules ?? [], right.submodules ?? [], sameSubmodule)
    && sameItems(left.branches, right.branches, sameBranch)
    && sameStrings(left.remotes, right.remotes)
    && sameItems(left.commits, right.commits, sameCommit)
    && left.mergeInProgress === right.mergeInProgress
    && (left.mergeHeadOid ?? null) === (right.mergeHeadOid ?? null);
}
