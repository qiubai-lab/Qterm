import { DEMO_HOME } from "./fixtures";
import { getDemoProject, type DemoProject, type DemoTarget } from "./demoProject";
import { buildLines, runDemoCommand } from "./shellCommands";

interface SessionOptions {
  host: string;
  cwd?: string;
  columns: number;
  rows: number;
  target?: DemoTarget;
  output: (data: Uint8Array) => void;
  closed: () => void;
}

/** Owns one simulated backend session. UI state stays in WorkspaceProvider. */
export class DemoTerminalSession {
  cwd: string;
  columns: number;
  rows: number;
  private input: string[] = [];
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = 0;
  private draft = "";
  private escape = "";
  private previousCr = false;
  private decoder = new TextDecoder();
  private encoder = new TextEncoder();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private running = false;
  private renderedCursor = 0;
  private cursorAtEnd = true;
  private readonly project: DemoProject;

  constructor(private readonly options: SessionOptions) {
    this.project = getDemoProject(options.target ?? null);
    this.cwd = options.cwd && this.project.isDirectory(options.cwd) ? options.cwd : DEMO_HOME;
    this.columns = options.columns;
    this.rows = options.rows;
  }

  start() {
    this.emit("\x1b[36mQterm · 交互演示\x1b[0m\r\n");
    this.emit("欢迎来到你的远程开发工作台。\r\n");
    this.emit("\x1b[2m浏览器模拟环境 · 无需配置，即刻体验\x1b[0m\r\n\r\n");
    this.emit("  \x1b[36mnpm run build\x1b[0m         运行项目构建\r\n");
    this.emit("  \x1b[36mgit status\x1b[0m            查看代码变更\r\n");
    this.emit("  \x1b[36mtail -f logs/app.log\x1b[0m   跟踪实时日志\r\n\r\n");
    this.emit("右侧工具栏可体验文件、网络与 Git 面板。\r\n");
    this.emit("输入 \x1b[36mhelp\x1b[0m 查看更多命令，\x1b[36mCtrl+C\x1b[0m 停止任务。\r\n\r\n");
    this.reportCwd();
    this.prompt();
  }

  private emit(text: string) { if (!this.disposed) this.options.output(this.encoder.encode(text)); }
  private promptLabel() { return `demo@${this.options.host.split(".")[0]}:${this.cwd.replace(DEMO_HOME, "~")} $ `; }
  private prompt() {
    this.emit(`\x1b[32m${this.promptLabel()}\x1b[0m`);
    this.renderedCursor = cellWidth(this.promptLabel()); this.cursorAtEnd = true;
  }
  private reportCwd() { this.emit(`\x1b]7;file://${this.options.host}${this.cwd}\x07`); }
  private redraw() {
    const oldRow = Math.floor(Math.max(0, this.renderedCursor - (this.cursorAtEnd ? 1 : 0)) / this.columns);
    this.emit(`\r${oldRow ? `\x1b[${oldRow}A` : ""}\x1b[J`);
    this.prompt();
    this.emit(this.input.join(""));
    const total = cellWidth(this.promptLabel() + this.input.join(""));
    this.renderedCursor = cellWidth(this.promptLabel() + this.input.slice(0, this.cursor).join(""));
    this.cursorAtEnd = this.cursor === this.input.length;
    if (!this.cursorAtEnd) {
      const rowDelta = Math.floor(this.renderedCursor / this.columns) - Math.floor(Math.max(0, total - 1) / this.columns);
      const column = this.renderedCursor % this.columns;
      this.emit(`\r${rowDelta ? `\x1b[${Math.abs(rowDelta)}${rowDelta < 0 ? "A" : "B"}` : ""}${column ? `\x1b[${column}C` : ""}`);
    }
  }

  write(bytes: Uint8Array) {
    if (this.disposed) return;
    const text = this.decoder.decode(bytes, { stream: true });
    if (text === "\x1bcls\r") { this.write(this.encoder.encode("\x03clear\r")); return; }
    for (const char of text) this.character(char);
  }

  private character(char: string) {
    if (this.disposed) return;
    if (char === "\x03") {
      this.stopTask(); this.input = []; this.cursor = 0; this.escape = "";
      this.emit("^C\r\n"); this.prompt(); return;
    }
    if (this.running) return;
    if (this.escape) {
      this.escape += char;
      if (this.escape === "\x1b[") return;
      if (this.escape.startsWith("\x1b[") && /^[0-9;]*$/.test(this.escape.slice(2)) && this.escape.length < 20) return;
      this.handleEscape(this.escape); this.escape = ""; return;
    }
    if (char === "\x1b") { this.escape = char; return; }
    if (char === "\n" && this.previousCr) { this.previousCr = false; return; }
    this.previousCr = char === "\r";
    if (char === "\r" || char === "\n") { this.execute(); return; }
    if (char === "\x7f" || char === "\b") {
      if (this.cursor) this.input.splice(--this.cursor, 1);
    } else if (char === "\x01") this.cursor = 0;
    else if (char === "\x05") this.cursor = this.input.length;
    else if (char === "\x15") { this.input.splice(0, this.cursor); this.cursor = 0; }
    else if (char === "\x0c") this.emit("\x1b[2J\x1b[H");
    else if (char >= " " && this.input.length < 4096) {
      const append = this.cursor === this.input.length;
      this.input.splice(this.cursor++, 0, char);
      if (append) { this.emit(char); this.renderedCursor += cellWidth(char); this.cursorAtEnd = true; return; }
    }
    else return;
    this.redraw();
  }

  private handleEscape(sequence: string) {
    if (sequence === "\x1b[A" || sequence === "\x1b[B") {
      if (this.historyIndex === this.history.length) this.draft = this.input.join("");
      this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (sequence.endsWith("A") ? -1 : 1)));
      this.input = Array.from(this.history[this.historyIndex] ?? this.draft);
      this.cursor = this.input.length;
    } else if (sequence === "\x1b[D") this.cursor = Math.max(0, this.cursor - 1);
    else if (sequence === "\x1b[C") this.cursor = Math.min(this.input.length, this.cursor + 1);
    else if (sequence === "\x1b[H") this.cursor = 0;
    else if (sequence === "\x1b[F") this.cursor = this.input.length;
    else if (sequence === "\x1b[3~") this.input.splice(this.cursor, 1);
    else return; // Includes bracketed-paste markers; never print escape sequences.
    this.redraw();
  }

  private execute() {
    const line = this.input.join("");
    this.input = []; this.cursor = 0;
    if (line.trim()) this.history = [...this.history.slice(-49), line];
    this.historyIndex = this.history.length; this.draft = "";
    this.emit("\r\n");
    const result = runDemoCommand(line, this.cwd, this.project);
    if (result.clear) this.emit("\x1b[2J\x1b[H");
    if (result.output) this.emit(`${result.output.replace(/\r?\n/g, "\r\n")}\r\n`);
    if (result.cwd) { this.cwd = result.cwd; this.reportCwd(); }
    if (result.exit) { this.close(); return; }
    if (result.stream) { this.startTask(result.stream); return; }
    this.prompt();
  }

  private startTask(kind: "build" | "logs") {
    this.running = true;
    let step = 0;
    const tick = () => {
      if (this.disposed || !this.running) return;
      const line = kind === "build" ? buildLines[step] : `[info] request ${String(step + 1).padStart(3, "0")} · GET /api/health · 200 OK · ${12 + step % 8}ms`;
      this.emit(`${line}\r\n`); step++;
      if (kind === "build" && step === buildLines.length) { this.stopTask(); this.prompt(); }
      else this.timer = setTimeout(tick, kind === "build" ? 180 : 1000);
    };
    this.timer = setTimeout(tick, 100);
  }

  resize(columns: number, rows: number) { this.columns = Math.max(1, columns); this.rows = Math.max(1, rows); }
  private stopTask() { clearTimeout(this.timer); this.timer = undefined; this.running = false; }
  close() {
    if (this.disposed) return;
    this.stopTask(); this.disposed = true; this.options.closed();
  }
}

function cellWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => sum + (/\p{Mark}/u.test(char) ? 0 : char.codePointAt(0)! >= 0x2e80 ? 2 : 1), 0);
}
