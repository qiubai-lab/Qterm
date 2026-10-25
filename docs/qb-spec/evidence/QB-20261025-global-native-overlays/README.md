# 原生覆盖验证证据

2026-10-25，在 Windows 的独立 WebView2 smoke fixture 中产生。使用两个本机 SOCKS fixture、独立浏览器目录和虚构页面，不访问用户的 SSH 页面或现有 profile。

- `guest-preview.png`：通过实际 WebView2 CapturePreview 取得的网页。
- `modal-host.png`：宿主放入该预览并绘制模态遮罩后的截图。宿主截图不包含原生 child HWND，因此测试同时断言 guest 的 region 为 NULLREGION、窗口禁用、键盘焦点离开 guest、WebView2 controller 仍可见；不能单凭截图推导输入已阻断。
- 还断言覆盖中可以再次截取，恢复后 URL 相同、窗口重新启用且 region 恢复；同一焦点下两次固定交互通知可达，禁用后通知被拒绝。既有代理、profile 隔离、网页 IPC 拒绝及裁剪/原生描边用例继续运行。

复验（需交互式 Windows 桌面和 WebView2 Runtime）：

```powershell
cargo test native_webview_smoke --manifest-path src-tauri/Cargo.toml -- --ignored --nocapture --test-threads=1
```

这些图片用于验证原生桥接机制，不是用户完整工作区的截图。多显示器 DPI 切换、实体触摸/滚轮和逐帧录屏尚未实机验收；几何/抗锯齿的多倍率覆盖来自自动化计算与 raster 测试。

## Hover 动画回归与全局统一

同日用户反馈移出时抖动，并指定截图中连接状态节点气泡作为全局 hover 动画参照。本轮只修改前端动效与生命周期，没有改变原生窗口逻辑。

- `tooltip-motion-before.json`：修复前真实 Chromium 测量。普通动态效果下，移出把 `matrix(1,0,0,1,0,0)` 直接切成 `matrix(.97,0,0,.97,0,-4)`，透明度仍为 1；18 组中的 9 组发生瞬间跳位和缩小，另 9 组减少动态效果未触发。
- `tooltip-motion-after.json`：最终 48 组真实 React/Chromium 验证。按钮、文本、网页标签、实际 ConnectionRouteProgress 参照节点 × 三主题 × 两种动态效果设置 × 有/无原生 surface。24 组普通动效使用相同的 130ms、3px、`cubic-bezier(.16,1,.3,1)` 入场，尺寸/材质不变；移出立即卸载，重新移入重新入场，没有旧计时器删除新气泡。24 组减少动态效果无位移。
- `tooltip-stable.png`：隔离测试页的气泡打开态，仅展示外观；动画结论来自逐阶段计算样式与尺寸断言。
- `tooltip-motion-probe.mjs`：读取实际产品组件/CSS，使用安装好的 Playwright + Edge headless 复验，不添加产品依赖、不访问用户页面。

```powershell
node docs/qb-spec/evidence/QB-20261025-global-native-overlays/tooltip-motion-probe.mjs <Playwright包目录>
```

本机验证使用 Codex 提供的 `C:/Users/Test/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`。移出行为以用户指定参照为准：保留入场动画，移出立即收起，不再使用之前 160ms 的缩放退场，也不采用中间尝试的静止延迟消失方案。

最终前端门禁：`$env:VITEST_MAX_WORKERS='4'; pnpm check` 通过，1310 项 Vitest 测试通过、2 项跳过，21 项 Node 脚本测试通过；ESLint、TypeScript、生产构建与源码体积门禁均通过。本节动效验证使用隔离 Chromium 页面，不等同于原生窗口逐帧录屏或多显示器验收。


## 工作区拖放与浏览器分屏

2026-10-25，修复遗漏的 `visible && !drag` 隐藏路径，工作区拖拽转入公共 transition 快照桥接。所有 Block 共用布局几何命中与落点高亮；浏览器支持左右/上下新建同连接空白窗口，网页标签栏空白处显式转发 Portal 指针事件以移动整个 Block。取消不提交布局，旧页面实例保持。

- `layout-drag-results.json`：真实 Edge/Chromium 指针驱动产品 WorkspaceCanvas、WebBlock、WebTabs 和公共协调器；三主题 × 五个落点，共 15 组，保持页面实例和表单草稿，拖拽期间 IPC 无 visible=false；另验证浏览器标签栏空白拖动、Escape 恢复、上下分屏。
- `layout-drag-dark.png`、`layout-drag-light.png`、`layout-drag-cyberpunk.png`：隔离 fixture 拖拽预览与落点提示。
- `layout-browser-split.png`：上下分屏后的两个浏览器 Block。示例网页为合成 fixture，不是用户页面。
- `layout-drag-probe.mjs`：可复验脚本，IPC 与网页内容用隔离 fixture；它不证明 HWND 层的鼠标捕获。真实 Windows bridge 由同日再次通过的 `native_webview_smoke` 覆盖：截图解码、输入禁用、空 region、controller 可见、原 URL 恢复及同实例生命周期。

```powershell
node docs/qb-spec/evidence/QB-20261025-global-native-overlays/layout-drag-probe.mjs C:/Users/Test/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright
```

最终验证：`pnpm check` 通过（230 文件通过、1 文件跳过；1359 项测试通过、2 项跳过；21 项 Node 脚本、ESLint、TypeScript、Vite build 通过）。Portal 显式转发的最终补充由 5 文件、37 项定向测试、最终 ESLint/源码门禁及上面真实浏览器脚本验证。全量测试期间当前 checkout 含其他任务的独立测试，不将全部测试数量归因于本修复。Vitest 出现一次退出等待提示但命令最终 exit 0；Vite 保留已有大 chunk 提示。

本轮不改 Rust 实现/安装配置，没有重打安装包。跨显示器 DPI、实体触摸及完整应用原生拖拽逐帧录屏仍未覆盖。
