---
id: QB-20260904-terminal-notifications
type: design
tier: strict
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 实验性终端通知实施计划

## Background / Requirement
参照同 ID spec 最新批准范围，执行 REQ-001–007、010。REQ-008/009 后续处理。用户明确默认关闭、设置/高级实验开关、终端顶部“通知”标签。

## Architecture / API / Persistence
实时输出观察器位于 useTerminalWorkspaceController 的 epoch 检查之后、writer 缓冲之前；关闭时不解析。特性 controller 只拥有通知派生状态，session/epoch 仍属于 Workspace runtime。IPC 仅暴露开关读写与无 payload 通用系统提醒。原生开关由 application service + repository port 实现，notifications.json 为独立设备文件，不改旧 schema。系统通知仅在后台尝试发送，内容固定，不能请求远程命令/URL。

## Implementation Tasks
- [x] TASK-001 [REQ-001, AC-001] 有界流解析器及 chunk/string/control 边界测试。
- [x] TASK-002 [REQ-002, AC-002] runtime 实时观察接口和 epoch 隔离，不回放通知。
- [x] TASK-003 [REQ-003, REQ-004, AC-003, AC-004] notification controller、限流、后台策略与未读确认。
- [x] TASK-004 [REQ-005, REQ-006, REQ-010, AC-005, AC-006, AC-010] 独立持久化与原生发送 adapter；失败保留设置原文与应用内未读。
- [x] TASK-005 [REQ-010, AC-010] 高级开关及实验标签、Block 通知标签/Workspace 聚合；复用既有语义样式。
- [x] TASK-006 [REQ-007, AC-007] CLI 配置文档、Directory Map、验证证据。

## Acceptance To Verification
- VER-001 [AC-001, AC-002] Vitest：分块/UTF8、OSC 结束符 BEL、OSC9 进度、嵌套控制字符串、超限、epoch、buffer replay。
- VER-002 [AC-003, AC-004, AC-010] Vitest：开关默认/保存失败/关闭清理、聚焦/后台、限流、标签状态，固定原生文案。
- VER-003 [AC-005, AC-006, AC-010] Cargo tests：缺失/损坏/未来文件/关闭不发送及保存回读；fmt/clippy。
- VER-004 [AC-006] pnpm check 与同样本 parser 开关基准，源尺寸 ratchet。
- VER-005 [AC-005, AC-007, AC-010] 可用平台 Tauri build、设置/标签截图、CLI 合成序列验证；实际 CLI 与其他 OS 未验证时明确记录，不假称兼容实测。

## Dependencies / Parallel Work
不启动并行 agent。引入官方 Tauri 通知插件，封装其桌面能力限制。UI 遵循 qterm-interface-design，模块遵循工程规范。入口 baseline 先提取职责，不提升上限。

## Rollback / Risks
总开关默认关闭且独立文件，可关闭或回退代码；旧 terminal.json 不改变。系统是否展示不可由 API 成功证明。原生点击定位/OSC99 不在首版。遇到不可用平台构建与 UI 能力，记录阻塞和复验命令，不删除验收。

## Verification Evidence — 2026-09-04

- VER-001/002：`pnpm check` 通过，106 个测试文件、856 个 Vitest 用例及脚本测试通过；包含通知协议、真实 xterm 对照、开关失败/未读/限流、实际 runtime writer 回放与旧 epoch 隔离。原生调用失败保留未读。
- VER-003：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 通过；Rust 291 通过，4 个既有环境相关用例 ignored。
- VER-004：ESLint、TypeScript、Vite、source-size ratchet 通过；入口提取 HeaderActions 和 workspaceFocus 后降低 baseline，未扩大上限。10 MiB ANSI 样本、16 KiB chunks、预热后 3 轮交替实测 xterm：关闭中位数 1104.99 ms、开启 1189.37 ms，增幅 7.64%。该合成样本不代表所有工作负载。
- VER-005：macOS `pnpm tauri build --bundles app` 通过。Qterm Dev 原生 UI 验证默认关闭/实验标签/即时保存；开启后已连接终端出现通知标签，OSC7 不受影响；新建本地测试 Workspace，通过真实 PTY 延迟输出 OSC777，切换其他工作区后出现未读，回到源终端并聚焦后清除。最后关闭开关验证标签隐藏，删除测试 Workspace。截图位于 `/tmp/qterm-notification-verification/settings.png` 与 `unread.jpg`（本机临时证据，包含工作区内容，不入库）。
- 文档：`docs/terminal-notifications.md` 与 Directory Map 已更新。界面沿用既有设置行、开关和 OSC7 tag 语义样式；无新增长期风格偏好。
- 非失败提示：jsdom 不实现 canvas.getContext 的提示、Vite 既有大 chunk 提示；均未影响检查退出状态。

## Acceptance Coverage / Residual Risk

AC-001–007、010 按本轮批准范围由 VER-001–005 覆盖；AC-008/009 为后续阶段。Windows/Linux 构建与实机、OS 实际横幅展示、各 CLI 具体版本的通知触发、SSH/tmux 透传尚未实测，不宣称已验证。基础原生提交由测试替身验证策略并通过 macOS 链接打包，不将 show() 成功当作已展示。可按 `docs/terminal-notifications.md` 的延迟 printf 在目标平台复验；构建命令 `pnpm tauri build`。这些为实验版平台覆盖限制，不阻塞本轮用户明确的设置/标签/通用协议范围。

## Completion

2026-09-04：本轮批准的实验通知范围已实现并验证，规格/计划归档。平台与 CLI 实机覆盖限制见 plan 的 Verification Evidence / Residual Risk。
