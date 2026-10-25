import { execFileSync } from "node:child_process";

// Release builds stay pinned; local development may use a newer AppKit SDK.
export const MACOS_SDK_VERSION = "26.5";

function isSupportedDevelopmentSdk(version) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) return false;
  const actual = version.split(".").map(Number);
  const minimum = MACOS_SDK_VERSION.split(".").map(Number);
  for (let index = 0; index < Math.max(actual.length, minimum.length); index += 1) {
    const difference = (actual[index] ?? 0) - (minimum[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}

export function prepareMacosSdk(
  command,
  platform = process.platform,
  env = process.env,
  execute = execFileSync,
  warn = console.warn,
) {
  if (platform !== "darwin" || !["dev", "build"].includes(command)) return;

  const probeEnv = { ...env };
  delete probeEnv.SDKROOT;
  const selectSdk = (sdk, allowNewer = false) => {
    const probe = (option) => execute("xcrun", ["--sdk", sdk, option], {
      encoding: "utf8",
      env: probeEnv,
      stdio: "pipe",
    }).trim();
    const version = probe("--show-sdk-version");
    if (allowNewer ? !isSupportedDevelopmentSdk(version) : version !== MACOS_SDK_VERSION) {
      throw new Error(`Selected SDK is ${version}`);
    }
    const sdkPath = probe("--show-sdk-path");
    if (!sdkPath) throw new Error("SDK path is empty");
    return { version, sdkPath };
  };

  try {
    env.SDKROOT = selectSdk(`macosx${MACOS_SDK_VERSION}`).sdkPath;
  } catch (error) {
    if (command === "dev") {
      let selected;
      try {
        selected = selectSdk("macosx", true);
      } catch (fallbackError) {
        throw new Error(
          `Qterm dev requires macOS SDK ${MACOS_SDK_VERSION} or newer. Install matching Xcode/Command Line Tools or select it with DEVELOPER_DIR. ${fallbackError.message}`,
          { cause: fallbackError },
        );
      }
      env.SDKROOT = selected.sdkPath;
      warn(
        `Qterm dev: macOS SDK ${MACOS_SDK_VERSION} is unavailable; using SDK ${selected.version} (${selected.sdkPath}). Release builds still require SDK ${MACOS_SDK_VERSION}; native window appearance and behavior may differ.`,
      );
      return;
    }
    throw new Error(
      `Qterm requires macOS SDK ${MACOS_SDK_VERSION} for build. Install matching Xcode/Command Line Tools or select it with DEVELOPER_DIR. ${error.message}`,
      { cause: error },
    );
  }
}
