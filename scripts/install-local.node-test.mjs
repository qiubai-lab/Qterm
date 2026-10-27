import assert from "node:assert/strict";
import { cpSync, readFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installMacApp, replaceBundle } from "./install-local.mjs";

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qterm-local-install-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, "bundle/Qterm.app");
  const destination = path.join(root, "Applications/Qterm.app");
  await mkdir(path.join(source, "Contents"), { recursive: true });
  await mkdir(path.join(destination, "Contents"), { recursive: true });
  for (const app of [source, destination]) await writeFile(path.join(app, "Contents/Info.plist"), "com.qiubai.qterm");
  await writeFile(path.join(source, "version"), "new");
  await writeFile(path.join(destination, "version"), "old");
  const run = (command, args) => {
    if (command.endsWith("plutil")) return readFileSync(args.at(-1), "utf8");
    if (command.endsWith("ps")) return "";
    if (command.endsWith("ditto")) return cpSync(args[0], args[1], { recursive: true });
    assert.equal(command, "/usr/bin/codesign");
  };
  return { root, source, destination, run };
}

test("macOS local install replaces only the application and cleans the old bundle", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "user-config"), "preserve");
  await installMacApp(f.source, f.destination, "com.qiubai.qterm", f.run);
  assert.equal(await readFile(path.join(f.destination, "version"), "utf8"), "new");
  assert.equal(await readFile(path.join(f.root, "user-config"), "utf8"), "preserve");
  assert.deepEqual(await readdir(path.dirname(f.destination)), ["Qterm.app"]);
});

test("new installation works without an existing app", async (t) => {
  const f = await fixture(t);
  await rm(f.destination, { recursive: true });
  await installMacApp(f.source, f.destination, "com.qiubai.qterm", f.run);
  assert.equal(await readFile(path.join(f.destination, "version"), "utf8"), "new");
});

test("unknown apps, symlinks and a running destination are never replaced", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.destination, "Contents/Info.plist"), "other.app");
  await assert.rejects(installMacApp(f.source, f.destination, "com.qiubai.qterm", f.run), /unrelated/);
  await rm(f.destination, { recursive: true });
  await symlink(f.source, f.destination);
  await assert.rejects(installMacApp(f.source, f.destination, "com.qiubai.qterm", f.run), /symlink/);
  await rm(f.destination);
  await assert.rejects(installMacApp(f.source, f.destination, "com.qiubai.qterm", (command, args) => command.endsWith("ps")
    ? `  123 ${f.destination}/Contents/MacOS/Qterm\n` : f.run(command, args)), /Quit/);
});

test("copy/signature failures leave the previous app intact", async (t) => {
  const f = await fixture(t);
  for (const failing of ["ditto", "codesign"]) {
    await assert.rejects(installMacApp(f.source, f.destination, "com.qiubai.qterm", (command, args) => {
      if (command.endsWith(failing)) throw new Error("failed staging");
      return f.run(command, args);
    }), /failed staging/);
    assert.equal(await readFile(path.join(f.destination, "version"), "utf8"), "old");
    assert.deepEqual(await readdir(path.dirname(f.destination)), ["Qterm.app"]);
  }
});

test("failed replacement restores the previous app", async (t) => {
  const f = await fixture(t);
  await assert.rejects(replaceBundle(f.source, f.destination, (from, to) => {
    if (from === f.source) throw new Error("failed commit");
    return rename(from, to);
  }), /failed commit/);
  assert.equal(await readFile(path.join(f.destination, "version"), "utf8"), "old");
  assert.deepEqual(await readdir(path.dirname(f.destination)), ["Qterm.app"]);
});

test("failed rollback preserves the backup with an actionable recovery path", async (t) => {
  const f = await fixture(t);
  let calls = 0;
  await assert.rejects(replaceBundle(f.source, f.destination, (from, to) => {
    if (++calls > 1) throw new Error("failed move");
    return rename(from, to);
  }), /restore the previous app from/);
  const backup = (await readdir(path.dirname(f.destination))).find(name => name.includes(".previous-"));
  assert.ok(backup);
  assert.equal(await readFile(path.join(path.dirname(f.destination), backup, "version"), "utf8"), "old");
});
