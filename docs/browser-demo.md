# 浏览器演示与项目站点

## 本地运行

沿用项目 Node 22 和 pnpm 11.0.8。安装依赖后运行：

```sh
pnpm dev:demo
```

默认演示地址为 `http://localhost:1422/Qterm/demo/`，介绍页为 `http://localhost:1422/Qterm/`。默认自动连接虚构开发服务器并启用赛博主题；`demo/?scene=local` 可显式打开模拟本地终端。

验证生产产物：

```sh
pnpm check
pnpm test:demo
pnpm build:site
pnpm check:site
pnpm preview:site
```

预览地址默认 `http://localhost:4173/Qterm/`。`check:site` 检查两个真实 HTML 入口、子路径资源和桌面产物隔离，因此需要先完成桌面前端和站点构建。

## 当前体验范围

- 真实 WorkspaceProvider、WorkspaceCanvas、WorkspaceTabs、xterm 终端、搜索、主题与分屏。
- local/SSH 模拟会话，独立 cwd、输入与历史；上下箭头、光标移动、退格、文本粘贴。
- 新终端仅显示简短标题，输入 `help` 查看命令。支持 `help`、`pwd`、`ls`、`cd`、`cat`、`whoami`、`uname`、`echo`、`clear`、`exit`。
- `git status`、`git log`、`npm run build`、`tail -f logs/app.log`。持续日志用 Ctrl+C 停止。
- 从终端标题栏打开虚构 Files/Git/Network Block。右侧复用桌面工具栏：文件、网络、Git、打开终端接入现有 mock，其余五项禁用并悬停提示“暂未开放演示”。Files 可浏览与保存预置文本，Git 可查看由文件修改产生的差异、暂存、取消暂存和提交；同一目标的终端命令与面板共享结果。不同虚构目标的数据隔离。
- Network 默认提供开发服务本地转发、远程预览转发及 SOCKS5 三条停止的规则，可编辑、删除和模拟启停，显示虚构地址；不建立真实隧道或代理。连接入口展示虚构目标，目标切换只由 Block 左上角发起。
- 简洁站点顶栏、居中的深色/浅色/赛博三选项及大工作台；外层页面保持固定样式，仅内嵌工作台切换主题；恢复 macOS 交通灯装饰，选中背景滑动，支持方向键和减少动态效果偏好。手机可用视图选择器切换 Block。
- 所有数据只在内存中。刷新恢复初始场景和网络种子，关闭清理连接和流任务。
- 图片导出通过浏览器下载/剪贴板；剪贴板权限取决于浏览器，失败显示反馈。

Files 的创建、复制、重命名、删除、图片读取、上传下载，以及 Git 历史文件检查、分支、同步、合并和冲突处理尚未模拟，调用时显示明确限制。文本预览、Markdown 渲染、搜索、编辑、保存确认与未保存保护使用产品原组件。真实 Network 转发与凭证库尚未模拟。Network 启动仅改变页面内的演示状态，不代表端口监听成功。连接入口只展示两台预置虚构服务器。不接受真实服务器配置、不收集密码、不执行真实 Shell，不是完整 POSIX Shell 模拟器。

## 运行时边界

- `vite.config.ts` 默认定义 `__QTERM_DEMO__ = false`，`@qterm/services/*` 指向原 `src/lib/tauri/*`。
- `vite.site.config.ts` 显式定义 Demo，选择 `src/demo/services/` 中的对应 typed adapters。每个 adapter 用原服务函数类型约束签名；缺少浏览器 adapter 时构建失败，不回退到原生服务。
- `src/lib/runtime/environment.ts` 区分可用 workspace runtime 与真实 Tauri host，绝不伪造 `__TAURI_INTERNALS__`，不在 IPC 失败后降级。
- `src/demo/demoProject.ts` 是按目标隔离的模拟文件和 Git 后端状态；`terminalSession.ts` 拥有单个模拟会话；`sessionRegistry.ts` 拥有模拟连接进度与销毁；`fixtures.ts`、`shellCommands.ts` 提供初始数据与有限命令。
- `src/demo/DemoWorkbench.tsx` 只组合站点外壳、场景入口和虚构连接。两端通过同一 LayoutView 使用 FileBrowserPane/FilePreviewDocument/CodeEditor、GitPane 和 NetworkPane，没有独立 Demo 功能页面。
- `src/demo/featureSessions.ts` 拥有 Files/Git/Network 虚构后端连接，`demoGitAdapter.ts` 将项目状态映射为产品 Git 快照；`services/files|git|network|transfers|fileDrop|browserProxy` 适配统一服务。
- `src/lib/tauri/fileDrop.ts` 隔离原生 WebView 拖放订阅，浏览器实现不订阅原生事件；文件编辑器、Markdown 和 Network 使用统一剪贴板服务。
- 高频字节继续走现有 writer，session、buffer 和任务不进入 reducer/持久化。
- 站点资源位于 `site/public/`，输出 `dist-site/`；原 Tauri 始终读取 `dist/`。普通 `pnpm dev` 不启用 mock。

添加新功能时：先定义对应模拟数据的正常、失败与清理行为，接入构建隔离及测试，再开放 UI 能力。不要仅取消禁用，让调用落到原生 IPC。

## GitHub Pages 发布

工作流 `.github/workflows/site.yml` 对 main 推送、指向 main 的 PR 和手动触发运行站点验证。发布默认未启用，不会改动现有桌面 Release 流程。

准备正式发布时：

1. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
2. 确认 `github-pages` environment 只允许 main 发布。
3. 在 Settings → Secrets and variables → Actions → Variables 新建 `QTERM_PAGES_ENABLED`，值为 `true`。
4. 在 main 上手动运行 Product site，或通过后续 main 推送发布。

默认地址为 `https://qiubai-lab.github.io/Qterm/`。构建 base 默认为 `/Qterm/`。改仓库名或使用自定义域名时，配置 Actions variable `QTERM_SITE_BASE`（例如 `/`）；同时更新 `site/index.html` 中绝对分享图片 URL，并配置 Pages 域名。默认构建没有设置 canonical，避免本地/fork 指向错误域名。

本地可用 `QTERM_SITE_BASE=/ pnpm build:site` 验证根路径；预览与 `check:site` 使用相同环境变量。不要把 Pages 的 base 或 outDir 写入桌面配置。

站点首页只加载静态 HTML/CSS 与图片，交互终端在 demo 页面加载。更新产品截图时同步更新 `site/public/qterm-social.png` 和 HTML 图片宽高。没有 Service Worker 或后端服务。

发布回退：在 main 上恢复站点变更并重跑工作流；需要暂停发布时将 `QTERM_PAGES_ENABLED` 设为 `false`。这不会删除已经发布的页面。

## 人工浏览器验收

用生产预览验证 `/Qterm/`、`/Qterm/demo/` 与远程场景的直接打开和刷新。检查终端命令、Ctrl+C、分屏、工作区切换/关闭、目标切换、搜索、三套主题、刷新恢复、长命令换行，以及 1280×720、760×700、390×844 视口。确认默认开发连接和三条网络规则、主题选项键盘切换、无原生错误，浏览器大小变化后原会话和输出保留。

## 使用引导

首次访问在工作区就绪后展示可跳过引导，展示即记录，不随站点更新重复出现。页面底部的“重新引导”可随时重看，完成后短暂高亮。该记录单独存于浏览器本地存储，刷新 mock 项目不会清除；清除浏览器站点数据会恢复首次状态。手机隐藏的工具栏步骤保留说明和终端标题栏入口提示。

应用端使用同一引导控制器和内容，在本机 WebView 保存独立记录。最后一步提示“关于”中的重看入口，点击“完成”结束，在关于弹窗内通过“使用引导”重新开始。无安装事件探测：已有安装第一次运行包含引导的新版本也会展示一次，此后升级不再自动展示。

引导欢迎页在画布居中，后续气泡随锚点滑动并避让窗口边缘；终端分别介绍连接选择和标题栏操作按钮。普通高亮采用内缩 2px 的 1px 完整描边与轻透明填色；工作区仅框选实际标签及新建按钮，按标签高度上下各留 3px、左侧外扩 4px，不修改实际控件样式。关于弹窗的重看入口位于 header 右侧。

工具引导顺序为文件、网络、Git。气泡跟随当前工作台主题；赛博主题使用黄色强调标题、边框和主按钮。
