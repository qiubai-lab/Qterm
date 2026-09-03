---
id: QB-20260903-git-remote-picker-readiness
type: bugfix
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Git 远程目录选择器就绪与路径视觉修复

## Observed Behavior

- 远程路径输入框的文字虽然位于对称行盒中，但 SFMono 可见字形仍明显偏下。
- 新建远程 Git target 时点击“浏览”，选择器可能在 Git session 尚未进入 connected 状态时首次读取，显示“远程 Git 尚未连接”；连接稳定后点击刷新才成功。
- 空路径浏览当前从 `/` 开始，而不是远程登录用户的默认目录。

## Expected Behavior

- 路径文字在 32px 组合控件内视觉上下居中。
- 选择器只在 Git-purpose session 同时具有 sessionId 且状态为 connected 后挂载并执行首次读取。
- 未指定路径时使用远端默认目录语义 `.`，由服务端 canonicalize 为实际目录。

## Root Cause

- 对称 padding 只居中了 CSS 行盒，没有补偿 SFMono 字形相对基线约 2px 的视觉下沉。
- `GitRemoteTargetConfig` 的选择器挂载条件仅检查 `sessionId`；`connectGitBlock` 可以在 connected 事件到达前先写入 sessionId，产生首次读取竞态。
- 空草稿 fallback 被硬编码为 `/`。

## Requirements

- REQ-001: 路径输入字形必须在现有 32px 组合控件内视觉上下居中，不改变控件总高度、焦点边界或精确文本输入属性。
- REQ-002: 远程选择器必须等到 connectionStatus 为 connected 且 sessionId 存在时才挂载；connecting/closing/closed/failed 状态不得提前读取目录。
- REQ-003: 空白路径浏览必须以 `.` 作为远端默认目录输入；非空草稿继续原样作为初始路径。
- REQ-004: 浏览按钮、取消、确认和已连接 session 复用行为保持不变，不新增 IPC 或持久化字段。

## Behavior Delta

### MODIFIED

- REQ-001: 输入文字从数学行盒居中改为针对实际等宽字体基线的光学居中。
- REQ-002: 选择器从 sessionId 到达即挂载改为等待完整 connected 就绪条件。
- REQ-003: 空草稿初始目录从 `/` 改为远端默认目录 `.`。
- REQ-004: 其余远程 target 交互与会话隔离保持兼容。

## Acceptance Criteria

- AC-001 [REQ-001]: 样式使用 30px 输入盒、16px 内容行高以及上 5px/下 9px 的明确光学校正；控件组仍为 32px。
- AC-002 [REQ-002]: 浏览请求后即使 sessionId 已出现，只要状态仍为 connecting 就不渲染选择器；状态变为 connected 后自动渲染且只触发就绪后的首次读取。
- AC-003 [REQ-003]: 空白草稿打开选择器时 initialPath 为 `.`；`/srv/project` 等非空草稿保持原值。
- AC-004 [REQ-004]: 聚焦组件测试继续覆盖确认目录、取消浏览、手动路径、最近仓库与精确输入属性。

## Invariants

- Git、Terminal、Files、Network session 继续隔离。
- presentation 不直接调用 Tauri IPC，不复制 workspace runtime 状态。
- 不改动远程目录选择器或 backend 的 canonicalize 协议。

## Embedded Quality Check

- 所有 REQ 均有 AC 覆盖，竞态、默认路径和视觉验收可自动验证。
- 变更局限于现有 Git presentation 与样式，无安全、schema、公共 API 或部署风险；standard tier 合适。

## Blockers

- None.

## Verification Evidence

- AC-001: `gitStyles.test.ts` 验证组合控件仍为 32px，输入使用 30px 盒、16px 行高和 `5px 8px 9px` 光学校正。
- AC-002: `GitRemoteTargetConfig.test.tsx` 验证 connecting + sessionId 时选择器不挂载，connected 后自动挂载。
- AC-003: 组件与 LayoutView 集成测试验证空草稿 initialPath 为 `.`，非空草稿保持原值。
- AC-004: `GitRemoteTargetConfig.test.tsx` 全部 6 项通过；与 LayoutView、样式测试合计 81 项聚焦回归通过。
- `pnpm check:source-size`: 通过，0 个 ratchet reminder。
- `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm build`: 通过。
- `pnpm test`: 769/770 项通过；唯一失败为既有 `GitPane.submodules.test.tsx` 的“记录版本已变化”断言，单独复跑同样失败，与本次仅涉及 remote target 配置挂载条件和 CSS 的改动无交集。

## Residual Risk

- 尚未在真实 SSH 服务器上执行人工目录浏览；竞态由组件级状态转换测试覆盖，默认 `.` 语义复用现有 SFTP canonicalize 路径。
- 仓库仍存在上述 Submodule 测试失败，需要在独立范围内修复其 snapshot/mock 或展示行为。
