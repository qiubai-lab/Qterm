// Real Chromium pointers + product layout/components/CSS, with isolated page/IPC fixtures.
// Native HWND coverage is checked separately by native_webview_smoke.
import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const root = process.cwd(), evidence = resolve(root, "docs/qb-spec/evidence/QB-20261025-global-native-overlays");
const { chromium } = await import(pathToFileURL(resolve(process.argv[2], "index.mjs")));
const { build } = createRequire(realpathSync(resolve(root, "node_modules/vite/package.json")))("esbuild");
const css = file => readFileSync(file, "utf8").replace(/@import\s+["']([^"']+)["'];?/g, (_, relative) => css(resolve(dirname(file), relative)));
const guest = '<div style="padding:24px;font:14px Segoe UI;color:#dcf5ef;background:#153e46;height:100%;box-sizing:border-box"><h2>浏览器验证页面</h2><p>拖动期间保留画面，松手恢复原页面。</p><input aria-label="网页草稿" value="草稿保留"/><div style="margin-top:22px;background:#26877c;padding:22px">页面内容 · Qterm fixture</div></div>';
const bundle = await build({ bundle: true, write: false, format: "iife", jsx: "automatic", loader: { ".css": "empty" }, alias: { "@qterm/services": resolve(root, "src/lib/tauri") }, define: { "process.env.NODE_ENV": '"production"', __QTERM_DEMO__: "false" },
  plugins: [{ name: "isolated-fixtures", setup(build) {
    build.onLoad({ filter: /WorkspaceProvider\.tsx$/ }, () => ({ contents: 'export const useWorkspace=()=>window.fixtureWorkspace;', loader: "tsx" }));
    build.onLoad({ filter: /TerminalPanel\.tsx$/ }, () => ({ contents: 'export const TerminalPanel=()=> <pre style={{padding:20}}>本地终端\n拖动标题栏进行分屏</pre>;', loader: "tsx" }));
    build.onLoad({ filter: /WebBrowserPane\.tsx$/ }, () => ({ resolveDir: resolve(root, "src/web"), loader: "tsx", contents: `
      import { useEffect,useRef,useState } from 'react';
      import { registerNativeSurface } from './surface/nativeSurfaceCoordinator';
      export function WebBrowserPane({visible,onMetadata}) {
        const [id]=useState(()=>String(++window.fixtureMounts)), surface=useRef(null), visibility=useRef(visible); visibility.current=visible;
        useEffect(()=>{onMetadata({title:'验证页面',address:'https://fixture/',loading:false});return registerNativeSurface({id,element:surface.current,visible:()=>visibility.current,revision:()=>1,url:()=> 'https://fixture/',snapshotReady:()=>true,onError:console.error});},[]);
        return <><div className="web-address-bar">https://fixture/</div><div ref={surface} className="web-browser-surface"><div className="fixture-native" data-guest={id} style={{height:'100%'}} dangerouslySetInnerHTML={{__html:${JSON.stringify(guest)}}}/></div></>;
      }` }));
    build.onLoad({ filter: /lib[\\/]tauri[\\/]web\.ts$/ }, args => ({ loader: "ts", contents: readFileSync(args.path, "utf8")
      .replace('import { invoke } from "@tauri-apps/api/core";', 'const invoke=(...args)=>window.fixtureInvoke(...args);')
      .replace('import { listen } from "@tauri-apps/api/event";', 'const listen=async()=>()=>{};') }));
  } }], stdin: { resolveDir: root, sourcefile: "layout-probe.tsx", loader: "tsx", contents: `
    import {useState} from 'react'; import {createRoot} from 'react-dom/client';
    import {WorkspaceCanvas} from './src/workspace/LayoutView'; import {workspaceReducer} from './src/workspace/reducer';
    window.fixtureMounts=0; window.fixtureWrites=[]; window.fixtureActions=[];
    window.fixtureInvoke=async(command,args)=>{
      if(command==='web_snapshot') return {url:'https://fixture/',png:window.fixtureSnapshot};
      if(command==='web_sync') { window.fixtureWrites.push(args);const node=document.querySelector('[data-guest="'+args.id+'"]'); if(node){node.style.visibility=args.bounds.covered||!args.bounds.visible?'hidden':'visible';node.style.pointerEvents=args.bounds.inputBlocked?'none':'';} }
    };
    const initial={schemaVersion:10,activeWorkspaceId:'w',recentProfileIds:[],recentGitRepositories:[],workspaces:[{id:'w',name:'W',activeBlockId:'terminal',layout:{type:'split',id:'s',direction:'horizontal',ratio:.4,first:{type:'terminal',blockId:'terminal',profileId:null,restoreDirectory:null},second:{type:'web',blockId:'web',profileId:null}}}]};
    function App(){const [state,setState]=useState(initial); window.resetFixture=()=>{setState(initial);window.fixtureWrites=[];window.fixtureActions=[];};
      const dispatch=action=>{window.fixtureActions.push(action);setState(value=>workspaceReducer(value,action));};
      window.fixtureWorkspace={document:state,profiles:[],runtimes:{},networkRuntimes:{},dispatch,splitTerminalBlock(){},selectBlockTarget(){},clearBlockBuffer(){},disconnectBlock(){},restartLocalBlock(){},selectNetworkTarget(){},disconnectNetworkBlock(){}};
      return <WorkspaceCanvas workspace={state.workspaces[0]} visible onRequestClose={()=>{}} onRequestAuthConnection={()=>{}}/>;}
    createRoot(document.getElementById('root')).render(<App/>);
  ` } });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const preview = await browser.newPage({ viewport: { width: 590, height: 530 } });
  await preview.setContent('<style>html,body{height:100%;margin:0}</style>' + guest);
  const png = (await preview.screenshot()).toString("base64"); await preview.close();
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  page.on('pageerror', error => console.error(error.message));
  await page.route('http://localhost/qterm-fixture', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html></html>' }));
  await page.goto('http://localhost/qterm-fixture');
  await page.setContent(`<style>${["src/app/app.css", "src/web/webBlock.css", "src/web/webTabs.css", "src/web/webTabDeck.css"].map(file => css(resolve(root, file))).join('\n')}html,body,#root{height:100%;margin:0}</style><div id="root"></div>`);
  await page.evaluate(png => { window.fixtureSnapshot = png; window.__TAURI_INTERNALS__ = {}; }, png);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator('[data-guest="1"]').waitFor({ state: 'attached', timeout: 5000 }).catch(async error => {
    console.error(await page.locator('#root').innerHTML()); throw error;
  });
  const targets = { left: [.1, .5], right: [.9, .5], top: [.5, .12], bottom: [.5, .9], center: [.5, .5] };
  for (const theme of ["dark", "light", "cyberpunk"]) for (const [position, [rx, ry]] of Object.entries(targets)) {
    await page.evaluate(theme => { window.resetFixture(); document.documentElement.dataset.theme = theme; }, theme);
    await page.waitForTimeout(80);
    const source = await page.locator('[data-layout-block="terminal"] header').boundingBox();
    const target = await page.locator('[data-layout-block="web"]').boundingBox();
    await page.mouse.move(source.x + 3, source.y + source.height / 2); await page.mouse.down();
    await page.mouse.move(target.x + rx * target.width, target.y + ry * target.height, { steps: 8 });
    await page.locator(`.drop-${position}`).waitFor();
    await page.locator('.web-surface-cover').waitFor();
    await page.waitForFunction(() => window.fixtureWrites.some(write => write.bounds.covered));
    if (position === "top") await page.screenshot({ path: resolve(evidence, `layout-drag-${theme}.png`) });
    assert.equal(await page.evaluate(() => window.fixtureWrites.some(write => write.bounds.visible === false)), false);
    await page.mouse.up(); await page.waitForTimeout(160);
    assert.equal(await page.locator('.web-surface-cover').count(), 0);
    assert.equal(await page.locator('[data-guest="1"] input').inputValue(), '草稿保留');
    assert.equal(await page.evaluate(() => window.fixtureMounts), 1);
    const action = await page.evaluate(() => window.fixtureActions.find(action => action.type === 'moveBlock'));
    assert.equal(action?.position, position); results.push({ theme, position, preservedGuest: true });
  }
  await page.evaluate(() => window.resetFixture()); await page.waitForTimeout(80);
  const bar = await page.locator('.web-tabs').boundingBox();
  await page.mouse.move(bar.x + bar.width - 4, bar.y + bar.height / 2); await page.mouse.down(); await page.mouse.move(100, 300, { steps: 8 });
  await page.locator('.drag-ghost').waitFor(); assert.equal(await page.locator('.drag-ghost').innerText(), '网页');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(160);
  assert.equal(await page.locator('.layout-drag-surface').count(), 0); assert.equal(await page.locator('.web-surface-cover').count(), 0);
  assert.equal(await page.evaluate(() => window.fixtureActions.some(action => action.type === 'moveBlock')), false);
  await page.getByRole('button', { name: '上下分割网页', exact: true }).click();
  assert.equal(await page.locator('[data-layout-block]').count(), 3);
  assert.equal(await page.locator('[data-guest="1"] input').inputValue(), '草稿保留');
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(evidence, 'layout-browser-split.png') });
  writeFileSync(resolve(evidence, 'layout-drag-results.json'), JSON.stringify({ cases: results, browserBlankHeaderDrag: true, escapeRestored: true, browserVerticalSplit: true, nativeIPC: 'fixture; see separate native smoke evidence' }, null, 2) + '\n');
  console.log(JSON.stringify({ cases: results.length, browserBlankHeaderDrag: true, escapeRestored: true, browserVerticalSplit: true }));
} finally { await browser.close(); }
