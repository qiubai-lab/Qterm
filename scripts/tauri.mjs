import { fileURLToPath, pathToFileURL } from "node:url";

export const DEVELOPMENT_CONFIG_PATH = "src-tauri/tauri.dev.conf.json";
export const MACOS_DEVELOPMENT_RUNNER_PATH = fileURLToPath(
  new URL("./tauri-dev-runner.mjs", import.meta.url),
);

export function withDevelopmentConfig(args, platform = process.platform) {
  const forwarded = [...args];
  if (forwarded[0] !== "dev") {
    return forwarded;
  }

  const alreadyConfigured = forwarded.some(
    (argument, index) =>
      argument === DEVELOPMENT_CONFIG_PATH &&
      (forwarded[index - 1] === "--config" || forwarded[index - 1] === "-c"),
  );
  if (!alreadyConfigured) {
    forwarded.splice(1, 0, "--config", DEVELOPMENT_CONFIG_PATH);
  }

  const hasCustomRunner = forwarded.some(
    (argument) => argument === "--runner" || argument === "-r",
  );
  if (platform === "darwin" && !hasCustomRunner) {
    const developmentConfigIndex = forwarded.indexOf(DEVELOPMENT_CONFIG_PATH);
    forwarded.splice(
      developmentConfigIndex + 1,
      0,
      "--runner",
      MACOS_DEVELOPMENT_RUNNER_PATH,
    );
  }
  return forwarded;
}

async function run() {
  const { default: tauriCli } = await import("@tauri-apps/cli");
  await tauriCli.run(withDevelopmentConfig(process.argv.slice(2)), "pnpm tauri");
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
