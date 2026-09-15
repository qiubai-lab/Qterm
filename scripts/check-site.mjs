import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const site = path.resolve("dist-site");
const desktop = path.resolve("dist");
const base = process.env.QTERM_SITE_BASE || "/Qterm/";
if (!base.startsWith("/") || !base.endsWith("/")) throw new Error("QTERM_SITE_BASE must start and end with /.");

for (const name of ["index.html", "demo/index.html"]) {
  const html = await readFile(path.join(site, name), "utf8");
  for (const [, reference] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(?:https?:|#|mailto:)/.test(reference)) continue;
    const pathname = new URL(reference, `https://demo.test${base}${name}`).pathname;
    if (!pathname.startsWith(base)) throw new Error(`${name} escapes site base: ${reference}`);
    let local = decodeURIComponent(pathname.slice(base.length));
    if (!local || local.endsWith("/")) local += "index.html";
    await access(path.join(site, local)).catch(() => { throw new Error(`${name} has missing resource: ${reference}`); });
  }
  if (name === "index.html" && /<script[^>]+type="module"/.test(html)) throw new Error("The introduction must not load the terminal runtime.");
}

async function files(directory) {
  return (await Promise.all((await readdir(directory, { withFileTypes: true })).map(async entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  }))).flat();
}

// Check the real desktop artifact, not a source-level assumption about tree shaking.
for (const file of await files(desktop)) {
  if (file.endsWith(".js")) {
    const source = await readFile(file, "utf8");
    if (["demo-session-", "dev.example.test", "这是虚构环境"].some(marker => source.includes(marker))) throw new Error(`Demo runtime leaked into desktop: ${file}`);
  }
  if (/qterm-(social|icon)\.png$/.test(file)) throw new Error(`Site-only asset leaked into desktop: ${file}`);
}
console.log(`Site links and assets verified under ${base}; desktop/demo artifacts are isolated.`);
