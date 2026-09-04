#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  rename,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const TAURI_DIRECTORY = fileURLToPath(new URL("../src-tauri/", import.meta.url));
const BINARY_NAME = "Qterm";
const DEVELOPMENT_APP_NAME = "Qterm Dev.app";
const execFileAsync = promisify(execFile);

export function matchingBundleProcessIds(processList, bundledExecutable) {
  return processList
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(.+)$/))
    .filter(
      (match) =>
        match !== null &&
        (match[2] === bundledExecutable ||
          match[2].startsWith(`${bundledExecutable} `)),
    )
    .map((match) => Number.parseInt(match[1], 10));
}

export function parseRunnerArguments(args) {
  const separatorIndex = args.indexOf("--");
  const cargoArguments = (
    separatorIndex === -1 ? args : args.slice(0, separatorIndex)
  ).slice();
  if (cargoArguments[0] !== "run") {
    throw new Error("The Qterm macOS development runner expects `cargo run` arguments.");
  }
  cargoArguments[0] = "build";
  return {
    cargoArguments,
    appArguments:
      separatorIndex === -1 ? [] : args.slice(separatorIndex + 1),
  };
}

function optionValue(args, longName) {
  const explicitIndex = args.indexOf(longName);
  if (explicitIndex !== -1) {
    return args[explicitIndex + 1];
  }
  const prefix = `${longName}=`;
  return args.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

export function resolveBundleLayout(
  tauriDirectory,
  cargoArguments,
  configuredTargetDirectory,
) {
  const targetRoot = configuredTargetDirectory
    ? path.resolve(tauriDirectory, configuredTargetDirectory)
    : path.join(tauriDirectory, "target");
  const targetTriple = optionValue(cargoArguments, "--target");
  const profile = cargoArguments.includes("--release") ? "release" : "debug";
  const compilationDirectory = targetTriple
    ? path.join(targetRoot, targetTriple, profile)
    : path.join(targetRoot, profile);
  const bundleDirectory = targetTriple
    ? path.join(targetRoot, "tauri-dev", targetTriple, profile)
    : path.join(targetRoot, "tauri-dev", profile);
  return {
    sourceExecutable: path.join(compilationDirectory, BINARY_NAME),
    bundleRoot: path.join(bundleDirectory, DEVELOPMENT_APP_NAME),
  };
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolve(signal === null ? (code ?? 1) : 1);
    });
  });
}

async function waitForChildWithSignalForwarding(child) {
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  const handlers = new Map(
    signals.map((signal) => [signal, () => child.kill(signal)]),
  );
  for (const [signal, handler] of handlers) {
    process.once(signal, handler);
  }
  try {
    return await waitForChild(child);
  } finally {
    for (const [signal, handler] of handlers) {
      process.removeListener(signal, handler);
    }
  }
}

async function prepareBundle({ sourceExecutable, bundleRoot }) {
  const contentsDirectory = path.join(bundleRoot, "Contents");
  const executableDirectory = path.join(contentsDirectory, "MacOS");
  const resourcesDirectory = path.join(contentsDirectory, "Resources");
  const bundledExecutable = path.join(executableDirectory, BINARY_NAME);
  const temporaryExecutable = `${bundledExecutable}.tmp-${process.pid}`;

  await mkdir(executableDirectory, { recursive: true });
  await mkdir(resourcesDirectory, { recursive: true });
  await Promise.all([
    copyFile(
      path.join(TAURI_DIRECTORY, "Info.dev.plist"),
      path.join(contentsDirectory, "Info.plist"),
    ),
    copyFile(
      path.join(TAURI_DIRECTORY, "icons", "icon.icns"),
      path.join(resourcesDirectory, "icon.icns"),
    ),
    copyFile(sourceExecutable, temporaryExecutable),
  ]);
  await chmod(temporaryExecutable, 0o755);
  await rename(temporaryExecutable, bundledExecutable);
  // Bind Info.plist and the real development bundle identity for macOS services.
  const signing = spawn(
    "/usr/bin/codesign",
    [
      "--force",
      "--sign",
      "-",
      "--identifier",
      "com.qiubai.qterm.dev",
      bundleRoot,
    ],
    { stdio: "inherit" },
  );
  if (await waitForChildWithSignalForwarding(signing) !== 0) {
    throw new Error("Failed to sign the Qterm development bundle.");
  }
  return bundledExecutable;
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function terminateExistingBundleInstances(bundledExecutable) {
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,command="]);
  const pids = matchingBundleProcessIds(stdout, bundledExecutable).filter(
    (pid) => pid !== process.pid,
  );
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (pids.every((pid) => !processIsRunning(pid))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  for (const pid of pids.filter(processIsRunning)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (error) {
      if (error?.code !== "ESRCH") {
        throw error;
      }
    }
  }
}

async function run() {
  if (process.platform !== "darwin") {
    throw new Error("The Qterm app-bundle development runner is only supported on macOS.");
  }

  const { cargoArguments, appArguments } = parseRunnerArguments(
    process.argv.slice(2),
  );
  const cargo = spawn("cargo", cargoArguments, {
    cwd: TAURI_DIRECTORY,
    env: process.env,
    stdio: "inherit",
  });
  const cargoExitCode = await waitForChildWithSignalForwarding(cargo);
  if (cargoExitCode !== 0) {
    process.exitCode = cargoExitCode;
    return;
  }

  const layout = resolveBundleLayout(
    TAURI_DIRECTORY,
    cargoArguments,
    process.env.CARGO_TARGET_DIR,
  );
  await terminateExistingBundleInstances(
    path.join(layout.bundleRoot, "Contents", "MacOS", BINARY_NAME),
  );
  const bundledExecutable = await prepareBundle(layout);
  const app = spawn(bundledExecutable, appArguments, {
    cwd: TAURI_DIRECTORY,
    env: process.env,
    stdio: "inherit",
  });
  process.exitCode = await waitForChildWithSignalForwarding(app);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
