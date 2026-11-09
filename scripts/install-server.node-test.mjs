import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const source = await readFile(new URL("./install-server.sh", import.meta.url), "utf8");
const canonicalCompose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");

async function fixture(t, overrides = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "qterm-install-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, "bin");
  await mkdir(bin);
  await writeFile(path.join(bin, "docker"), `#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
appendFileSync(process.env.MOCK_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'info') { console.log(process.env.MOCK_PLATFORM || 'linux/x86_64'); }
else if (args.includes('--help')) { console.log('--wait-timeout'); }
else if (args.includes('pull') || args.includes('up')) {
  if (readFileSync(0, 'utf8') !== '') process.exit(9);
  if (args.includes(process.env.MOCK_FAIL)) process.exit(1);
}
`, { mode: 0o755 });
  const install = path.join(root, "deployment with spaces");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("QTERM_") && !key.startsWith("COMPOSE_")));
  Object.assign(env, { PATH: `${bin}:${env.PATH}`, MOCK_LOG: path.join(root, "calls"), QTERM_INSTALL_DIR: install, QTERM_PUBLIC_ORIGIN: "http://192.168.1.10:8080" }, overrides);
  return { root, install, env, run: (input = source) => spawnSync("sh", [], { input, env, cwd: root, encoding: "utf8", timeout: 15000 }) };
}

test("piped installation creates canonical config, private random credentials and waits for health", async t => {
  const f = await fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const password = (await readFile(path.join(f.install, ".server-secrets/password"), "utf8")).trim();
  assert.match(password, /^[A-Za-z0-9]{16}$/);
  assert.equal((await stat(path.join(f.install, ".server-secrets/password"))).mode & 0o777, 0o600);
  assert.equal((await stat(path.join(f.install, ".server-secrets"))).mode & 0o777, 0o700);
  assert.ok((await stat(path.join(f.install, "data"))).isDirectory());
  assert.equal(await readFile(path.join(f.install, "compose.yaml"), "utf8"), canonicalCompose);
  const env = await readFile(path.join(f.install, ".env"), "utf8");
  assert.ok(!env.includes(password));
  assert.match(env, /QTERM_IMAGE=ghcr.io\/qiubai-lab\/qterm:latest/);
  assert.match(result.stdout, /容器健康检查通过/);
  assert.ok(result.stdout.includes(`登录密码：${password}`));
  const calls = (await readFile(f.env.MOCK_LOG, "utf8")).trim().split("\n").map(JSON.parse);
  assert.ok(calls.some(args => args.includes("--wait") && args.includes("--wait-timeout")));
  assert.ok(calls.some(args => args.includes(f.install)));
  const again = f.run();
  assert.notEqual(again.status, 0);
  assert.match(again.stderr, /不会覆盖/);
  assert.equal((await readFile(path.join(f.install, ".server-secrets/password"), "utf8")).trim(), password);
});

test("independent installations generate different passwords", async t => {
  const a = await fixture(t), b = await fixture(t);
  assert.equal(a.run().status, 0); assert.equal(b.run().status, 0);
  assert.notEqual(await readFile(path.join(a.install, ".server-secrets/password"), "utf8"), await readFile(path.join(b.install, ".server-secrets/password"), "utf8"));
});

for (const phase of ["pull", "up"]) {
  test(`failed ${phase} preserves setup without printing success or password`, async t => {
    const f = await fixture(t, { MOCK_FAIL: phase });
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.ok(!result.stdout.includes("登录密码："));
    assert.ok(!result.stdout.includes("健康检查通过"));
    assert.match(result.stderr, /配置与数据已保留/);
    assert.ok((await stat(path.join(f.install, ".server-secrets/password"))).isFile());
  });
}

for (const overrides of [{ QTERM_PORT: "0" }, { QTERM_PORT: "999999" }, { QTERM_PUBLIC_ORIGIN: "https://example.com/path" }, { QTERM_PUBLIC_ORIGIN: "http://ok\nBAD=value" }, { QTERM_IMAGE: "other/image" }, { MOCK_PLATFORM: "linux/aarch64" }]) {
  test(`invalid settings are rejected before creating files: ${JSON.stringify(overrides)}`, async t => {
    const f = await fixture(t, overrides);
    assert.notEqual(f.run().status, 0);
    await assert.rejects(stat(f.install), { code: "ENOENT" });
  });
}

test("HTTPS overrides and custom backend port are saved independently", async t => {
  const f = await fixture(t, { QTERM_PUBLIC_ORIGIN: "https://terminal.example.com", QTERM_BIND_HOST: "127.0.0.1", QTERM_PORT: "19425" });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const env = await readFile(path.join(f.install, ".env"), "utf8");
  assert.match(env, /QTERM_ALLOW_INSECURE_HTTP=false/);
  assert.match(env, /QTERM_PORT=19425/);
  assert.match(env, /QTERM_BIND_HOST=127.0.0.1/);
  assert.match(result.stdout, /自行配置反向代理/);
});

test("truncated download does not create a deployment", async t => {
  const f = await fixture(t);
  const result = f.run(source.slice(0, source.indexOf("    cat >")));
  assert.notEqual(result.status, 0);
  await assert.rejects(stat(f.install), { code: "ENOENT" });
});

test("default origin uses the detected interface and requested port", async t => {
  const f = await fixture(t, { QTERM_PUBLIC_ORIGIN: "", QTERM_PORT: "1425" });
  await writeFile(path.join(f.root, "bin/ip"), "#!/bin/sh\nprintf '1.1.1.1 via 10.0.0.1 dev eth0 src 10.0.0.20 uid 1000\\n'\n", { mode: 0o755 });
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(await readFile(path.join(f.install, ".env"), "utf8"), /QTERM_PUBLIC_ORIGIN=http:\/\/10\.0\.0\.20:1425/);
});
