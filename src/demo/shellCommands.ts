import { DEMO_HOME } from "./fixtures";
import type { DemoProject } from "./demoProject";

export interface CommandResult { output?: string; cwd?: string; clear?: boolean; stream?: "build" | "logs"; exit?: boolean }

export function runDemoCommand(line: string, cwd: string, project: DemoProject): CommandResult {
  const [command, ...args] = line.trim().split(/\s+/);
  const path = project.resolve(cwd, args.join(" ") || undefined);
  switch (command) {
    case "": return {};
    case "help": return { output: "可体验命令\n  pwd / ls [目录] / cd [目录] / cat <文件>\n  whoami / uname / echo <文本> / clear / exit\n  git status / git log / npm run build\n  tail -f logs/app.log   持续日志，Ctrl+C 停止\n\n↑ ↓ 浏览历史，← → 编辑输入。命令仅操作预置演示数据。" };
    case "pwd": return { output: cwd };
    case "whoami": return { output: "demo" };
    case "uname": return { output: "Linux demo-host 6.8.0 x86_64 GNU/Linux (simulated)" };
    case "echo": return { output: Array.from(args.join(" ")).filter(char => char >= " " && char !== "\x7f").join("") };
    case "ls": {
      const directory = args.length ? path : cwd;
      return { output: project.isDirectory(directory) ? project.list(directory).map(item => item.isDirectory ? `${item.name}/` : item.name).join("  ") : `ls: ${args.join(" ")}: 没有该演示目录` };
    }
    case "cd": return project.isDirectory(path) ? { cwd: path } : { output: `cd: ${args.join(" ")}: 没有该演示目录` };
    case "cat": { if (!args.length) return { output: "用法：cat README.md" }; try { return { output: project.read(path).content }; } catch { return { output: `cat: ${args.join(" ")}: 没有该演示文件` }; } }
    case "clear": return { clear: true };
    case "exit": return { exit: true };
    case "git": return args.join(" ") === "status"
      ? { output: project.status() }
      : args.join(" ") === "log" ? { output: project.log().map(item => `\x1b[33m${item.id}\x1b[0m ${item.message}`).join("\n") }
        : { output: "演示支持：git status、git log。" };
    case "npm": return args.join(" ") === "run build" ? { stream: "build" } : { output: "演示支持：npm run build。" };
    case "tail": return args[0] === "-f" && (() => { try { project.read(project.resolve(cwd, args[1] ?? "logs/app.log")); return true; } catch { return false; } })()
      ? { stream: "logs" } : { output: `用法：tail -f ${DEMO_HOME}/logs/app.log` };
    default: return { output: `${command}: 未模拟此命令。输入 help 查看可体验命令。` };
  }
}

export const buildLines = [
  "> demo-workspace build", "vite · building for production…", "transforming modules…", "\x1b[32m✓ 128 modules transformed.\x1b[0m",
  "dist/index.html         0.62 kB", "dist/assets/app.js     48.12 kB", "\x1b[32m✓ built in 1.20s (simulated)\x1b[0m",
];
