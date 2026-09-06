---
id: QB-20260907-osc7-startup-notice
type: bugfix
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes: []
---

# OSC 7 启动提示

## Approval

用户在当前会话采纳评估方案并明确要求落地，同时限定不处理 PowerShell。

## Observed Behavior

远程 Bash、Zsh 或 Fish 会话开启 OSC 7 后，Shell 先绘制初始提示符；Qterm 随后静默注入会话级 Hook，命令结束又触发下一次提示符。首个提示符因此表现为一次没有输入内容的空提交。

## Expected Behavior

Qterm 应把首个不可交互的提示符行替换为一条低强调的 OSC 7 会话提示，然后只保留后续真正可输入的提示符。

## Root Cause

SSH Terminal 在 `request_shell` 后写入固定初始化命令。POSIX PTY 已关闭输入回显，所以 Hook 命令正文不可见，但 Shell 在读取命令前已经输出初始提示符，并在命令完成后再次输出提示符。

## Scope

- 修改远程 Bash、Zsh、Fish 的固定会话级 OSC 7 Hook 命令。
- Hook 首次成功上报 OSC 7 后，清除当前初始提示符行并显示固定 ASCII 提示 `[Qterm] OSC 7 active (session only)`。
- 提示使用终端 dim 属性并在结束时恢复文本属性。
- 保留现有 PTY echo 恢复、初始目录切换、Hook 注册和 OSC 7 上报顺序。

## Non-Goals

- 不修改 PowerShell Hook 或其回显行为。
- 不修改本地终端 OSC 7 集成。
- 不解析、匹配或推断用户自定义提示符。
- 不把提示状态或终端输出写入 Workspace/persistence。
- 不修改远程 Shell 配置文件。

## Requirements

- REQ-001：远程 Bash、Zsh、Fish 的自动 OSC 7 初始化必须在首次 OSC 7 上报后，用固定 VT 序列清除不可交互的初始提示符行并显示紧凑的仅当前会话提示。
- REQ-002：POSIX 初始化必须继续先恢复 PTY echo，并保持固定、无用户数据的提示文本；提示结束后必须恢复终端文本属性并换行，不能污染最终提示符。
- REQ-003：PowerShell、初始目录安全编码、会话级 Hook、OSC 7 URI 和不写远程配置文件等既有行为必须保持不变。

## Acceptance

- AC-001 [REQ-001, REQ-002]：Bash、Zsh、Fish Hook 命令均在 OSC 7 上报之后包含 `CR + erase line + dim + fixed notice + reset + CRLF`，且命令仍以恢复 echo 开始并以单个提交 `CR` 结束。
- AC-002 [REQ-003]：PowerShell Hook 命令不包含新增提示；四类 Shell 仍生成 OSC 7、保持会话级实现且不引用用户 rc/profile 文件。
- AC-003 [REQ-002, REQ-003]：带恢复目录的四类初始化命令仍先安全切换目录，再上报 OSC 7；不引入原始控制字符、换行或未编码目录内容。

## Behavior Delta

### MODIFIED

- REQ-001：远程 POSIX Shell 自动注入完成后，不再留下看似空提交的首个提示符，而是把该行替换为固定的 OSC 7 当前会话提示。
- REQ-003：PowerShell 明确保持原有行为，不随 POSIX 首行提示一起变化。

## Architecture Check

固定 Shell 方言和 VT 输出继续由 `domain::shell_integration` 拥有；SSH infrastructure 只负责 PTY mode、会话启动和命令发送，React 只解析 OSC 7 并呈现现有可信状态。不新增跨层模型或通用抽象。

## Implementation Steps

- [x] 先扩展 Shell domain 回归测试，覆盖三种 POSIX Shell 的提示序列、顺序及 PowerShell 不变。
- [x] 在三种 POSIX Hook 固定命令末尾加入首行替换提示。
- [x] 运行 Shell domain 聚焦测试、格式检查和与 Rust 改动相关的静态检查。

## Acceptance Checks

| Acceptance | Check |
| --- | --- |
| AC-001 | `domain::shell_integration` 单元测试断言三种 POSIX Hook 的完整提示序列及顺序。 |
| AC-002 | 单元测试断言 PowerShell 不含提示，并保留四种 Hook 的既有约束。 |
| AC-003 | 既有恶意/控制字符目录夹具继续验证编码、顺序和单一提交边界。 |

## Quality Check

目标、非目标与 PowerShell 例外已由用户明确；三项 requirement 均有可观察 acceptance。改动局限于固定会话命令，不改变 IPC、持久化、安全输入边界或目录恢复契约。

## Verification Evidence

- AC-001：新增 `posix_hooks_replace_the_initial_prompt_with_a_session_notice`，先在旧实现上失败，随后验证 Bash、Zsh、Fish 的 OSC 7 上报、首行清除、dim 提示、属性复位与换行序列。
- AC-002：同一测试验证 PowerShell 不含新增提示；既有 `hooks_are_current_session_only_and_posix_variants_restore_echo` 继续通过。
- AC-003：既有 `inherited_directories_are_literal_and_run_before_the_first_osc7_report` 与完整 Shell domain 测试共 5 项通过。
- `/bin/bash -n` 与 `/bin/zsh -n` 验证修改后的固定 Hook 语法；当前环境未安装 Fish，Fish 由固定命令断言与 Rust 测试覆盖。
- `cargo test --all-targets --all-features`：303 项通过，4 项环境依赖测试忽略，0 项失败。
- `cargo clippy --all-targets --all-features -- -D warnings`、`cargo fmt --check` 与 `git diff --check` 通过。

## Residual Risk

当前环境未执行真实远程 Fish 会话或截图级 SSH 冒烟测试；提示使用 Fish 已支持的 `printf` 转义形式，且没有改变其 Hook 注册语法。PowerShell 按用户范围保持原状。
