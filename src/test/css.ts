// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { readFileSync } from "node:fs";
// @ts-expect-error Vitest runs in Node; the frontend type config intentionally omits Node declarations.
import { dirname, resolve } from "node:path";

export function readCssBundle(entry: string): string {
  return readCssFile(resolve(entry), new Set<string>());
}

function readCssFile(file: string, ancestors: Set<string>): string {
  if (ancestors.has(file)) throw new Error(`Circular CSS import: ${file}`);
  const nextAncestors = new Set(ancestors).add(file);
  return readFileSync(file, "utf8").replace(
    /@import\s+["']([^"']+)["'];?/g,
    (_statement: string, imported: string) => readCssFile(resolve(dirname(file), imported), nextAncestors),
  );
}
