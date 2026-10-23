import { execFileSync } from "node:child_process";

// Keep the local toolchain and both macOS CI architectures on the same AppKit SDK.
export const MACOS_SDK_VERSION = "26.5";

export function prepareMacosSdk(
  command,
  platform = process.platform,
  env = process.env,
  execute = execFileSync,
) {
  if (platform !== "darwin" || !["dev", "build"].includes(command)) return;

  const probeEnv = { ...env };
  delete probeEnv.SDKROOT;
  const sdk = `macosx${MACOS_SDK_VERSION}`;
  try {
    const probe = (option) => execute("xcrun", ["--sdk", sdk, option], {
      encoding: "utf8",
      env: probeEnv,
    }).trim();
    const version = probe("--show-sdk-version");
    if (version !== MACOS_SDK_VERSION) {
      throw new Error(`Selected SDK is ${version}`);
    }
    const sdkPath = probe("--show-sdk-path");
    if (!sdkPath) throw new Error("SDK path is empty");
    env.SDKROOT = sdkPath;
  } catch (error) {
    throw new Error(
      `Qterm requires macOS SDK ${MACOS_SDK_VERSION} for dev and build. Install matching Xcode/Command Line Tools or select it with DEVELOPER_DIR. ${error.message}`,
      { cause: error },
    );
  }
}
