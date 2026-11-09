import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { siteConfig } from "./site/seo.mjs";
import { verifySite } from "./site/verify.mjs";

const site = path.resolve("dist-site");
const desktop = path.resolve("dist");
const config = siteConfig();
const base = config.base;
await verifySite(site, config);

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
