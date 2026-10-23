import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "yaml";
import { prepareMacosSdk, MACOS_SDK_VERSION } from "./macos-sdk.mjs";

test("dev and build select the same SDK, including an inherited SDKROOT", () => {
  for (const command of ["dev", "build"]) {
    const env = { SDKROOT: "/old/sdk", DEVELOPER_DIR: "/selected/developer" };
    const calls = [];
    prepareMacosSdk(command, "darwin", env, (file, args, options) => {
      calls.push({ file, args, env: options.env });
      return args.includes("--show-sdk-path") ? "/selected/MacOSX26.5.sdk\n" : "26.5\n";
    });
    assert.equal(env.SDKROOT, "/selected/MacOSX26.5.sdk");
    assert.equal(calls.length, 2);
    assert.ok(calls.every(({ file, args, env }) =>
      file === "xcrun" && args[1] === "macosx26.5" && !("SDKROOT" in env),
    ));
    assert.equal(calls[0].env.DEVELOPER_DIR, "/selected/developer");
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

test("CI and tag builds explicitly select the SDK used by local commands", async () => {
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
