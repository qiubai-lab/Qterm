// Run from the repository root. Pass the installed Playwright package path;
// this probe adds no product dependency and only opens an isolated headless page.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const { chromium } = await import(pathToFileURL(resolve(process.argv[2], "index.mjs")));
const { build } = createRequire(realpathSync(resolve(root, "node_modules/vite/package.json")))("esbuild");
const evidence = resolve(root, "docs/qb-spec/evidence/QB-20261025-global-native-overlays");
const css = file => readFileSync(file, "utf8").replace(/@import\s+["']([^"']+)["'];?/g,
  (_, relative) => css(resolve(dirname(file), relative)));
const bundle = await build({ bundle: true, write: false, format: "iife", jsx: "automatic", alias: { "@qterm/services": resolve(root, "src/lib/tauri") }, define: { "process.env.NODE_ENV": '"production"', __QTERM_DEMO__: "false" },
  stdin: { resolveDir: root, sourcefile: "tooltip-probe.tsx", loader: "tsx", contents: `
    import { createRoot } from 'react-dom/client';
    import { ThemedTooltipButton } from './src/components/ThemedTooltipButton';
    import { ThemedTitleTooltipProvider } from './src/components/ThemedTitleTooltipProvider';
    import { WebTabButton } from './src/web/WebTabButton';
    import { ConnectionRouteProgress } from './src/components/ConnectionRouteProgress';
    createRoot(document.getElementById('root')).render(<ThemedTitleTooltipProvider>
      <div className="probe-row">
        <ThemedTooltipButton id="action" tooltip="刷新网页">刷新</ThemedTooltipButton>
        <span id="text" title="完整的文件路径 /srv/project/example.ts">example.ts</span>
        <div className="probe-tab"><WebTabButton id="tab" caption="AstroBot Dashboard" loading={false}/></div>
        <div id="route"><ConnectionRouteProgress progress={{phase:'connected',totalNodes:1,completedNodes:1,activeNode:null,message:'已连接',nodes:[{index:0,name:'HOME-220',endpoint:'192.168.30.220:22',role:'target',state:'complete',stage:null}]}}/></div>
      </div><div className="web-browser-surface"/>
    </ThemedTitleTooltipProvider>);
  ` } });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 360 } });
  await page.setContent(`<style>${css(resolve(root, "src/app/app.css"))}
    body{margin:0;background:var(--canvas);color:var(--text);font:12px Segoe UI}
    .probe-row{display:flex;gap:30px;align-items:center;padding:50px}
    .probe-tab{width:110px}.probe-tab button{width:110px;display:flex;gap:4px;align-items:center}
    .probe-tab span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
    .probe-row button{height:26px;background:var(--raised);color:var(--text);border:1px solid var(--border);border-radius:4px}
    .web-browser-surface{height:200px}
  </style><div id="root"></div><script>${bundle.outputFiles[0].text}</script>`);
  await page.locator("#tab").waitFor();
  const sample = () => page.locator('[role="tooltip"]').evaluate(element => {
    const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
    return { rect: [rect.x, rect.y, rect.width, rect.height], transform: style.transform, translate: style.translate,
      opacity: style.opacity, background: style.backgroundColor, border: style.borderTopColor,
      shadow: style.boxShadow, animation: style.animationName, duration: style.animationDuration, easing: style.animationTimingFunction };
  });
  const stableShell = (frame, open) => {
    for (const index of [0, 2, 3]) assert.ok(Math.abs(frame.rect[index] - open.rect[index]) < .001, "tooltip must not scale or move horizontally");
    for (const key of ["opacity", "background", "border", "shadow"]) assert.equal(frame[key], open[key], `tooltip changes ${key}`);
  };
  const targets = ["#action", "#text", "#tab", "#route .connection-route-node-anchor"];
  for (const native of [true, false]) {
    if (!native) await page.locator(".web-browser-surface").evaluate(element => element.remove());
    for (const theme of ["dark", "light", "cyberpunk"]) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const reducedMotion of ["no-preference", "reduce"]) {
      await page.emulateMedia({ reducedMotion });
      for (const target of targets) {
        await page.locator(target).hover();
        const entering = await sample();
        await page.waitForTimeout(230);
        const open = await sample();
        await page.mouse.move(740, 300);
        const result = { native, theme, reducedMotion, target, entering, open };
        results.push(result);
        stableShell(entering, open);
        if (reducedMotion === "reduce") {
          assert.equal(open.animation, "none");
          assert.deepEqual(entering.rect, open.rect);
        } else {
          assert.ok(Math.abs(entering.rect[1] - open.rect[1]) > .001, "tooltip must retain its entrance animation");
          assert.ok(Math.abs(entering.rect[1] - open.rect[1]) <= 3.01, "entrance is limited to 3px");
          assert.equal(open.animation, "hover-tooltip-in");
          assert.equal(open.duration, "0.13s");
          assert.equal(open.easing, "cubic-bezier(0.16, 1, 0.3, 1)");
        }
        assert.equal(await page.locator('[role="tooltip"]').count(), 0, "pointer leave dismisses immediately like the reference");
      }
    }
  }
  }
  {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const target of targets) {
      await page.locator(target).hover();
      await page.mouse.move(740, 300);
      assert.equal(await page.locator('[role="tooltip"]').count(), 0);
      await page.waitForTimeout(50);
      await page.locator(target).hover();
      await page.waitForTimeout(190);
      assert.equal(await page.locator('[role="tooltip"]').count(), 1, "reentry must not be removed by a stale exit timer");
      await page.mouse.move(740, 300); await page.waitForTimeout(190);
    }
    await page.locator("#tab").hover(); await page.waitForTimeout(230);
    await page.screenshot({ path: resolve(evidence, "tooltip-stable.png") });
  }
  mkdirSync(evidence, { recursive: true });
  writeFileSync(resolve(evidence, "tooltip-motion-after.json"), JSON.stringify(results, null, 2) + "\n");
  console.log(JSON.stringify({ cases: results.length, animatedCases: results.filter(result => result.reducedMotion === "no-preference").length,
    checked: "identical reference motion, unchanged size/material, immediate dismissal, reentry, reduced motion, native/non-native parity" }));
} finally { await browser.close(); }
