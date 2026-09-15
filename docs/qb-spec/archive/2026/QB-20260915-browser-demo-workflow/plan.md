---
schema: 1
id: QB-20260915-browser-demo-workflow
type: feature
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Implementation plan

1. 建立按 target 隔离的 `DemoProject` 内存 owner：worktree、Git index/HEAD、文件修订、变更通知与 reset。让终端 `cat`、`ls`、`git status` 读取它，保持会话输入与日志任务仍归 `DemoTerminalSession`。保护 AC-001、AC-002、AC-003。
2. 将 Demo 的 Files/Git/Network Block 接到现有 Workspace 布局，同时保持原生 Block 在桌面构建中。Browser presentation 只经 typed demo service 读写状态；原生入口禁用条件与 build 映射先于 UI 开放。保护 AC-004。
3. 实现 Files 浏览、预览、编辑与修订保存；用现有文件行、Button、DialogFrame、主题 token，保留空/忙/失败状态和键盘路径。保护 AC-001、AC-003、AC-006。
4. 实现 Git 状态、差异、暂存/取消暂存/提交；所有操作从同一项目状态派生，并使终端结果同步。保护 AC-001、AC-003。
5. 实现明确标注的 Network 虚构规则与非敏感连接入口；浏览器剪贴板失败有反馈，真实浏览器代理保持不可用。保护 AC-005、AC-006。
6. 运行相邻状态与跨面板测试、`pnpm test:demo`、`pnpm check`、`pnpm build:site` 和 `pnpm check:site`；检查 1280、760、390 宽视口、重置/刷新与桌面产物隔离。更新 Demo 说明及 Directory Map 中实际变化的 owner，记录 AC 证据后归档。

## Architecture and growth budget

`src/demo/` 拥有虚构项目规则、模拟 session/service 和 Demo-only presentation；`WorkspaceProvider` 仍唯一拥有布局及 Block runtime，演示项目状态只是模拟后端数据，不复制 UI store。`DemoWorkbench`、`LayoutView`、`FileBrowserPane`、`GitPane` 和 `WorkspaceShell` 等已有 source-size baseline 不承担新规则；优先建立语义化小模块，保持既有入口窄。现有 Tauri IPC DTO、Rust、桌面 workspace 持久化均不改。

## AC to check

| Acceptance | Direct check |
| --- | --- |
| AC-001, AC-002 | 项目状态相邻测试与跨面板 browser smoke |
| AC-003 | 修订冲突、无效 Git mutation 的纯规则测试和 UI 反馈测试 |
| AC-004 | build-selected service contract、`pnpm check`、`pnpm check:site` |
| AC-005 | Network 规则启停与禁用代理的 UI 测试 |
| AC-006 | reset/session 清理测试、键盘与窄视口 browser smoke |

## Completion record

1. `DemoProject` 实现目标隔离的 worktree、修订号、HEAD/index、差异、提交和 reset；演示终端命令与 Files/Git Block 使用同一 owner。
2. `LayoutView` 在浏览器能力分支渲染专用 Demo Block；桌面 Block 路径保持原服务。Files 可浏览／预览／编辑，Git 可查看差异／暂存／取消暂存／提交。
3. Network 和连接入口只接受虚构规则及目标；Network 运行状态和复制反馈均明确标注模拟，手机通过视图选择器在现有 Block 间切换。
4. 已更新 `README.md`、`docs/browser-demo.md`、`docs/qb-spec/DIRECTORY_MAP.md` 与站点文案；验收证据及剩余限制见对应 spec 的 Verification evidence。
5. `pnpm check`、`pnpm test:demo`、`pnpm check:source-size`、`pnpm build`、`pnpm build:site`、`pnpm check:site` 和 `git diff --check` 通过；浏览器人工完成文件到 Git 到终端闭环、虚构目标切换、Network 操作与 1280／760／390 宽度检查。
