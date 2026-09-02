import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const DEFAULT_LIMITS = Object.freeze({
  ".css": 450,
  ".mjs": 400,
  ".rs": 700,
  ".ts": 500,
  ".tsx": 450,
  test: 800,
});

const DEFAULT_ROOTS = ["src", "src-tauri/src", "scripts"];
const DEFAULT_BASELINE = "scripts/source-size-baseline.json";
const TEST_FILE = /(?:\.test\.[^.]+|[\\/]tests?\.rs|[\\/]tests[\\/])/;

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

export function sourceLineCount(content) {
  if (content.length === 0) return 0;
  return content.split(/\r\n|\n|\r/).length;
}

async function sourceFiles(root, limits) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(absolute, limits));
    } else if (Object.hasOwn(limits, path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

export async function auditSourceSizes({
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
  baselinePath = DEFAULT_BASELINE,
  limits = DEFAULT_LIMITS,
} = {}) {
  const baselineFile = path.resolve(cwd, baselinePath);
  const baselineDocument = JSON.parse(await readFile(baselineFile, "utf8"));
  const baseline = baselineDocument.limits ?? {};
  const files = [];
  for (const root of roots) {
    files.push(...await sourceFiles(path.resolve(cwd, root), limits));
  }

  const findings = [];
  const seen = new Set();
  for (const file of files.sort()) {
    const relative = normalizePath(path.relative(cwd, file));
    const extension = path.extname(relative);
    const defaultLimit = TEST_FILE.test(relative) ? limits.test : limits[extension];
    const allowed = baseline[relative] ?? defaultLimit;
    const actual = sourceLineCount(await readFile(file, "utf8"));
    seen.add(relative);
    if (actual > allowed) {
      findings.push({ type: "oversize", file: relative, actual, allowed, defaultLimit });
    } else if (baseline[relative] !== undefined && actual < allowed) {
      findings.push({ type: "ratchet", file: relative, actual, allowed, defaultLimit });
    }
  }

  for (const file of Object.keys(baseline).sort()) {
    if (!seen.has(file)) findings.push({ type: "stale", file, allowed: baseline[file] });
  }
  return findings;
}

export function formatFindings(findings) {
  return findings.map((finding) => {
    if (finding.type === "oversize") {
      const direction = finding.allowed === finding.defaultLimit
        ? "split the new source file by responsibility"
        : "do not grow this baseline hotspot; split it or restore its previous size";
      return `ERROR ${finding.file}: actual=${finding.actual}, limit=${finding.allowed}; ${direction}`;
    }
    if (finding.type === "stale") {
      return `ERROR ${finding.file}: baseline entry has no matching source file; remove or move the entry`;
    }
    return `RATCHET ${finding.file}: actual=${finding.actual}, baseline=${finding.allowed}; lower or remove its baseline entry`;
  }).join("\n");
}

async function main() {
  const findings = await auditSourceSizes();
  if (findings.length > 0) console.log(formatFindings(findings));
  const failures = findings.filter(({ type }) => type !== "ratchet");
  if (failures.length > 0) process.exitCode = 1;
  else console.log(`Source-size check passed (${findings.length} ratchet reminder${findings.length === 1 ? "" : "s"}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
