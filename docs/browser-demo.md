# 浏览器演示与项目站点

## 本地运行

沿用项目 Node 22 和 pnpm 11.0.8。安装依赖后运行：

```sh
pnpm dev:demo
```

默认演示地址为 `http://localhost:1422/Qterm/demo/`，介绍页为 `http://localhost:1422/Qterm/`。`demo/?scene=remote` 初始连接虚构开发服务器；默认场景为模拟本地终端。

验证生产产物：

```sh
pnpm check
pnpm test:demo
pnpm build:site
pnpm check:site
pnpm preview:site
```

预览地址默认 `http://localhost:4173/Qterm/`。`check:site` 检查两个真实 HTML 入口、子路径资源和桌面产物隔离，因此需要先完成桌面前端和站点构建。

## 首版体验范围

- 真实 WorkspaceProvider、WorkspaceCanvas、WorkspaceTabs、xterm 终端、搜索、主题与分屏。
- local/SSH 模拟会话，独立 cwd、输入与历史；上下箭头、光标移动、退格、文本粘贴。
- `help`、`pwd`、`ls`、`cd`、`cat`、`whoami`、`uname`、`echo`、`clear`、`exit`。
- `git status`、`git log`、`npm run build`、`tail -f logs/app.log`。持续日志用 Ctrl+C 停止。
- 窗口随容器尺寸适配；macOS 交通灯只是装饰，不进入焦点序列，无关闭、拖动或全屏逻辑。
- 所有数据只在内存中。刷新/重置恢复初始场景，关闭或重置清理连接和流任务。
- 图片导出通过浏览器下载/剪贴板；剪贴板权限取决于浏览器，失败显示反馈。

Files/Git/Network 面板及凭证管理尚未模拟。相关操作禁用并引导桌面版；`git` 示例只展示预置命令结果。不接受真实服务器配置、不收集密码、不执行真实 Shell，不是完整 POSIX Shell 模拟器。

## 运行时边界

- `vite.config.ts` 默认定义 `__QTERM_DEMO__ = false`，`@qterm/services/*` 指向原 `src/lib/tauri/*`。
- `vite.site.config.ts` 显式定义 Demo，选择 `src/demo/services/` 中的对应 typed adapters。每个 adapter 用原服务函数类型约束签名。
- `src/lib/runtime/environment.ts` 区分可用 workspace runtime 与真实 Tauri host，绝不伪造 `__TAURI_INTERNALS__`，不在 IPC 失败后降级。
- `src/demo/terminalSession.ts` 拥有单个模拟会话；`sessionRegistry.ts` 拥有模拟连接进度与销毁；`fixtures.ts`、`shellCommands.ts` 提供虚构数据与有限命令。
- `src/demo/DemoWorkbench.tsx` 仅组合工作区组件和展示控制，桌面 WorkspaceShell 保持独立。
- 高频字节继续走现有 writer，session、buffer 和任务不进入 reducer/持久化。
- 站点资源位于 `site/public/`，输出 `dist-site/`；原 Tauri 始终读取 `dist/`。普通 `pnpm dev` 不启用 mock。

添加新功能时：先定义对应模拟服务的正常、失败与清理行为，接入构建映射及测试，再开放 UI 能力。不要仅取消禁用，让调用落到原生 IPC。

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

用生产预览验证 `/Qterm/`、`/Qterm/demo/` 与远程场景的直接打开和刷新。检查示例命令、Ctrl+C、分屏、工作区切换/关闭、目标切换、搜索、三套主题、重置、长命令换行，以及 1280×720、760×700、390×844 视口。确认交通灯不可聚焦、无原生错误，浏览器大小变化后原会话和输出保留。
