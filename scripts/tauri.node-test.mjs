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

test("package scripts route Tauri and repository checks through the wrapper tests", async () => {
  const packageJson = await readJson("package.json");

  assert.equal(packageJson.scripts.tauri, "node scripts/tauri.mjs");
  assert.match(
    packageJson.scripts.test,
    /node --test scripts\/tauri\.node-test\.mjs/,
  );
});
