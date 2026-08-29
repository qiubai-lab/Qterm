---
id: QB-20260829-contextual-utility-file-window
type: feature
tier: standard
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# Contextual Utility File Window

## Approval

用户于 2026-08-29 明确采纳 Option A，并要求落地修改。

## Goal

让右侧工具轨“文件管理”与“打开终端”采用一致的活动连接语义：从当前选中的 Block 继承连接目标；仅当活动项是终端且存在可用 OSC 7 目录时，从该实时目录打开，否则无感降级到目标连接的默认目录。

## Change Shape

- Type：feature。当前始终打开本机文件窗口是既有明确行为，本次是用户可见语义调整，不按回归修复处理。
- Tier：standard。变更跨越工具轨入口策略、Workspace runtime 上下文和组件测试，但不改变持久化 schema、IPC、认证或安全边界。
- Affected users：在同一 Workspace 内切换本地、远程 Terminal、Files 或 Network Block，并使用右侧工具轨创建文件窗口的用户。

## Current Behavior

- 右侧“文件管理”始终在活动 Block 旁创建本机 Files Block，固定使用 `profileId=null` 与 `path="~"`。
- 右侧“打开终端”从活动 Block 继承 `profileId`；活动 Block 是已连接终端且 OSC 7 目录可用时，还会把该目录作为新终端的一次性启动上下文。
- Files Block 拥有独立的本地或 SFTP runtime，远程认证和 session 不与来源终端共享。

## Scope

- 右侧“文件管理”以当前活动 Block 作为锚点，并继承该 Block 的 `profileId`；`null` 表示本机，非空表示对应远程连接。
- 活动 Block 是 Terminal 时，仅在 OSC 7 功能开启、终端处于已连接状态、目录来源为 `osc7` 且路径非空时使用实时目录。
- 没有可用 OSC 7 目录时，本机连接使用 `~`，远程连接使用 `.`，由现有文件系统/SFTP 边界解析为各自主目录。
- 活动 Block 是 Files 或 Network 时继承其连接，但创建新的 Files Block 并从该连接的默认目录开始。
- 活动 Block ID 失效时沿用现有布局回退规则，以第一个有效 Block 为锚点并继承其连接。
- 保持新 Files Block 的独立认证、host-key、session 和路径生命周期。

## Non-Goals

- 不改变 Terminal Block 标题栏文件夹按钮的现有实时目录与启动目录降级行为。
- 不复制活动 Files Block 当前浏览路径；右侧入口只继承连接，目录除 Terminal OSC 7 外使用默认值。
- 不复用来源 Terminal 的 SSH/SFTP session，不改变认证、凭证或 host-key 流程。
- 不改变右侧“网络管理”、文件连接选择器或“打开终端”的行为。
- 不修改 Workspace schema、Tauri IPC、远程 OSC 7 探测或 macOS 终端适配。

## Assumptions And Constraints

- “当前选中的连接”定义为活动布局叶子的 `profileId`，而不是当前是否已有成功 session；远程 Files Block 仍通过自己的连接流程认证。
- 工具轨动作每次创建一个新的 Files Block，与“打开终端”每次创建新 Terminal Block 保持一致。
- OSC 7 目录是可选增强；不可用、关闭或陈旧时不得阻止文件窗口创建。
- 工具轨保持紧凑、常驻、无额外弹窗或确认步骤。

## Requirements

- REQ-001：右侧“文件管理”必须从当前活动 Block 继承 `profileId`，并在该 Block 旁创建新的 Files Block。
- REQ-002：活动 Block 为 Terminal 且 OSC 7 功能开启、会话已连接、上报路径有效时，新 Files Block 必须使用该 OSC 7 路径。
- REQ-003：OSC 7 关闭、不可用、路径为空或上下文不是 Terminal 时，必须按连接类型降级：本机使用 `~`，远程使用 `.`，且不得阻止创建或增加弹窗。
- REQ-004：新 Files Block 必须继续拥有独立 runtime、认证、host-key 与 session 生命周期，不得复用来源 Block 的 session 或凭据状态。
- REQ-005：活动 Block 无效时必须使用现有首个有效 Block 回退规则，避免生成无效锚点；“打开终端”和其他工具轨动作保持不变。

## Observable Acceptance

- AC-001（REQ-001, REQ-002）：选中已连接远程 Terminal，OSC 7 上报 `/tmp` 时，点击右侧“文件管理”创建 `profileId=<当前连接>`、`path="/tmp"` 的 Files Block。
- AC-002（REQ-001, REQ-002）：选中已连接本地 Terminal，OSC 7 上报绝对目录时，点击入口创建本机 Files Block，并从该目录打开。
- AC-003（REQ-001, REQ-003）：选中远程 Terminal，但 OSC 7 关闭、未上报或无效时，仍创建相同远程 profile 的 Files Block，初始路径为 `.`，不显示阻塞弹窗。
- AC-004（REQ-001, REQ-003）：选中本地 Terminal 且无可用 OSC 7 时，创建本机 Files Block，初始路径为 `~`。
- AC-005（REQ-001, REQ-003）：选中远程 Files 或 Network Block 时继承其 profile 并从 `.` 打开新 Files Block；选中本机 Block 时以 `profileId=null`、`path="~"` 打开。
- AC-006（REQ-004）：远程 Files Block 继续走既有独立认证和 SFTP session 路径，来源终端断开或关闭不影响已创建文件窗口的连接所有权。
- AC-007（REQ-005）：活动 Block ID 无效时仍以第一个有效 Block 为锚点；现有右侧“打开终端”、标题栏文件夹按钮和其他工具入口测试保持通过。

## Behavior Delta

### MODIFIED

- REQ-001：右侧“文件管理”从“始终创建本机 `~` 文件窗口”改为“继承活动 Block 的连接并创建新文件窗口”。
- REQ-002：右侧入口新增 Terminal OSC 7 实时目录优先级；此前该入口不读取 Terminal runtime。
- REQ-003：没有实时目录时按继承连接降级到本机或远程主目录，而不是统一回退本机。

## Options Evaluated

### Option A：活动连接优先，只有 Terminal OSC 7 继承目录（推荐）

- 行为：所有 Block 继承 `profileId`；仅 Terminal 的有效 OSC 7 提供目录，其余使用连接默认目录。
- 优点：与“打开终端”的连接继承规则一致，目录来源边界清晰，不把 Files 当前浏览位置或 Network 状态混入终端语义。
- 成本/风险：入口策略需要读取活动叶子和 Terminal runtime；需覆盖 OSC 7 开关、状态及陈旧目录。
- 维护性：可以集中在现有 `fileWindow` 纯策略边界，避免工具轨和 Terminal 标题栏继续复制路径决策。

### Option B：只在活动项是 Terminal 时继承，否则回退本机

- 行为：延续早期“活动终端优先”规则；Files/Network 选中时忽略其远程 profile。
- 优点：状态分支较少。
- 缺点：不满足“基于当前选中的连接”，用户从远程 Files/Network 点击入口会意外跳回本机。

### Option C：复制所有活动上下文，包括 Files 当前路径

- 行为：Terminal 使用 OSC 7，Files 克隆当前浏览路径，Network 使用默认目录。
- 优点：上下文保留最多。
- 缺点：与“打开终端”仅继承连接的规则不一致；右侧入口会变成隐式克隆 Files 窗口，增加难以解释的特殊语义。

## Recommendation

采用 Option A。它完整满足当前选中连接的一致性，同时把“实时目录”严格限定为 Terminal OSC 7 的可信上下文；其他情况沿用已有 `~` / `.` 默认目录和独立 Files session 机制，不增加用户流程负担。

## Quality Check

- Goal、Scope、Non-Goals 和连接/目录定义明确。
- REQ-001 至 REQ-005 均由 AC-001 至 AC-007 覆盖。
- 本地/远程、Terminal/Files/Network、OSC 7 成功/关闭/缺失、无效锚点及独立 session 不变量均有可观察验收。
- 不涉及 schema、IPC、认证或安全边界升级，无需 strict tier 或独立规格审查。

## Open Issues

- 无阻塞项。
- 显式假设：活动 Files Block 只继承连接，不复制当前浏览路径；若产品希望右侧入口承担“克隆文件窗口”语义，应选择 Option C 并调整 AC-005。

## Next Action

已完成实现、验证与归档；无后续阻塞动作。

## Verification Evidence

- VER-001 / AC-001、AC-002：`fileWindow.test.ts` 验证远程与本地 Terminal 在功能开启、会话已连接且目录来源为 OSC 7 时继承实时目录；`WorkspaceShell.test.tsx` 验证右侧工具轨点击实际派发远程 profile 与 `/tmp`。
- VER-002 / AC-003、AC-004：`fileWindow.test.ts` 验证 OSC 7 关闭、未上报、启动目录来源、断开状态及空白路径均无感降级；远程使用 `.`，本地使用 `~`。
- VER-003 / AC-005：`fileWindow.test.ts` 验证活动 Files/Network 只继承连接，不复制 Files 当前路径；远程从 `.`、本机从 `~` 打开。
- VER-004 / AC-006、AC-007：项目级 `pnpm check` 于 2026-08-29 通过，覆盖既有 WorkspaceProvider、Files 独立 session、标题栏文件按钮及其他工具轨回归：ESLint、59 个 Vitest 文件 / 507 个测试、TypeScript 与 Vite 生产构建全部成功。
- VER-005 / AC-007：失效 `activeBlockId` 的纯策略测试通过，确认回退到布局首个有效 Block；`git diff --check` 在归档前通过。

## Residual Risk

- Vite 仍报告部分既有构建 chunk 超过 500 kB；该提示与本次入口策略无关，不影响功能验收。
- 本次未增加桌面端人工截图验证；入口策略、实际 dispatch 和既有独立 Files runtime 由自动化测试覆盖。
