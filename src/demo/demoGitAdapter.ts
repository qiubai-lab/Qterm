import type { GitSnapshot, GitChangeDiff, GitConflictVersion, RemoteGitAction } from "../lib/tauri/git";
import { getDemoProject, type DemoTarget } from "./demoProject";
import { DEMO_HOME } from "./fixtures";

export function demoRepository(target: DemoTarget, path: string) {
  const project = getDemoProject(target);
  const resolved = project.resolve(DEMO_HOME, path);
  if (resolved !== DEMO_HOME && !resolved.startsWith(`${DEMO_HOME}/`)) throw new Error("请选择演示项目 /home/demo/qterm。");
  if (!project.isDirectory(resolved)) throw new Error("此演示目录不存在。");
  return project;
}
export function demoGitSnapshot(target: DemoTarget, path: string): GitSnapshot {
  const project = demoRepository(target, path);
  const commits = project.log().map((commit, index, all) => ({ oid: commit.id.padEnd(40, "0"), parents: all[index + 1] ? [all[index + 1].id.padEnd(40, "0")] : [], decorations: index === 0 ? ["HEAD -> main"] : [], subject: commit.message, body: "", author: "Demo", timestamp: 1789430400 - index * 3600 }));
  return {
    repositoryPath: DEMO_HOME, repositoryName: "qterm", head: { name: "main", oid: commits[0].oid, detached: false, unborn: false, upstream: null, ahead: 0, behind: 0 },
    changes: project.changes().flatMap(change => [true, false].filter(staged => staged ? change.staged : change.unstaged).map(staged => ({ path: change.path.slice(DEMO_HOME.length + 1), originalPath: null, status: "M", staged, conflict: false }))),
    branches: [{ refName: "refs/heads/main", name: "main", kind: "local", oid: commits[0].oid, current: true, upstream: null, upstreamRef: null }], remotes: [], submodules: [], commits, mergeInProgress: false,
  };
}
function textVersion(content: string): GitConflictVersion { return { kind: "text", content, size: new TextEncoder().encode(content).length, mode: 33188 }; }
export function demoGitDiff(target: DemoTarget, repository: string, path: string, staged: boolean): GitChangeDiff {
  const project = demoRepository(target, repository);
  const diff = project.diff(project.resolve(DEMO_HOME, path), staged);
  return { path, originalPath: null, status: "M", scope: staged ? "staged" : "unstaged", beforeSource: staged ? "head" : "index", afterSource: staged ? "index" : "worktree", before: textVersion(diff.before), after: textVersion(diff.after) };
}
export function demoGitAction(target: DemoTarget, action: RemoteGitAction): GitSnapshot {
  const repository = "repository" in action ? action.repository : action.path;
  const project = demoRepository(target, repository);
  switch (action.type) {
    case "snapshot": case "fetch": return demoGitSnapshot(target, repository);
    case "stage": project.stage(action.paths.map(path => project.resolve(DEMO_HOME, path))); break;
    case "unstage": project.unstage(action.paths.map(path => project.resolve(DEMO_HOME, path))); break;
    case "stageAll": project.stage(project.changes().filter(change => change.unstaged).map(change => change.path)); break;
    case "unstageAll": project.unstage(project.changes().filter(change => change.staged).map(change => change.path)); break;
    case "commit": project.commit(action.message); break;
    default: throw new Error("此 Git 操作尚未模拟；可体验差异、暂存、取消暂存和提交。");
  }
  return demoGitSnapshot(target, repository);
}
