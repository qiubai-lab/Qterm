---
id: QB-20260828-terminal-cwd-shell-integration
type: feature
tier: standard
status: archived
created: 2026-08-28
updated: 2026-08-28
supersedes: []
---

# Terminal CWD Shell Integration

## Goal

从 Terminal Block 打开 Files Block 时，优先使用终端 Shell 实时上报的当前工作目录；无法确认实时目录时，不再把远程 home 或本地启动目录伪装成“当前目录”，并提供显式、非持久化的 Shell 集成入口。

## Scope

- 为 Terminal runtime 区分 OSC 7 实时目录与会话启动目录。
- 保留 xterm OSC 7 解析作为当前目录的事实来源。
- 在路径未实时确认时，通过紧凑对话框提供 Bash、Zsh、Fish 与 PowerShell 当前会话集成命令。
- 用户可明确选择从本地启动目录或远程主目录继续打开 Files Block。
- 保持 Files Block 的 profile/path 初始化语义与独立 SFTP 会话边界。

## Non-Goals

- 不自动向本地或远程终端注入命令。
- 不修改用户的 shell rc 文件或连接 profile schema。
- 不通过解析 `cd`、终端提示符或用户输入推断目录。
- 不让已打开的 Files Block 持续绑定来源 Terminal Block。

## Assumptions And Constraints

- 用户已批准采用 OSC 7 主方案。
- 当前会话集成命令只影响用户主动粘贴并执行的 Shell 会话，关闭 Shell 后失效。
- 路径提示和集成入口继续位于 Terminal Block 标题栏文件夹按钮的交互链路。

## Requirements

- REQ-001：收到合法 OSC 7 file URI 后，Terminal runtime 必须记录该绝对路径并标记为实时 Shell 上报目录。
- REQ-002：尚未收到 OSC 7 时，本地启动目录和远程 home 回退必须被明确标识，不得在按钮文案中称为当前目录。
- REQ-003：路径未实时确认时，用户必须能够复制 Bash、Zsh、Fish 或 PowerShell 的当前会话集成命令，且 Qterm 不自动执行命令或写入配置文件。
- REQ-004：用户必须能够跳过集成，从本地启动目录或远程主目录创建 Files Block；已确认实时目录时保持单击直接打开。
- REQ-005：Files Block 继续只接收创建时的 profile/path 快照，并拥有独立运行时会话。

## Acceptance

- AC-001 [REQ-001]：TerminalPanel 收到合法 OSC 7 后，Workspace runtime 保存路径和 `osc7` 来源；非法 URI 不更新 runtime。
- AC-002 [REQ-002, REQ-004]：本地初始目录显示为启动目录回退，远程未上报目录显示为远程主目录回退，二者点击均先出现说明而不是直接宣称打开当前目录。
- AC-003 [REQ-003]：路径说明对话框可在四类 Shell 间切换、复制对应命令、反馈复制失败，且文案明确命令不会自动执行或持久化。
- AC-004 [REQ-004, REQ-005]：用户确认回退后，local 使用实际启动目录，remote 使用 `.`，dispatch 仍只携带来源 profile 与路径快照；OSC 7 路径保持直接 dispatch。
- AC-005 [REQ-001, REQ-002]：本地 PTY 返回的初始 cwd 标记为 `initial`，远程连接不再预填 `.` 为已知 cwd。

## Behavior Delta

### ADDED

- REQ-003：新增显式、仅当前会话生效的 Shell 集成命令入口。

### MODIFIED

- REQ-001：终端当前目录从无来源字符串改为带来源的 runtime 状态。
- REQ-002：未收到 OSC 7 时不再把启动目录或 home 回退显示成实时当前目录。
- REQ-004：未知/初始路径点击先说明再回退；实时路径仍直接打开。

## Quality Check

- REQ 与 AC 已闭合；不涉及认证、持久化 schema、公共 API 或安全边界升级。
- 正常路径、未知路径、复制失败与显式回退均有可观察验收。
- Files 独立会话与不自动执行命令作为不变量保留。

## Open Issues

- 无阻塞项。Shell 命令执行效果依赖用户当前 Shell；本次通过纯命令映射与 UI 行为测试保护，不远程修改或探测用户环境。

## Verification Evidence

- AC-001：`TerminalPanel.test.tsx` 与 `WorkspaceProvider.test.tsx` 验证合法 OSC 7 更新 `cwdSource=osc7`，非法 URI 不提交。
- AC-002：`LayoutView.test.tsx` 验证本地启动目录与远程 home 使用明确回退标题及说明对话框。
- AC-003：`shellIntegration.test.ts` 与 `TerminalCwdDialog.test.tsx` 验证四类命令映射、Shell 切换、复制成功/失败和不自动执行说明。
- AC-004：`LayoutView.test.tsx` 验证 OSC 7 直开、本地启动目录与远程 `.` 的显式回退 dispatch。
- AC-005：`WorkspaceProvider.test.tsx` 验证 local `initial` 来源、OSC 7 覆盖及 remote 未知 cwd。
- 聚焦测试：6 个文件、128 项通过。
- 完整前端测试：61 个文件、487 项通过。
- `pnpm lint`、`pnpm build` 与 `git diff --check` 通过。
- PowerShell 集成命令通过 parser 静态语法检查；当前环境没有 Bash/Zsh/Fish 可执行文件，相关命令未做真实 Shell 运行验证。
