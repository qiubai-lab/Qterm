import { execFileSync } from "node:child_process";

export const BUILD_SDK_VERSIONS = ["27.0", "26.5"];

function isSupportedDevelopmentSdk(version) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const minimum = BUILD_SDK_VERSIONS.at(-1).split(".").map(Number);
  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const difference = (actual[index] ?? 0) - (minimum[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function probeMacosSdk(expectedVersion, env, execute = execFileSync) {
  const probeEnv = { ...env };
  delete probeEnv.SDKROOT;
  const sdk = expectedVersion ? `macosx${expectedVersion}` : "macosx";
  const probe = (option) => execute("xcrun", ["--sdk", sdk, option], {
    encoding: "utf8",
    env: probeEnv,
    stdio: "pipe",
  }).trim();
  const version = probe("--show-sdk-version");
  if (expectedVersion ? version !== expectedVersion : !isSupportedDevelopmentSdk(version)) {
    throw new Error(`Selected SDK is ${version}`);
  }
  const sdkPath = probe("--show-sdk-path");
  if (!sdkPath) throw new Error("SDK path is empty");
  return { version, sdkPath };
}

export function prepareMacosSdk(
  command,
  platform = process.platform,
  env = process.env,
  execute = execFileSync,
  warn = console.warn,
) {
  if (platform !== "darwin" || !["dev", "build"].includes(command)) return;

  const candidates = command === "dev" ? [...BUILD_SDK_VERSIONS, undefined] : BUILD_SDK_VERSIONS;
  const failures = [];
  for (const version of candidates) {
    try {
      const selected = probeMacosSdk(version, env, execute);
      env.SDKROOT = selected.sdkPath;
      if (!version) {
        warn(`Qterm dev is using SDK ${selected.version} (${selected.sdkPath}). Native window behavior may differ from a release build.`);
      }
      return;
    } catch (error) {
      failures.push(error.message);
    }
  }

  const requirement = command === "dev"
    ? `SDK ${BUILD_SDK_VERSIONS.at(-1)} or newer`
    : `SDK ${BUILD_SDK_VERSIONS.join(" or ")}`;
  throw new Error(
    `Qterm ${command} requires macOS ${requirement}. Select matching developer tools with DEVELOPER_DIR.\n${failures.join("\n")}`,
  );
}
