---
id: QB-20260906-ssh-runtime-disconnect
type: bugfix
tier: standard
status: archived
created: 2026-09-06
updated: 2026-09-06
supersedes: []
---

# SSH 运行期断线状态同步

## Approval

用户在 2026-09-06 明确采纳分析方案并要求落地修改。

## Problem

Terminal 会通过 PTY channel 的 EOF/Close 感知连接结束；空闲的 Git、Network 与 File purpose runner 只等待业务控制或主动取消。底层 SSH task 因网络中断、keepalive 超时或服务器断开而结束时，这些 runner 不会被唤醒，前端 runtime 因而错误地保留 `connected`，后续操作只能显示局部错误。

## Scope

- 由共享 SSH session 生命周期识别已连接会话的意外 transport 结束，并向所有 purpose 发出稳定失败事件。
- 区分主动关闭与意外断线；不把业务操作错误或正常用户关闭误报为连接失败。
- Git、Network 与 File 继续通过现有 workspace runtime 和 Block notice 展示失败、清理附属运行状态并提供手动重连。
- 加固异步 connect 返回晚于终态事件时的 session ID 竞态。

非目标：自动重连、合并同一 profile 的独立 block session、暴露 russh 内部错误或服务器提供的任意文本、修改持久化 schema。

## Requirements

- REQ-001：已进入 `connected` 的 SSH transport 意外结束时，所属 block 必须转为 `failed`，清空不可再用的 session ID，并显示稳定、可恢复的断线原因。
- REQ-002：用户主动断开必须保持 `closing → closed` 语义，不得产生意外断线提示；并发终止只能产生一个终态失败。
- REQ-003：断线只影响实际拥有该独立 session 的 block；Git 标记内容 stale，Network 清空规则运行态，File 保留最后可见内容但停止把 session 视为可用。
- REQ-004：失败或关闭事件先于 connect 调用返回时，迟到结果不得把已终止 session ID 写回 runtime。
- REQ-005：仓库级 transport 规则归 `SessionEntry` 与 SSH adapter 所有；React controller 只消费稳定 IPC 事件，不轮询底层连接或复制 SSH 状态机。

## Behavior Delta

### MODIFIED

- REQ-001：Git、Network 与 File 从“仅在下一次业务操作时局部报错且标题栏仍显示已连接”改为“transport 终止后更新 block 连接失败状态并显示原因”。
- REQ-002：明确保留主动关闭的正常结束语义。
- REQ-003：明确各 purpose 的断线后派生状态和 session 隔离。
- REQ-004：Git 与 Network 补齐 File/Terminal 已有的迟到连接终态保护。
- REQ-005：断线检测集中在共享 SSH 生命周期边界。

## Acceptance

- AC-001 [REQ-001, REQ-003]：Git、Network、File 的已连接 session 收到 transport 终止后均产生 `stateChanged: failed` 和稳定失败原因；前端清除 session ID，并分别更新 stale、规则运行态与文件连接状态。
- AC-002 [REQ-002]：主动断开不产生断线失败；重复或并发 transport 终止只提交一次失败事件。
- AC-003 [REQ-004]：Git、Network、File 在终态事件先到时都拒绝迟到的 connect session ID。
- AC-004 [REQ-005]：断线判断不进入 Pane/UI，不按 profile 联动其他独立 session，也不新增持久化或敏感错误字段。

## Implementation Steps

- [x] 在 domain/IPC 增加连接丢失的稳定失败分类与中文消息。
- [x] 在 `SessionEntry` 提供仅允许 `Connected → Failed` 的原子运行期失败入口，同时停止当前 runner 和附属任务。
- [x] 在 russh `ClientHandler::disconnected` 中区分主动关闭与意外 transport 结束，并调用共享入口。
- [x] 为 Git、Network 补齐 finished-epoch 防护；复用现有 UI 失败展示，不新增重复提示。
- [x] 添加 SSH 生命周期与 workspace controller 回归测试，并复用既有 Block notice 展示覆盖。

## Acceptance To Checks

| Acceptance | Checks |
| --- | --- |
| AC-001 | Rust SSH lifecycle tests；remote workspace Git/Network/File disconnect tests；既有 LayoutView failure presentation tests |
| AC-002 | Rust intentional-close and duplicate-disconnect tests |
| AC-003 | remote workspace late-connect race tests |
| AC-004 | source-size、lint、typecheck、frontend build；代码边界检查 |

## Verification Evidence

- AC-001、AC-003：`pnpm exec vitest run src/workspace/remoteSessionDisconnect.test.tsx` 通过（3/3），覆盖 Git、Network、Files 的失败状态、派生状态清理及迟到 session ID 拒绝。
- AC-001、AC-002：`cargo test session_lifecycle_tests --all-targets --all-features` 通过（2/2），覆盖单次失败、runner 唤醒和主动关闭竞态。
- IPC 稳定契约：`cargo test runtime_disconnects_have_stable_user_facing_failures --all-targets --all-features` 通过（1/1）。
- Rust 全量回归：`cargo test --all-targets --all-features` 通过（290 passed，4 ignored）；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- 前端完整门禁：`pnpm check` 通过（source-size、ESLint、127 个 Vitest 文件共 923 项、17 项 Node tests、TypeScript 与 Vite production build）。新增 lifecycle 测试独立成模块，source-size 无 ratchet 提醒。
- 格式：对本次变更的 Rust 文件执行 `rustfmt --check --edition 2024 --config skip_children=true` 通过。

## Residual Risk

物理网络被静默丢包时，失败事件仍依赖现有 SSH keepalive/inactivity 策略确认 transport 已结束；本次不缩短探测周期，以避免改变全局网络流量与弱网容错策略。
