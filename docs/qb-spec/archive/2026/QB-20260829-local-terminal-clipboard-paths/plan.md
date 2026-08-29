---
id: QB-20260829-local-terminal-clipboard-paths
type: feature
tier: standard
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# 本地终端剪贴板文件路径粘贴实施计划

## Requirement

实施 [QB-20260829-local-terminal-clipboard-paths](../specs/QB-20260829-local-terminal-clipboard-paths.md) 的 REQ-001 至 REQ-006；首版只承诺 Windows 原生 Shell 与 macOS/Linux 默认 Shell。

## Scope

- 复用现有原生剪贴板 payload 读取器，增加本地终端目标用例。
- 为 Windows 与 POSIX 原生路径提供纯格式化规则。
- 将原始图片写入 Qterm cache root 下的专用 clipboard 目录，并安全清理过期生成文件。
- 增加本地粘贴 IPC、前端 adapter、TerminalPanel 编排和非上传语义状态。
- 保持远端 SFTP staging、输入调度器和文本长粘贴确认不变。
- 不增加 WSL/MSYS/Cygwin、容器、嵌套 SSH 或本地 Shell Profile。

## Affected Files

- `src-tauri/src/domain/terminal_staging.rs`
- `src-tauri/src/ports/terminal_staging.rs`
- `src-tauri/src/application/terminal_staging_service.rs`
- `src-tauri/src/infrastructure/clipboard.rs`
- `src-tauri/src/commands/clipboard.rs`
- `src-tauri/src/lib.rs`
- `src/lib/tauri/localSessions.ts` 及相邻测试
- `src/terminal/TerminalPanel.tsx`、`TerminalStagingStatus.tsx`、样式及相邻测试
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

- `ClipboardPayloadSource` 继续是原生剪贴板 port；本地与远端 application 用例消费同一 `ClipboardPayload`，但目标行为分离。
- domain 定义 `LocalTerminalPathStyle` 和纯路径文本格式化规则，不依赖 Tauri、arboard 或 PTY。
- infrastructure 的 clipboard adapter 接收组合根提供的 cache clipboard 目录；原始图片使用 UUID 名称写入该目录，来源 entry 标记为生成文件。
- 本地用例只返回 `Empty | Text | Paths`；`Paths` DTO 包含一次性最终粘贴文本、展示名和项目数，不返回图片字节或文件内容。
- Windows 构建选择 Windows 路径风格，其他桌面构建选择 POSIX 风格。格式化只生成待粘贴文本，不附加 Enter 或执行命令。
- TerminalPanel 继续在 `inputScheduler.runExclusive` 内调用 `terminal.paste()`；本地文件状态使用准备/路径已粘贴/失败文案，隐藏上传进度和停止上传语义。
- 生成图片由本地粘贴保留、由远端上传按现有 `cleanup_after` 删除；专用 cache 目录仅清理符合 UUID PNG 命名且超过 TTL 的条目。

## Implementation Tasks

- [x] 在 domain/application 中增加本地 payload 结果、Windows/POSIX 路径格式化和生成文件保留规则。
- [x] 将原生图片落盘迁移到组合根提供的专用 cache clipboard 目录，实现 UUID 命名、权限收敛和 TTL 清理。
- [x] 增加本地剪贴板准备 command/DTO/error 映射并在 Tauri 组合根注册，保持远端 command 契约不变。
- [x] 增加 TypeScript IPC adapter，并把 TerminalPanel 本地粘贴分支切换到统一原生 payload 结果。
- [x] 扩展悬浮状态组件的本地语义，保证不显示上传进度或停止上传动作。
- [x] 更新相邻 Rust/前端回归测试和 Directory Map 职责说明。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001、AC-004 | domain 路径格式化单测；clipboard/application 测试覆盖文件/目录顺序与 Windows/POSIX 特殊字符。 |
| AC-002 | infrastructure 测试验证 cache 路径、有效 PNG、UUID 文件名、TTL 仅清理受管文件及来源文件不删除。 |
| AC-003 | TerminalPanel 与 input scheduler 既有/新增测试覆盖 text、empty、长粘贴确认和输入顺序。 |
| AC-005 | TerminalPanel、TerminalStagingStatus 和样式测试覆盖本地准备、完成、失败及无上传进度/停止动作。 |
| AC-006 | 远端 TerminalPanel、application、command 和 SSH staging 既有回归保持通过。 |

## Test / Verification

1. 运行新增 domain/application/infrastructure/command Rust 聚焦测试。
2. 运行 `pnpm exec vitest run src/lib/tauri/localSessions.test.ts src/terminal/TerminalStagingStatus.test.tsx src/terminal/TerminalPanel.test.tsx src/terminal/terminalSurfaceStyles.test.ts --maxWorkers=1`。
3. 运行 `pnpm check`。
4. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
5. 运行 `git diff --check`，并核对 Directory Map 与最终职责一致。

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md`：terminal staging 从远端专用扩展为共享 payload、本地路径准备和远端上传目标；clipboard command/adapter 的一次性本地粘贴文本与 cache 生命周期边界同步更新。
- 不更新长期 product/UI/engineering context；本次平台范围是当前功能局部边界，不推断为跨功能永久偏好。

## Dependencies

- 无新增第三方依赖；复用 `arboard`、`image`、`uuid`、`tempfile`、xterm 和现有 Tauri IPC。
- Rust DTO、TS adapter 与 TerminalPanel 调用必须同步提交，避免本地粘贴在前后端契约不一致时静默退化。

## Trigger Signals

- Architecture：命中，需确认 domain/application、clipboard infrastructure、command DTO 与 PTY/UI 的单向职责。
- Critical behavior：命中，剪贴板优先级、生成文件生命周期、路径格式化和输入保序必须先有聚焦回归保护。
- Directory Map：命中，既有模块职责从远端专用扩展到本地与远端共享。

## Verification Evidence

- Rust 聚焦测试：clipboard 6 个、terminal staging 13 个，全部通过。
- 前端聚焦测试：4 个文件、53 个测试，全部通过。
- `pnpm check`：ESLint、60 个测试文件/536 个测试、TypeScript 与 Vite 生产构建全部通过。
- `cargo clippy --all-targets --all-features -- -D warnings` 通过。
- `cargo test --all-targets --all-features`：216 passed、3 ignored、0 failed。
- 全量 Rust 格式检查 `cargo fmt --all -- --check --config newline_style=Auto` 通过；显式沿用工作区现有换行风格，未批量改写无关文件。
- `git diff --check` 通过；Directory Map 已更新。
