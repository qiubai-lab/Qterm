import { execFileSync } from "node:child_process";
import { lstat, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { matchingBundleProcessIds } from "./tauri-dev-runner.mjs";

export function execute(file, args, options = {}) {
  return execFileSync(file, args, { stdio: "inherit", ...options });
}

async function exists(file) {
  try { return await lstat(file); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

// The old bundle stays recoverable until the staged bundle has been committed.
export async function replaceBundle(staged, destination, move = rename) {
  const backup = `${destination}.previous-${randomUUID()}`;
  const previous = await exists(destination);
  if (previous) await move(destination, backup);
  try {
    await move(staged, destination);
  } catch (error) {
    if (previous) {
      try { await move(backup, destination); }
      catch (restoreError) {
        throw new Error(`Installation failed; restore the previous app from ${backup}. ${restoreError.message}`, { cause: error });
      }
    }
    throw error;
  }
  if (previous) await rm(backup, { recursive: true });
}

export async function installMacApp(source, destination, identifier, run = execute) {
  const readIdentifier = (bundle) => run("/usr/bin/plutil", [
    "-extract", "CFBundleIdentifier", "raw", "-o", "-", path.join(bundle, "Contents/Info.plist"),
  ], { encoding: "utf8", stdio: "pipe" }).trim();
  if (readIdentifier(source) !== identifier) throw new Error("Built app identifier does not match Qterm.");
  const previous = await exists(destination);
  if (previous && (!previous.isDirectory() || previous.isSymbolicLink() || readIdentifier(destination) !== identifier)) {
    throw new Error(`Refusing to replace an unrelated app or symlink at ${destination}.`);
  }
  const executable = path.join(destination, "Contents/MacOS/Qterm");
  const processes = run("/bin/ps", ["-axo", "pid=,command="], { encoding: "utf8", stdio: "pipe" });
  if (matchingBundleProcessIds(processes, executable).length) {
    throw new Error(`Quit ${destination} before installing, then run make install-local again.`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = await mkdtemp(path.join(path.dirname(destination), ".qterm-install-"));
  try {
    const staged = path.join(temporary, "Qterm.app");
    run("/usr/bin/ditto", [source, staged]);
    run("/usr/bin/codesign", ["--verify", "--deep", "--strict", staged]);
    await replaceBundle(staged, destination);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(`Installed ${destination}. Launch with: open "${destination}"`);
}
