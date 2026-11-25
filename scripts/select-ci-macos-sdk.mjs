import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync } from "node:fs";
import { BUILD_SDK_VERSIONS, probeMacosSdk } from "./macos-sdk.mjs";

const activeDirectory = execFileSync("xcode-select", ["-p"], { encoding: "utf8" }).trim();
function selectToolchain() {
  const directories = BUILD_SDK_VERSIONS.map(version => `/Applications/Xcode_${version}.app/Contents/Developer`);
  const installed = new Set([...directories, activeDirectory].filter(directory => existsSync(directory)));
  for (const version of BUILD_SDK_VERSIONS) {
    for (const directory of installed) {
      try {
        const sdk = probeMacosSdk(version, { ...process.env, DEVELOPER_DIR: directory });
        return { ...sdk, directory };
      } catch (error) {
        console.warn(`Could not select SDK ${version} in ${directory}: ${error.message}`);
      }
    }
  }
  throw new Error(`Runner requires macOS SDK ${BUILD_SDK_VERSIONS.join(" or ")}`);
}

const { version, sdkPath, directory } = selectToolchain();
console.log(`Building with SDK ${version} in ${directory}`);
appendFileSync(process.env.GITHUB_ENV, `DEVELOPER_DIR=${directory}\nSDKROOT=${sdkPath}\nQTERM_BUILD_SDK=${version}\n`);
