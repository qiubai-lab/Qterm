import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execute, installMacApp } from "./install-local.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PLATFORMS = { darwin: "macos", win32: "windows", linux: "linux" };
const BUNDLES = { macos: "app,dmg", windows: "nsis,msi", linux: "appimage,deb,rpm" };

export function packagePlan({ platform = process.platform, requested = "current", install = false, linuxManager = null } = {}) {
  const host = PLATFORMS[platform];
  if (!host) throw new Error(`Unsupported host platform: ${platform}`);
  if (requested !== "current" && requested !== host) {
    throw new Error(`Build ${requested} packages on a ${requested} host; this host is ${host}.`);
  }
  let bundles = BUNDLES[host];
  if (install) {
    if (host === "linux" && !["apt", "dnf"].includes(linuxManager)) {
      throw new Error("Local installation requires apt or dnf. Use make package-linux and install its AppImage manually on other distributions.");
    }
    bundles = host === "macos" ? "app" : host === "windows" ? "nsis" : linuxManager === "apt" ? "deb" : "rpm";
  }
  return { host, bundles, args: ["build", "--bundles", bundles], install, linuxManager };
}

export function parseOptions(args) {
  const options = { requested: "current", install: false, dryRun: false, help: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--install") options.install = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--help") options.help = true;
    else if (arg === "--platform" && ["current", "macos", "windows", "linux"].includes(args[index + 1])) options.requested = args[++index];
    else throw new Error(`Unknown or incomplete argument: ${arg}. Use --help.`);
  }
  return options;
}

async function linuxPackageManager() {
  for (const command of ["apt", "dnf"]) {
    for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
      try { await access(path.join(directory, command)); return command; } catch { /* Try next executable. */ }
    }
  }
  return null;
}

export async function recentInstaller(directory, suffix, started) {
  const candidates = [];
  for (const name of await readdir(directory)) {
    if (!name.endsWith(suffix)) continue;
    const file = path.join(directory, name);
    const info = await stat(file);
    // Allow coarse filesystem timestamps, but never pick an arbitrary old installer.
    if (info.isFile() && info.mtimeMs >= started - 2000) candidates.push(file);
  }
  if (candidates.length !== 1) throw new Error(`Expected exactly one newly built ${suffix} installer in ${directory}; found ${candidates.length}.`);
  return candidates[0];
}

export async function buildAndInstall(plan, { root = ROOT, run = execute, installMac = installMacApp } = {}) {
  if (process.env.CARGO_BUILD_TARGET) throw new Error("Unset CARGO_BUILD_TARGET for host packaging; use pnpm tauri build --target for explicit cross-architecture builds.");
  const started = Date.now();
  run(process.execPath, [path.join(root, "scripts/tauri.mjs"), ...plan.args], { cwd: root });
  if (!plan.install) return;
  const metadata = JSON.parse(run("cargo", ["metadata", "--no-deps", "--format-version", "1"], {
    cwd: path.join(root, "src-tauri"), encoding: "utf8", stdio: "pipe",
  }));
  const bundle = path.join(metadata.target_directory, "release/bundle");
  if (plan.host === "macos") {
    const config = JSON.parse(await readFile(path.join(root, "src-tauri/tauri.conf.json"), "utf8"));
    await installMac(path.join(bundle, "macos/Qterm.app"), "/Applications/Qterm.app", config.identifier);
  } else if (plan.host === "windows") {
    run(await recentInstaller(path.join(bundle, "nsis"), "-setup.exe", started), []);
  } else {
    const format = plan.linuxManager === "apt" ? "deb" : "rpm";
    const installer = await recentInstaller(path.join(bundle, format), `.${format}`, started);
    run("sudo", [plan.linuxManager, "install", "--", installer]);
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: pnpm package:desktop [--platform current|macos|windows|linux] [--install] [--dry-run]\nUses standard release configuration and the user-managed version. --install builds first, then installs locally. Quit Qterm before installing.");
    return;
  }
  const plan = packagePlan({ ...options, linuxManager: process.platform === "linux" && options.install ? await linuxPackageManager() : null });
  console.log(`Host: ${plan.host}; command: pnpm tauri ${plan.args.join(" ")}`);
  if (options.dryRun) {
    if (plan.install) console.log(`Then install locally using ${plan.host === "macos" ? "/Applications/Qterm.app" : plan.host === "windows" ? "the NSIS wizard" : plan.linuxManager}.`);
    return;
  }
  await buildAndInstall(plan);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
