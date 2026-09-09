import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  DEVELOPMENT_CONFIG_PATH,
  MACOS_DEVELOPMENT_RUNNER_PATH,
  withDevelopmentConfig,
} from "./tauri.mjs";
import {
  matchingBundleProcessIds,
  parseRunnerArguments,
  resolveBundleLayout,
} from "./tauri-dev-runner.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("development commands automatically include the development config once", () => {
  assert.deepEqual(withDevelopmentConfig(["dev"], "darwin"), [
    "dev",
    "--config",
    DEVELOPMENT_CONFIG_PATH,
    "--runner",
    MACOS_DEVELOPMENT_RUNNER_PATH,
  ]);
  assert.deepEqual(
    withDevelopmentConfig(
      ["dev", "--config", DEVELOPMENT_CONFIG_PATH, "--verbose"],
      "linux",
    ),
    ["dev", "--config", DEVELOPMENT_CONFIG_PATH, "--verbose"],
  );
});

test("dev commands preserve additional arguments and config merge order", () => {
  assert.deepEqual(
    withDevelopmentConfig(
      [
        "dev",
        "--verbose",
        "--config",
        '{"bundle":{"active":false}}',
      ],
      "linux",
    ),
    [
      "dev",
      "--config",
      DEVELOPMENT_CONFIG_PATH,
      "--verbose",
      "--config",
      '{"bundle":{"active":false}}',
    ],
  );
});

test("non-development commands pass through unchanged", () => {
  for (const args of [["build"], ["info"], ["build", "--no-bundle"]]) {
    assert.deepEqual(withDevelopmentConfig(args, "darwin"), args);
  }
});

test("macOS dev commands preserve an explicit custom runner", () => {
  assert.deepEqual(
    withDevelopmentConfig(["dev", "--runner", "/tmp/custom-runner"], "darwin"),
    [
      "dev",
      "--config",
      DEVELOPMENT_CONFIG_PATH,
      "--runner",
      "/tmp/custom-runner",
    ],
  );
});

test("macOS runner converts cargo run arguments and preserves app arguments", () => {
  assert.deepEqual(
    parseRunnerArguments([
      "run",
      "--no-default-features",
      "--color",
      "always",
      "--",
      "--example-app-argument",
    ]),
    {
      cargoArguments: [
        "build",
        "--no-default-features",
        "--color",
        "always",
      ],
      appArguments: ["--example-app-argument"],
    },
  );
});

test("macOS runner resolves debug, release and target-specific bundle layouts", () => {
  const tauriDirectory = path.resolve("test-tauri-root");
  assert.deepEqual(resolveBundleLayout(tauriDirectory, ["build"]), {
    sourceExecutable: path.join(tauriDirectory, "target", "debug", "Qterm"),
    bundleRoot: path.join(
      tauriDirectory,
      "target",
      "tauri-dev",
      "debug",
      "Qterm Dev.app",
    ),
  });
  assert.deepEqual(
    resolveBundleLayout(tauriDirectory, [
      "build",
      "--release",
      "--target",
      "aarch64-apple-darwin",
    ]),
    {
      sourceExecutable: path.join(
        tauriDirectory,
        "target",
        "aarch64-apple-darwin",
        "release",
        "Qterm",
      ),
      bundleRoot: path.join(
        tauriDirectory,
        "target",
        "tauri-dev",
        "aarch64-apple-darwin",
        "release",
        "Qterm Dev.app",
      ),
    },
  );
});

test("macOS runner replaces only exact stale development bundle processes", () => {
  const executable =
    "/tmp/Qterm target/tauri-dev/debug/Qterm Dev.app/Contents/MacOS/Qterm";
  const processList = [
    `  120 ${executable}`,
    `  121 ${executable} --inspect`,
    `  122 ${executable}-helper`,
    "  123 /Applications/Qterm.app/Contents/MacOS/Qterm",
    "  124 node scripts/tauri-dev-runner.mjs",
  ].join("\n");

  assert.deepEqual(matchingBundleProcessIds(processList, executable), [120, 121]);
});

test("development config isolates identity without replacing window arrays", async () => {
  const development = await readJson(DEVELOPMENT_CONFIG_PATH);
  const production = await readJson("src-tauri/tauri.conf.json");

  assert.equal(development.productName, "Qterm Dev");
  assert.equal(development.identifier, "com.qiubai.qterm.dev");
  assert.equal("app" in development, false);
  assert.deepEqual(development.bundle, {
    macOS: { infoPlist: "Info.dev.plist" },
  });

  assert.equal(production.productName, "Qterm");
  assert.equal(production.identifier, "com.qiubai.qterm");
  assert.equal(production.bundle.macOS.signingIdentity, "-");
});

test("macOS development bundle uses a non-reserved plist input", async () => {
  const development = await readFile("src-tauri/Info.dev.plist", "utf8");

  assert.match(development, /<string>Qterm Dev<\/string>/);
  assert.match(development, /<string>com\.qiubai\.qterm\.dev<\/string>/);
});

test("macOS traffic-light placement has one native runtime owner", async () => {
  const macos = await readJson("src-tauri/tauri.macos.conf.json");
  const applicationRoot = await readFile("src-tauri/src/lib.rs", "utf8");
  const infrastructureRoot = await readFile(
    "src-tauri/src/infrastructure/mod.rs",
    "utf8",
  );
  const [window] = macos.app.windows;

  assert.equal(window.titleBarStyle, "Overlay");
  assert.equal(window.decorations, true);
  assert.deepEqual(window.trafficLightPosition, { x: 14, y: 18 });
  assert.doesNotMatch(applicationRoot, /window_chrome/);
  assert.doesNotMatch(infrastructureRoot, /window_chrome/);
  assert.match(
    applicationRoot,
    /#\[cfg\(not\(target_os = "macos"\)\)\]\s+if let Some\(window\)[\s\S]*?window\.set_title\(product_name\)\?/,
  );
});

test("package scripts route Tauri and repository checks through the wrapper tests", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(packageJson.scripts.tauri, "node scripts/tauri.mjs");
  assert.match(
    packageJson.scripts.test,
    /node --test scripts\/tauri\.node-test\.mjs/,
  );
});
