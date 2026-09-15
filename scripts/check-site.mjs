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

const demoCode = (await Promise.all((await files(site)).filter(file => file.endsWith(".js")).map(file => readFile(file, "utf8")))).join("\n");
for (const marker of ["file-preview-document", "file-browser-navigation", "git-repository", "network-pane"]) {
  if (!demoCode.includes(marker)) throw new Error(`Shared product panel missing from demo: ${marker}`);
}
for (const marker of ["demo-files-body", "demo-git-body", "demo-network-body", "files_read_text", "files_session_connect", "git_snapshot", "git_remote_execute", "network_rule_start", "network_rule_list", "transfer_select_upload_files", "browser_proxy_launch", "plugin:clipboard-manager|read_text", "plugin:clipboard-manager|write_text"]) {
  if (demoCode.includes(marker)) throw new Error(`Forked demo panel or native service leaked into site: ${marker}`);
}
console.log("Demo uses shared product panels with browser service boundaries.");
