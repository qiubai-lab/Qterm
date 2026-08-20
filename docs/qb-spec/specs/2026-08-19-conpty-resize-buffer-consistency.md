# ConPTY resize 缓冲一致性 Task Spec

Status: Complete (2026-08-19)

## Goal

本地 Windows 终端在应用窗口增高、缩短或连续拖动缩放时保持 xterm 缓冲、可视区和 ConPTY 屏幕内容一致，不再出现历史输出重复或错位。

## Scope

- 向前端暴露本地 PTY 的运行时兼容能力，包括 Windows ConPTY backend 和真实系统 build number。
- 仅为本地 Windows ConPTY 配置 xterm `windowsPty`；SSH 和非 Windows 本地终端保持现有 reflow 行为。
- 合并连续尺寸变化、跳过重复尺寸并串行发送 PTY resize，保证最新尺寸最终送达。
- 为已发生的缓冲回归补充聚焦自动化保护。

## Constraints

- 不硬编码 Windows build number，不依赖 WebView user agent 推断系统版本。
- 不清空、重建或回放 xterm 缓冲，不降低 8000 行 scrollback 上限。
- 不改变本地或 SSH 会话建立、输入输出和持久化模型。
- xterm 的前端 fit 保持即时；只合并后端 PTY resize 通知。
- 保留工作区中所有与本任务无关的未提交改动。

## Non-Goals

- 不重构通用平台探测框架。
- 不改变 SSH 协议或远端 shell 的窗口变更语义。
- 不处理应用重启后的终端缓冲恢复。

## Acceptance

1. Windows 本地终端使用 `backend: "conpty"` 和当前系统真实 build number 配置 xterm。
2. SSH 终端和非 Windows 本地终端不应用 ConPTY 专属配置。
3. 一次连续缩放中的多个待发送尺寸会合并为最新尺寸，相同尺寸不会重复发送，且 IPC 调用不会并发乱序。
4. resize 发送失败不会阻断后续尺寸更新。
5. 现有 xterm 实例复用、scrollback、输入输出和会话行为保持通过。
6. 聚焦测试、`pnpm check`、Rust 格式/Clippy/测试和 diff 检查通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1, 2 | Rust 能力 DTO 测试、IPC client 测试和 TerminalPanel 配置测试。 |
| 3, 4 | resize scheduler 单元测试覆盖 debounce、去重、串行 latest-wins 与失败恢复。 |
| 5 | TerminalPanel 生命周期测试、前端完整检查和 Rust 测试。 |
| 6 | 运行计划列出的全部自动化命令并记录结果。 |

## Open Questions

无。

## Verification Evidence

- 回归测试先确认旧实现缺少能力 API、xterm ConPTY 配置和 resize scheduler，随后实现后聚焦测试 4 个文件、15 项全部通过。
- `pnpm check` 通过：17 个测试文件、54 项测试全部通过，ESLint、TypeScript 和 Vite 生产构建通过。
- 单独 `pnpm build` 通过：64 个模块完成转换和产物生成。
- `cargo fmt --check` 通过。
- `cargo clippy --all-targets --all-features -- -D warnings` 通过。
- `cargo test --all-targets --all-features` 通过：58 项通过、0 失败、1 项依赖本机 OpenSSH 环境的测试保持 ignored。
- `git diff --check` 通过，仅输出工作区现有 Windows 行尾转换提示。
- 自动化覆盖真实 Windows build metadata、异步能力到达时复用 xterm、本地/SSH 配置隔离、resize 去重/latest-wins/串行和失败恢复；实际桌面窗口拖拽需在交互式 Tauri 窗口中最终目视复验。

## Recommended Approach

推荐由 `commands/local_session` 暴露只读能力 DTO，Windows 下通过目标限定的 `windows-version` 依赖读取真实 build number；WorkspaceProvider 加载并传递能力，TerminalPanel 将其应用到本地 xterm。终端 view 内持有 latest-wins resize scheduler，本地 ConPTY 使用短尾随合并，SSH 使用零延迟批次合并。相比硬编码 build number 或只 debounce，这同时修正 xterm/ConPTY 缓冲策略和高频 IPC 竞态。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；这是局部运行时兼容修复，不改变长期产品或领域规则。
- Directory Map: not needed；新增文件仍位于既有 terminal 模块，现有目录职责不变。
