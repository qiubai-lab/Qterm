---
id: QB-20260903-git-remote-path-browser
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git 远程路径浏览入口

## Goal

让用户在 Git Block 选择远程连接但尚未指定仓库路径时，既能精确输入路径，也能通过该连接浏览远程目录后回填路径。

## Scope

- 优化远程路径配置空状态，将路径输入框与“浏览”按钮整合为一个紧凑控件组。
- 浏览时建立 Git 专属的临时 SSH 会话，并复用现有远程仓库目录选择器。
- 选择目录后才持久化远程 Git target；取消浏览或取消配置不写入临时路径。
- 保留最近仓库快捷入口、手动输入、取消和“连接并打开”流程。

## Non-Goals

- 不修改本机仓库选择流程、远程目录选择器的信息架构或后端 Git/SFTP 协议。
- 不让 Git Block 复用 Terminal、Files 或 Network 的 SSH 会话。

## Assumptions And Constraints

- 用户已通过本次请求明确批准上述交互范围。
- `WorkspaceProvider` 继续作为连接 intent 与 Git runtime 的唯一权威；配置组件只拥有草稿和弹窗可见性。
- `LayoutView.tsx` 与其测试是 source-size baseline 热点，不允许增长。

## Requirements

- REQ-001: 未指定远程路径时，路径输入框右侧必须提供可识别、可键盘操作的远程目录浏览按钮，并与输入框呈现为同一控件组。
- REQ-002: 浏览按钮必须通过所选 profile 建立或复用 Git 专属 SSH 会话，并打开现有远程仓库目录选择器；空草稿从远程根目录开始浏览，非空草稿作为初始路径。
- REQ-003: 从选择器确认目录后，所选路径必须成为 Git target，且已为浏览建立的同 profile 会话应继续复用，不重复连接。
- REQ-004: 取消目录选择必须回到路径配置页；取消整个配置必须保留原 Git target。两种取消都不得持久化临时路径，并应清理不再需要的暂存连接。
- REQ-005: 最近仓库选择和手动提交的现有行为保持不变，空路径仍不能提交。

## Behavior Delta

### ADDED

- REQ-001: 远程路径空状态新增输入框与浏览按钮组成的路径控件组。
- REQ-002: 未提交 Git target 前可建立临时 Git 会话浏览远程目录。

### MODIFIED

- REQ-003: 目录选择确认后复用浏览会话并提交所选路径，替代只能手动输入或选择最近仓库的流程。
- REQ-004: 取消路径配置除关闭页面外，还负责恢复连接 intent 并清理临时浏览会话。
- REQ-005: 既有手动与最近仓库入口在新增浏览能力后继续保持原有提交语义。

## Acceptance Criteria

- AC-001 [REQ-001]: 配置页呈现标注为“远程工作目录”的单一 group，其中输入框和“浏览远程目录”按钮相邻共享外框；输入框仍自动聚焦并禁用自动更正/自动大写。
- AC-002 [REQ-002]: 空输入点击浏览会请求所选 profile 的 Git 连接；runtime 连接后自动打开远程选择器，初始路径为 `/`。已有有效草稿时选择器使用该草稿。
- AC-003 [REQ-003]: 在选择器确认路径后只提交一次对应 remote target，关闭配置页和选择器，并且不再次请求认证连接。
- AC-004 [REQ-004]: 关闭选择器返回原配置草稿；取消配置恢复原页面。两者均不调用 target 持久化，并清理仅为暂存 profile 建立的会话。
- AC-005 [REQ-005]: 手动输入与最近仓库仍提交所选 profile/path；纯空白输入时“连接并打开”保持禁用。

## Recommended Approach

将路径配置 presentation 与选择器可见性提取到 `src/git/` 的语义组件；由 workspace Git controller 提供窄的暂存/取消连接 intent 能力，`LayoutView` 只连接组件事件与现有 target 提交流程。

## Embedded Quality Check

- 每条 REQ 均有可观察的 AC 覆盖。
- 临时连接、确认复用和取消清理语义明确，无阻塞性歧义。
- 范围不涉及 schema、公共 API、安全策略或后端协议，standard tier 足够。

## Blockers

- None.

## Verification Evidence

- AC-001: `GitRemoteTargetConfig.test.tsx` 验证可访问 group、自动聚焦和精确输入属性；`gitStyles.test.ts` 验证共享外框、focus-within 与按钮分隔线。
- AC-002: 组件与 `LayoutView` 集成测试验证空草稿先请求所选 profile 的 Git 连接，连接后从 `/` 自动打开现有远程目录选择器；非空草稿作为初始路径。
- AC-003: 集成测试验证选择目录后只提交一次 remote target 且不再次请求连接；controller 测试验证暂存 profile 的已连接 session 可复用。
- AC-004: 组件测试验证关闭选择器保留草稿并触发清理；controller 测试验证 intent 恢复仅在暂存目标发生变化时要求清理，不写持久化 target。
- AC-005: 组件测试验证空白禁用、手动路径 trim 后提交和最近仓库提交语义。
- `pnpm check`: 通过；ESLint、91 个 Vitest 文件共 770 项测试、13 项 Node 测试、TypeScript 与 Vite production build 均通过。
- `pnpm check:source-size`: 通过，0 个 ratchet reminder；未提高任何 baseline。

## Residual Risk

- 未运行 Tauri 桌面打包或真实服务器人工浏览；本次未修改 native dependency、Tauri 配置或远程目录 IPC，风险由现有选择器测试与前端集成测试覆盖。
