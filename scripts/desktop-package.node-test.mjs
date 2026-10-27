import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildAndInstall, packagePlan, parseOptions, recentInstaller } from "./desktop-package.mjs";

test("platform packaging uses standard release bundles and rejects a foreign host", () => {
  for (const [platform, requested, bundles] of [["darwin", "macos", "app,dmg"], ["win32", "windows", "nsis,msi"], ["linux", "linux", "appimage,deb,rpm"]]) {
    assert.deepEqual(packagePlan({ platform, requested }).args, ["build", "--bundles", bundles]);
    assert.equal(packagePlan({ platform }).host, requested);
    assert.throws(() => packagePlan({ platform, requested: "foreign" }), /host/);
  }
  assert.throws(() => packagePlan({ platform: "freebsd" }), /Unsupported/);
});

test("local installation builds only the native format its installer consumes", () => {
  for (const [platform, linuxManager, bundles] of [["darwin", null, "app"], ["win32", null, "nsis"], ["linux", "apt", "deb"], ["linux", "dnf", "rpm"]]) {
    assert.deepEqual(packagePlan({ platform, install: true, linuxManager }).args, ["build", "--bundles", bundles]);
  }
  assert.throws(() => packagePlan({ platform: "linux", install: true }), /apt or dnf/);
});

test("argument parsing rejects overrides that could change release/profile identity", () => {
  assert.deepEqual(parseOptions(["--platform", "macos", "--install", "--dry-run"]), {
    requested: "macos", install: true, dryRun: true, help: false,
  });
  for (const args of [["--platform"], ["--platform", "other"], ["--debug"], ["--config", "elsewhere"], ["--version", "dev"]]) {
    assert.throws(() => parseOptions(args), /argument/);
  }
});

test("a failed build never invokes an installer", async () => {
  let called = false;
  await assert.rejects(buildAndInstall(packagePlan({ platform: "darwin", install: true }), {
    run: () => { throw new Error("build failed"); },
    installMac: () => { called = true; },
  }), /build failed/);
  assert.equal(called, false);
});

test("macOS install resolves Cargo's output directory and keeps standard Qterm identity", async () => {
  const calls = [];
  let installation;
  await buildAndInstall(packagePlan({ platform: "darwin", install: true }), {
    run: (command, args) => {
      calls.push({ command, args });
      return command === "cargo" ? JSON.stringify({ target_directory: "/tmp/target with spaces" }) : undefined;
    },
    installMac: (...args) => { installation = args; },
  });
  assert.deepEqual(calls[0].args.slice(1), ["build", "--bundles", "app"]);
  assert.deepEqual(installation, ["/tmp/target with spaces/release/bundle/macos/Qterm.app", "/Applications/Qterm.app", "com.qiubai.qterm"]);
});

test("installer discovery rejects stale and ambiguous output", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "qterm-installers-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = path.join(dir, "Qterm old-setup.exe");
  await writeFile(first, "old");
  await utimes(first, new Date(0), new Date(0));
  await assert.rejects(recentInstaller(dir, "-setup.exe", Date.now()), /found 0/);
  const fresh = path.join(dir, "Qterm new-setup.exe");
  await writeFile(fresh, "new");
  assert.equal(await recentInstaller(dir, "-setup.exe", Date.now()), fresh);
  await writeFile(path.join(dir, "Qterm second-setup.exe"), "duplicate");
  await assert.rejects(recentInstaller(dir, "-setup.exe", Date.now()), /found 2/);
});

test("Windows/Linux invoke the native installer with one literal artifact argument", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "qterm package space-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [platform, manager, format, name] of [
    ["win32", null, "nsis", "Qterm_0.6.0_x64-setup.exe"],
    ["linux", "apt", "deb", "qterm_0.6.0_amd64.deb"],
    ["linux", "dnf", "rpm", "Qterm-0.6.0.x86_64.rpm"],
  ]) {
    const dir = path.join(root, "release/bundle", format);
    await mkdir(dir, { recursive: true });
    const installer = path.join(dir, name);
    await writeFile(installer, "test installer");
    const calls = [];
    await buildAndInstall(packagePlan({ platform, install: true, linuxManager: manager }), {
      run: (command, args) => {
        calls.push({ command, args });
        return command === "cargo" ? JSON.stringify({ target_directory: root }) : undefined;
      },
    });
    assert.deepEqual(calls.at(-1), platform === "win32"
      ? { command: installer, args: [] }
      : { command: "sudo", args: [manager, "install", "--", installer] });
  }
});
