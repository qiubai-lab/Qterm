import { DEMO_HOME, demoFiles, resolveDemoPath } from "./fixtures";

export type DemoTarget = string | null;
export interface DemoFile { path: string; content: string; revision: number }
export interface DemoChange { path: string; staged: boolean; unstaged: boolean }
export interface DemoCommit { id: string; message: string }

/** The single simulated backend for one target. WorkspaceProvider still owns UI state. */
export class DemoProject {
  private readonly files = new Map<string, DemoFile>();
  private readonly head = new Map<string, string>();
  private readonly index = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private commits: DemoCommit[] = [
    { id: "7c1b2a0", message: "feat: add workspace preview" },
    { id: "34d8f21", message: "feat: initialize demo project" },
  ];

  constructor(readonly target: DemoTarget) {
    for (const [path, content] of Object.entries(demoFiles)) {
      this.files.set(path, { path, content, revision: 1 });
      const committed = path.endsWith("/src/main.ts") ? 'console.log("Qterm");\n' : content;
      this.head.set(path, committed);
      this.index.set(path, committed);
    }
  }

  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getVersion = () => this.version;
  private emit() { this.version += 1; this.listeners.forEach(listener => listener()); }

  resolve(cwd: string, input?: string) { return resolveDemoPath(cwd, input); }
  isDirectory(path: string) { return [...this.files.keys()].some(file => file.startsWith(path === "/" ? "/" : `${path}/`)); }
  list(path: string): { name: string; path: string; isDirectory: boolean }[] {
    if (!this.isDirectory(path)) throw new Error(`没有该演示目录：${path}`);
    const prefix = path === "/" ? "/" : `${path}/`;
    const names = new Set([...this.files.keys()].filter(file => file.startsWith(prefix)).map(file => file.slice(prefix.length).split("/")[0]));
    return [...names].sort().map(name => {
      const child = `${path === "/" ? "" : path}/${name}`;
      return { name, path: child, isDirectory: this.isDirectory(child) };
    });
  }
  read(path: string): DemoFile {
    const file = this.files.get(path);
    if (!file) throw new Error(`没有该演示文件：${path}`);
    return { ...file };
  }
  write(path: string, content: string, expectedRevision: number): DemoFile {
    const file = this.files.get(path);
    if (!file) throw new Error(`没有该演示文件：${path}`);
    if (file.revision !== expectedRevision) throw new Error("文件已被另一处修改，请重新打开后再保存。");
    if (content.length > 65536) throw new Error("演示文件最多支持 64 KiB 文本。");
    if (content !== file.content) {
      this.files.set(path, { path, content, revision: file.revision + 1 });
      this.emit();
    }
    return this.read(path);
  }

  changes(): DemoChange[] {
    return [...this.files.keys()].sort().flatMap(path => {
      const worktree = this.files.get(path)!.content;
      const staged = this.index.get(path) !== this.head.get(path);
      const unstaged = worktree !== this.index.get(path);
      return staged || unstaged ? [{ path, staged, unstaged }] : [];
    });
  }
  diff(path: string, staged: boolean): { before: string; after: string } {
    this.read(path);
    return staged
      ? { before: this.head.get(path)!, after: this.index.get(path)! }
      : { before: this.index.get(path)!, after: this.files.get(path)!.content };
  }
  private expectVersion(expectedVersion?: number) { if (expectedVersion !== undefined && expectedVersion !== this.version) throw new Error("仓库状态已变化，请刷新后重试。"); }
  stage(paths: string[], expectedVersion?: number) {
    this.expectVersion(expectedVersion);
    if (!paths.length) throw new Error("请先选择更改文件。");
    for (const path of paths) { this.read(path); if (this.files.get(path)!.content === this.index.get(path)) throw new Error(`没有可暂存的更改：${path}`); }
    for (const path of paths) this.index.set(path, this.files.get(path)!.content);
    this.emit();
  }
  unstage(paths: string[], expectedVersion?: number) {
    this.expectVersion(expectedVersion);
    if (!paths.length) throw new Error("请先选择已暂存文件。");
    for (const path of paths) { this.read(path); if (this.index.get(path) === this.head.get(path)) throw new Error(`文件尚未暂存：${path}`); }
    for (const path of paths) this.index.set(path, this.head.get(path)!);
    this.emit();
  }
  commit(message: string, expectedVersion?: number): DemoCommit {
    this.expectVersion(expectedVersion);
    const clean = message.trim();
    if (!clean) throw new Error("请输入提交说明。");
    if (![...this.index.keys()].some(path => this.index.get(path) !== this.head.get(path))) throw new Error("没有可提交的暂存更改。");
    this.head.clear();
    for (const [path, content] of this.index) this.head.set(path, content);
    const commit = { id: (this.commits.length + 1).toString(16).padStart(7, "0"), message: clean.slice(0, 120) };
    this.commits = [commit, ...this.commits];
    this.emit();
    return commit;
  }
  log() { return [...this.commits]; }
  status() {
    const changes = this.changes();
    if (!changes.length) return "On branch main\nYour branch is up to date with 'origin/main'.\n\nnothing to commit, working tree clean\n(simulated repository)";
    const staged = changes.filter(change => change.staged).map(change => `  modified:   ${change.path.slice(DEMO_HOME.length + 1)}`);
    const unstaged = changes.filter(change => change.unstaged).map(change => `  modified:   ${change.path.slice(DEMO_HOME.length + 1)}`);
    return ["On branch main", "Your branch is up to date with 'origin/main'.", staged.length ? `\nChanges to be committed:\n${staged.join("\n")}` : "", unstaged.length ? `\nChanges not staged for commit:\n${unstaged.join("\n")}` : "", "\n(simulated repository)"].filter(Boolean).join("\n");
  }
}

const projects = new Map<string, DemoProject>();
export function getDemoProject(target: DemoTarget): DemoProject {
  const key = target ?? "local";
  let project = projects.get(key);
  if (!project) { project = new DemoProject(target); projects.set(key, project); }
  return project;
}
export function resetDemoProjects() { projects.clear(); }
