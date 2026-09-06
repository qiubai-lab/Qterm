---
id: QB-20260906-git-slow-repository-resilience
type: bugfix
tier: standard
status: archived
created: 2026-09-06
updated: 2026-09-07
supersedes: []
---

# Git 慢网络与大仓库韧性

## Approval

用户在 2026-09-06 明确采纳既有分析方案并要求落地优化。

## Problem

本机与远程 Git 命令使用固定的 10/60/120 秒墙钟超时。命令即使持续输出进度，达到固定时长仍会失败；远程超时也没有显式终止并确认远端进程。Git Block 同时会为所有直属子模块发起后台 snapshot，而单个 SSH Git session 串行消费容量为 128 的控制队列，大量子模块可能挤占用户操作或产生伪 `SessionUnavailable`。

## Scope

- 本机和远程 Git 共用按操作类别定义的“无活动超时 + 最大总时长”预算。
- 远程 channel 收到 stdout/stderr 时刷新活动时间；超时后显式请求终止远端命令并关闭 channel。
- fetch、pull、push 强制输出机器可消费的传输进度，使弱网下的活动检测有效。
- 子模块 snapshot 采用小规模 worker pool，根仓库变化后不再启动旧队列中的任务。
- 保持现有机器格式、完整未跟踪文件语义、8 MiB 输出上限、IPC DTO 和持久化 schema。

非目标：流式展示 Git progress、分页/部分 snapshot、自动修改仓库配置、并行执行同一 Git session 的命令、保证服务器忽略 SSH signal 时强制终止任意孙进程。

## Requirements

- REQ-001：持续产生输出活动的 Git 命令不得仅因超过旧固定墙钟时长失败，同时所有命令仍必须有明确最大总时长。
- REQ-002：没有活动或超过最大时长的命令必须返回现有 `gitTimeout`；本机进程必须终止，远程进程必须收到终止信号并关闭 channel。
- REQ-003：read、mutation、network 三类预算必须由本机与 SSH adapter 共享，不在 UI、command DTO 或多个执行器中漂移。
- REQ-004：远程同步命令必须产生进度活动；不得启用交互式凭据或 pager。
- REQ-005：子模块后台 snapshot 同时在途数量必须有界，且用户切换根仓库后不得继续启动旧根尚未开始的任务。
- REQ-006：现有 Porcelain/NUL 输出、完整 changes、输出大小限制、session 串行所有权和错误码保持兼容。

## Behavior Delta

### MODIFIED

- REQ-001：Git 命令由固定墙钟超时改为活动感知且有最大上限的预算。
- REQ-002：远程超时由仅丢弃等待改为显式发送终止信号并关闭 channel。
- REQ-004：fetch、pull、push 增加非交互 `--progress` 输出。
- REQ-005：子模块预加载由无界同时入队改为有界 worker pool 和 stale-root 停止启动。

## Acceptance

- AC-001 [REQ-001, REQ-002, REQ-003]：共享预算测试证明活动可刷新 idle deadline、total deadline 不可突破；本机超时进程仍被终止。
- AC-002 [REQ-001, REQ-002, REQ-004]：SSH command loop 的数据与扩展数据均刷新 idle deadline，超时路径发送 TERM、必要时 KILL 并关闭 channel；网络命令包含 `--progress`。
- AC-003 [REQ-005]：超过并发上限的子模块不会同时调用 loadSnapshot，完成任务后继续补位；切换 root 后旧队列不再启动且旧结果不写入。
- AC-004 [REQ-006]：既有 Git parser、mutation、远程 SSH 集成和 Git Pane 测试通过，source-size ratchet 无新增债务。

## Implementation Steps

- [x] 新建共享 Git execution budget 模块及纯规则测试。
- [x] 将本机 process runner 改为活动感知预算，并保留 kill/wait 清理。
- [x] 从已基线化的远程 `git.rs` 提取 SSH command runner，加入活动检测与超时终止。
- [x] 为同步命令加入 `--progress`，不改变非交互环境约束。
- [x] 将子模块 snapshot 预加载改为有界 worker pool，并补并发与 stale-root 测试。
- [x] 运行相关与仓库级验证并记录证据。

## Acceptance To Checks

| Acceptance | Checks |
| --- | --- |
| AC-001 | Git execution budget unit tests；local process timeout/activity tests |
| AC-002 | SSH command runner unit/contract tests；remote Git command construction tests |
| AC-003 | `useGitSubmoduleSnapshots` concurrency and root-switch tests |
| AC-004 | focused Git tests；`pnpm check:source-size`；`pnpm check`；Rust test/clippy/fmt |

## Verification Evidence

- AC-001：`cargo test infrastructure::git_execution --all-features` 通过（2/2）；活动 chunk 测试与既有本机进程终止测试通过。共享预算为 read 30 秒无活动/120 秒总时长、mutation 60/300 秒、network 120/1800 秒。
- AC-002：SSH command runner 的预算/输出边界测试通过；代码路径在 stdout、stderr 或其他 channel message 到达后重新计算 idle 等待，超时执行 TERM、2 秒宽限后 KILL 并关闭 channel。fetch、pull、push 与 submodule update 均加入 `--progress`，且保持 `GIT_TERMINAL_PROMPT=0`、`GIT_EDITOR=true`、`GIT_PAGER=cat`。
- AC-003：`useGitSubmoduleSnapshots.test.tsx` 通过（5/5），覆盖最多 3 个同时在途、任务完成补位、重渲染不突破上限、切换 root 后旧队列不再启动及旧结果不写入。
- AC-004：`cargo test --all-targets --all-features` 通过（295 passed，4 个环境依赖 OpenSSH 测试按既有规则 ignored）；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- 前端完整门禁：`pnpm check` 通过（source-size、ESLint、127 个 Vitest 文件共 926 项、17 项 Node tests、TypeScript 与 Vite production build）。远程 `git.rs` 从 1340 行降至 1254 行，提取出的 command runner 为 188 行，source-size ratchet 无提醒。
- 兼容性：snapshot 继续使用 `status --porcelain=v2 -z --branch --untracked-files=all`、`for-each-ref --format`、`log --format` 与 NUL/控制字符分隔 parser，未修改 DTO、持久化 schema 或错误码。
- 格式：对本次变更的 Rust 文件执行 `rustfmt --check --edition 2024 --config skip_children=true` 通过。仓库级 `cargo fmt --check` 仍被大量未改动文件已有的 CRLF 换行阻塞，本次未批量改写无关文件。

## Residual Risk

- 完全静默且单步超过无活动阈值的操作仍会超时；这是避免无限挂起的有意边界。
- SSH 服务器或命令包装器可能忽略 signal，或留下无法由当前 channel 精确追踪的孙进程；runner 仍会在宽限后发送 KILL 并关闭 channel。
- 单路 stdout 或 stderr 超过既有 8 MiB 上限仍会返回 `gitOutputTooLarge`，本次没有引入分页或部分 snapshot。
