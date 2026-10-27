// Run real AppKit menu regressions against the actual TypeScript event adapter.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ts from "typescript";

if (process.platform !== "darwin") throw new Error("This native regression requires macOS");
const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = await mkdtemp(path.join(tmpdir(), "qterm-native-edit-"));
try {
  const source = await readFile(path.join(root, "src/terminal/terminalClipboardShortcuts.ts"), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const fixture = path.join(directory, "clipboard.js");
  await writeFile(fixture, `window.QtermClipboard = (() => { const exports = {};\n${outputText}\nreturn exports; })();`);
  const result = spawnSync("cargo", ["run", "--example", "macos_web_edit"], {
    cwd: path.join(root, "src-tauri"), stdio: "inherit",
    env: { ...process.env, QTERM_TERMINAL_EDIT_FIXTURE: fixture },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
