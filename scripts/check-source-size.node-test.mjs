import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { auditSourceSizes, formatFindings } from "./check-source-size.mjs";

async function fixture(files, baseline = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "qterm-source-size-"));
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "scripts"), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await writeFile(path.join(root, "scripts/source-size-baseline.json"), JSON.stringify({ version: 1, limits: baseline }));
  return root;
}

test("accepts source files within their default limit", async (t) => {
  const root = await fixture({ "src/small.tsx": "export const value = 1;\n" });
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await auditSourceSizes({ cwd: root, roots: ["src"] }), []);
});

test("rejects a new oversized file with an actionable diagnostic", async (t) => {
  const root = await fixture({ "src/large.tsx": `${"x\n".repeat(450)}x` });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = await auditSourceSizes({ cwd: root, roots: ["src"] });
  assert.equal(findings[0]?.type, "oversize");
  assert.match(formatFindings(findings), /src\/large\.tsx: actual=451, limit=450/);
  assert.match(formatFindings(findings), /split the new source file by responsibility/);
});

test("prevents baseline growth and reports a lowered ratchet", async (t) => {
  const root = await fixture({ "src/hotspot.rs": `${"x\n".repeat(710)}x` }, { "src/hotspot.rs": 705 });
  t.after(() => rm(root, { recursive: true, force: true }));
  let findings = await auditSourceSizes({ cwd: root, roots: ["src"] });
  assert.equal(findings[0]?.type, "oversize");
  assert.match(formatFindings(findings), /do not grow this baseline hotspot/);

  await writeFile(path.join(root, "src/hotspot.rs"), `${"x\n".repeat(699)}x`);
  findings = await auditSourceSizes({ cwd: root, roots: ["src"] });
  assert.equal(findings[0]?.type, "ratchet");
  assert.match(formatFindings(findings), /lower or remove its baseline entry/);
});

test("rejects stale baseline entries", async (t) => {
  const root = await fixture({}, { "src/missing.rs": 900 });
  t.after(() => rm(root, { recursive: true, force: true }));
  const findings = await auditSourceSizes({ cwd: root, roots: ["src"] });
  assert.equal(findings[0]?.type, "stale");
  assert.match(formatFindings(findings), /no matching source file/);
});
