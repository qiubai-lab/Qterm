import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { prepareMacosSdk, MACOS_SDK_VERSION } from "./macos-sdk.mjs";

test("dev and build prefer the pinned SDK, including an inherited SDKROOT", () => {
  for (const command of ["dev", "build"]) {
    const env = { SDKROOT: "/old/sdk", DEVELOPER_DIR: "/selected/developer" };
    const calls = [];
    prepareMacosSdk(command, "darwin", env, (file, args, options) => {
      calls.push({ file, args, env: options.env });
      return args.includes("--show-sdk-path") ? "/selected/MacOSX26.5.sdk\n" : "26.5\n";
    }, () => assert.fail("the pinned SDK should not warn"));
    assert.equal(env.SDKROOT, "/selected/MacOSX26.5.sdk");
    assert.equal(calls.length, 2);
    assert.ok(calls.every(({ file, args, env }) =>
      file === "xcrun" && args[1] === "macosx26.5" && !("SDKROOT" in env),
    ));
    assert.equal(calls[0].env.DEVELOPER_DIR, "/selected/developer");
  }
});

test("dev falls back to a newer SDK with a warning and preserves developer selection", () => {
  for (const version of ["26.6", "26.10", "27.0", "27.0.1"]) {
    const env = { SDKROOT: "/old/sdk", DEVELOPER_DIR: "/selected/developer" };
    const warnings = [];
    const calls = [];
    prepareMacosSdk("dev", "darwin", env, (file, args, options) => {
      calls.push(args);
      assert.equal(file, "xcrun");
      assert.equal(options.env.DEVELOPER_DIR, env.DEVELOPER_DIR);
      assert.equal("SDKROOT" in options.env, false);
      assert.equal(options.stdio, "pipe");
      if (args[1] === "macosx26.5") throw new Error("SDK not found");
      assert.equal(args[1], "macosx");
      return args.includes("--show-sdk-path") ? `/sdk/${version}\n` : `${version}\n`;
    }, (warning) => warnings.push(warning));
    assert.equal(env.SDKROOT, `/sdk/${version}`);
    assert.equal(calls.length, 3);
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes(version));
    assert.match(warnings[0], /26\.5/);
    assert.match(warnings[0], /dev/i);
  }
});

test("dev rejects old or malformed fallback versions without replacing SDKROOT", () => {
  for (const version of ["15.5", "26.4", "26.4.9", "", "unknown", "27.0beta"]) {
    const env = { SDKROOT: "/original/sdk" };
    assert.throws(() => prepareMacosSdk("dev", "darwin", env, (_file, args) => {
      if (args[1] === "macosx26.5") throw new Error("SDK not found");
      assert.equal(args[2], "--show-sdk-version");
      return version;
    }, () => assert.fail("failed selection should not warn")), /SDK/);
    assert.equal(env.SDKROOT, "/original/sdk");
  }
});

test("dev fails clearly when fallback discovery fails or returns an empty path", () => {
  for (const emptyPath of [false, true]) {
    const env = {};
    assert.throws(() => prepareMacosSdk("dev", "darwin", env, (_file, args) => {
      if (args[1] === "macosx26.5" || !emptyPath) throw new Error("SDK not found");
      return args.includes("--show-sdk-version") ? "27.0" : "  \n";
    }), /SDK not found|SDK path is empty/);
    assert.equal("SDKROOT" in env, false);
  }
});

test("build never falls back to the default SDK", () => {
  for (const mismatch of [false, true]) {
    const calls = [];
    const env = { SDKROOT: "/sdk/27.0" };
    assert.throws(() => prepareMacosSdk("build", "darwin", env, (_file, args) => {
      calls.push(args);
      if (!mismatch) throw new Error("SDK not found");
      return "27.0";
    }), /requires macOS SDK 26\.5/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], "macosx26.5");
    assert.equal(env.SDKROOT, "/sdk/27.0");
  }
});

test("other platforms and informational commands do not probe Apple tools", () => {
  for (const [command, platform] of [
    ["build", "linux"], ["dev", "win32"], ["info", "darwin"],
  ]) {
    prepareMacosSdk(command, platform, {}, () => assert.fail("unexpected SDK probe"));
  }
});

test("missing or mismatched SDK fails before building", () => {
  assert.throws(() => prepareMacosSdk("build", "darwin", {}, () => {
    throw new Error("SDK not found");
  }), /26\.5/);
  assert.throws(() => prepareMacosSdk("dev", "darwin", {}, (_file, args) =>
    args.includes("--show-sdk-path") ? "/sdk" : "15.5",
  ), /15\.5/);
});

test("CI and tag builds explicitly select the pinned release SDK", async () => {
  const release = parse(await readFile(".github/workflows/build-desktop.yml", "utf8"));
  const ci = parse(await readFile(".github/workflows/ci.yml", "utf8"));
  const macs = release.jobs.build.strategy.matrix.include.filter(({ target }) =>
    target.endsWith("apple-darwin"),
  );
  assert.deepEqual(macs.map(({ os }) => os), ["macos-26", "macos-26-intel"]);
  assert.ok(ci.jobs["desktop-build"].strategy.matrix.os.includes("macos-26"));
  for (const job of [release.jobs.build, ci.jobs["desktop-build"]]) {
    const setup = job.steps.find(({ name }) => name === "Select macOS build SDK");
    assert.equal(setup?.if, "runner.os == 'macOS'");
    assert.ok(setup.run.includes(
      `/Applications/Xcode_${MACOS_SDK_VERSION}.app/Contents/Developer`,
    ));
    const cacheIndex = job.steps.findIndex(({ uses }) =>
      uses?.startsWith("Swatinem/rust-cache"),
    );
    assert.ok(job.steps.indexOf(setup) < cacheIndex);
  }
});
