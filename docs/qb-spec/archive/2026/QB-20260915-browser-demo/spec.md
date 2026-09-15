---
schema: 1
id: QB-20260915-browser-demo
type: feature
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Browser product demo and Pages site

## Authorization and scope

用户已采纳浏览器 mock、独立站点与 Pages 方案，并要求开始修改。最新约束：macOS 交通灯仅装饰，无窗口行为或全屏，演示窗口浏览器居中，终端随容器重排。
首版完成终端展示闭环；Files/Git/Network 完整 mock 留作后续扩展，入口明确不可用。创建发布工作流但不在本次推送或远端启用 Pages。

## Requirements

- REQ-001: Desktop 和普通 browser dev 保持原行为；仅显式 demo/site 构建选择模拟服务，失败不得降级到 mock。
- REQ-002: 复用 WorkspaceProvider、WorkspaceCanvas、WorkspaceTabs 和 xterm；模拟 local/SSH session 支持独立 cwd、输入编辑、历史、命令、持续日志及取消。关闭与重置清理任务。
- REQ-003: 浏览器居中 macOS 展示窗口，装饰交通灯，不拖动/全屏/关闭浏览器；容器大小变化通过既有 FitAddon 重排行列，保留会话。
- REQ-004: 提供场景、命令提示、主题切换、重置和显式演示限制；不收集真实认证材料，不访问真实机器数据。
- REQ-005: 独立介绍页和 demo/index.html，静态资源兼容 /Qterm/，网站产物与 dist 隔离；Pages 工作流和发布说明完整。

## Behavior Delta

### ADDED
- REQ-001: 显式 build-selected services，原 Tauri 调用保留。
- REQ-002: 有状态、可取消的浏览器终端会话。
- REQ-003: 浏览器独立展示窗口。
- REQ-004: 可重置的虚构场景与浏览器交互。
- REQ-005: 静态产品介绍与 Pages 构建发布入口。

## Boundaries and growth budget

`src/lib/runtime/` 拥有运行环境能力判定；build aliases 将 typed service imports 默认映射到现有 Tauri adapters，仅站点映射到 `src/demo/services/`。Demo shell 只组合真实 workspace 组件；session engine 拥有模拟后端状态，WorkspaceProvider 保持 UI runtime 唯一 owner。高频输出继续走 writer，不进 reducer。原 Rust、IPC DTO、desktop persistence schema、窗口配置不改。热点文件不增行；新模块遵守 source-size 默认限制。

## Acceptance and verification

- AC-001 [REQ-001]: 原环境判定回归、现有前端测试通过；desktop 产物不包含 demo engine/fixtures；demo 不伪造 __TAURI_INTERNALS__。
- AC-002 [REQ-002]: 相邻测试覆盖输入、分块 escape/UTF-8、会话隔离、stream Ctrl+C、close/reset 清理；浏览器验证分屏和工作区切换。
- AC-003 [REQ-003]: 正常与窄视口验证窗口边距、装饰交通灯、xterm 行列变化及内容保持。
- AC-004 [REQ-004]: 示例按钮、重置、主题与远程目标切换可操作；不可用功能不会调用原生 API。
- AC-005 [REQ-005]: pnpm check、build:site 与 /Qterm/ 浏览器烟测通过，介绍/demo 直接访问和刷新不 404，CI 只在指定分支部署。

## Implementation plan

- [x] 建立环境与 build-selected service 边界，保留 desktop tests。
- [x] 实现模拟文件内容、session parser、local/SSH service 与 cleanup tests。
- [x] 组合展示窗口、帮助/场景、真实工作区与主题；隔离未实现能力。
- [x] 添加独立站点多页构建、介绍页、Pages workflow 和操作文档。
- [x] 检查 source-size、完整前端检查、产物隔离与浏览器 smoke；更新目录图并归档。

## Evidence

- Preflight: clean working tree; pnpm check:source-size passed, 0 ratchet reminders.

+- AC-001: `pnpm check` passed (168 Vitest files / 1062 tests, plus 17 Node script tests), including existing WorkspaceProvider, terminal, settings and persistence regressions; build-selected service test verifies native failure remains failure. `pnpm check:site` verified no demo session/host markers or site assets in desktop output.
+- AC-002: `pnpm test:demo` passed (6 files / 14 tests). Covers independent cwd/history, fragmented UTF-8/escape input, real xterm narrow-line rendering, CRLF, streaming completion/cancellation, connection cancellation and reset disposal.
+- AC-003: Production browser checked at 1280×720, 760×700 and 390×844. At 760px, window measured 714px and both xterm surfaces resized to 297px while sessions remained active. Decorative lights are non-focusable spans without handlers. Narrow-page layout had no horizontal overflow.
+- AC-004: Browser exercised build/log/Git-status commands, Ctrl+C, split/new/switch/reset workspaces, all themes, dev→staging mock target switching and terminal search (main: 1/3 matches). No warning/error console entries observed. Native action test verifies disabled in Demo and still enabled in desktop mode.
+- AC-005: `pnpm build:site` and `pnpm check:site` passed; real introduction/demo HTML and all local assets resolved under /Qterm/. Production and Vite development entries both loaded. Introduction screenshots loaded on mobile. Pages YAML parsed and both Vite configs typechecked. Publication is opt-in via QTERM_PAGES_ENABLED; no remote settings, push or deployment performed.
+- `pnpm check:source-size`: passed with 0 ratchet reminders. `git diff --check`: passed. Directory Map and browser operation documentation updated.
+
+## Limits and residual verification
+
+- 首版仅模拟终端与工作区，Files/Git/Network 面板未开放；终端中的 git 命令为静态模拟结果。
+- 原生 Rust/配置未修改；没有运行真实 SSH 或原生桌面打包。本次兼容证据来自现有前端回归、native service contract test 和产物隔离。
+- Vite retains its large-chunk warning (desktop ~1.08 MB, demo ~0.74 MB uncompressed main JS); introduction is static and does not load this runtime. Further native-panel lazy loading is a future optimization, not a blocker for this first demo.
+- 开发中发现长行重绘重复提示符并已修复，用真实 xterm 回归保护；新测试 replaceAll 与 ES2020 的类型不兼容已改为正则替换，最终完整检查通过。
