import type { GitRepositoryHistoryEntry } from "./model";

export const MAX_RECENT_GIT_REPOSITORIES_PER_SCOPE = 8;
export const MAX_RECENT_GIT_REPOSITORIES = 64;

export type GitRepositoryHistoryScope =
  | { type: "local" }
  | { type: "remote"; profileId: string };

export function recentGitRepositoriesForScope(
  repositories: GitRepositoryHistoryEntry[],
  scope: GitRepositoryHistoryScope,
): GitRepositoryHistoryEntry[] {
  return repositories
    .filter((repository) => repositoryScopeKey(repository) === scopeKey(scope))
    .slice(0, MAX_RECENT_GIT_REPOSITORIES_PER_SCOPE);
}

export function recordRecentGitRepository(
  repositories: GitRepositoryHistoryEntry[],
  repository: GitRepositoryHistoryEntry,
): GitRepositoryHistoryEntry[] {
  if (!isValidGitRepositoryHistoryEntry(repository)) return repositories;

  const repositoryKey = entryKey(repository);
  const candidates = [repository, ...repositories.filter((candidate) => entryKey(candidate) !== repositoryKey)];
  const scopeCounts = new Map<string, number>();
  const next: GitRepositoryHistoryEntry[] = [];

  for (const candidate of candidates) {
    if (!isValidGitRepositoryHistoryEntry(candidate)) continue;
    const candidateScopeKey = repositoryScopeKey(candidate);
    const scopeCount = scopeCounts.get(candidateScopeKey) ?? 0;
    if (scopeCount >= MAX_RECENT_GIT_REPOSITORIES_PER_SCOPE) continue;
    next.push(candidate);
    scopeCounts.set(candidateScopeKey, scopeCount + 1);
    if (next.length === MAX_RECENT_GIT_REPOSITORIES) break;
  }

  if (next.length === repositories.length && next.every((candidate, index) => entryKey(candidate) === entryKey(repositories[index]))) {
    return repositories;
  }
  return next;
}

export function isSameGitRepository(
  left: GitRepositoryHistoryEntry,
  right: GitRepositoryHistoryEntry,
): boolean {
  return entryKey(left) === entryKey(right);
}

export function gitRepositoryHistoryEntryKey(repository: GitRepositoryHistoryEntry): string {
  return entryKey(repository);
}

function isValidGitRepositoryHistoryEntry(repository: GitRepositoryHistoryEntry): boolean {
  if (!isValidPath(repository.path)) return false;
  return repository.type === "local" || isValidProfileId(repository.profileId);
}

function isValidPath(path: string): boolean {
  return path.length > 0
    && new TextEncoder().encode(path).byteLength <= 4 * 1024
    && !hasControlCharacter(path);
}

function isValidProfileId(profileId: string): boolean {
  return profileId.length > 0
    && new TextEncoder().encode(profileId).byteLength <= 128
    && !/\s/u.test(profileId)
    && !hasControlCharacter(profileId);
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function scopeKey(scope: GitRepositoryHistoryScope): string {
  return scope.type === "local" ? "local" : `remote\0${scope.profileId}`;
}

function repositoryScopeKey(repository: GitRepositoryHistoryEntry): string {
  return repository.type === "local" ? "local" : `remote\0${repository.profileId}`;
}

function entryKey(repository: GitRepositoryHistoryEntry): string {
  return `${repositoryScopeKey(repository)}\0${repository.path}`;
}
