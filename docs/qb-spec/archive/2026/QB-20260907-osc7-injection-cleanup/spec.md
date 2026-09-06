---
id: QB-20260907-osc7-injection-cleanup
type: bugfix
tier: standard
status: archived
created: 2026-09-07
updated: 2026-09-07
supersedes:
  - QB-20260907-osc7-startup-notice
---

# OSC 7 注入收尾修正

## Approval

用户在当前会话提供真实 Bash 输出，确认原方案未覆盖初始提示符，并明确要求继续落地修改；PowerShell 仍不在本次范围内。

## Observed Behavior

远程 Bash、Zsh 或 Fish 启动后，Qterm 通过交互式标准输入提交 OSC 7 初始化命令。Shell 已把初始提示符留在上一显示行，因此仅清除当前行不能覆盖它；Bash 还会把完整初始化命令记录到会话 history。

## Expected Behavior

Qterm 应把上一显示行的不可交互初始提示符替换为固定会话提示，只留下一个可输入提示符；自动初始化命令不应留在目标 Bash history 中，并应尽量利用 Zsh/Fish 的原生空格忽略约定避免持久化。

## Root Cause

OSC 7 控制序列本身不产生换行。空白输入观感来自交互式 Shell 消费初始化命令：命令执行时光标已进入初始提示符之后的下一行，而原实现的 `CR + erase line` 只作用于当前行。PTY `ECHO=0` 只隐藏输入字符，不改变 Shell history。

## Scope

- 修正远程 Bash、Zsh、Fish 初始化命令的首行替换序列，使其回到上一显示行后再清除并输出提示。
- POSIX 初始化提交以空格开头，适配 Bash/Zsh/Fish 的常见 history 忽略机制。
- Bash 在当前初始化命令结束前显式删除自身的 history 事件。
- 保持初始目录恢复、Hook 注册、OSC 7 首次上报及最终可输入提示符顺序。

## Non-Goals

- 不修改 PowerShell、本地终端或远程 Shell 配置文件。
- 不删除 Zsh/Fish 中与 Qterm 无关的 history，也不强制改写用户 history 选项。
- 不解析或匹配用户自定义提示符；多行提示符仅保证清除光标紧邻的上一显示行。

## Requirements

- REQ-001：远程 Bash、Zsh、Fish 初始化必须在首次 OSC 7 上报后移动到上一显示行，清除该行并显示固定的 dim 会话提示，然后恢复文本属性并换行。
- REQ-002：远程 Bash 初始化命令必须在新提示符绘制前删除其自身的当前会话 history 事件；失败必须静默且不得阻止 Hook 或最终提示符。
- REQ-003：远程 POSIX 初始化提交（包括带初始目录的变体）必须以空格开头，以适配 Shell 已启用的忽略前导空格策略；不得为此修改用户 history 配置或批量删除记录。
- REQ-004：PowerShell、会话级 Hook、目录安全编码、OSC 7 URI、不写远程配置文件和单一提交边界必须保持不变。

## Acceptance

- AC-001 [REQ-001]：Bash、Zsh、Fish Hook 均在首次 OSC 7 之后包含 `previous line + erase line + dim + fixed notice + reset + CRLF`，且固定提示只出现一次。
- AC-002 [REQ-002]：Bash Hook 在输出提示前静默执行基于 `HISTCMD` 的自身 history 删除；交互式 Bash 验证中初始化命令不再出现在后续 `history` 输出。
- AC-003 [REQ-003, REQ-004]：三种 POSIX Hook 及带目录初始化均以空格开头；PowerShell 字符串保持原样，目录编码与单一提交约束继续通过。

## Behavior Delta

### MODIFIED

- REQ-001：首行替换从清除当前行改为回到并清除上一显示行，从而真正覆盖已经绘制的初始提示符。
- REQ-002：Bash 自动初始化不再污染当前会话 history。
- REQ-003：POSIX 自动提交增加前导空格，但不改变用户 Shell 的持久配置。

## Architecture Check

Shell 方言、history 收尾和 VT 序列仍由 `domain::shell_integration` 按 Shell 类型拥有；SSH infrastructure 继续只负责创建 PTY、请求 Shell 和发送命令。本修正不新增跨层状态、IPC 或持久化边界。

## Implementation Steps

- [x] 先扩展 Shell domain 回归测试，覆盖上一行清除、Bash history 收尾、POSIX 前导空格和 PowerShell 不变。
- [x] 修改 Bash/Zsh/Fish 固定初始化命令，并确保带初始目录时前导空格仍位于整条提交开头。
- [x] 执行真实交互式 Bash history 验证、Shell 语法检查、Rust 测试、格式和静态检查。

## Acceptance Checks

| Acceptance | Check |
| --- | --- |
| AC-001 | `domain::shell_integration` 单元测试断言三种 POSIX Hook 的上一行清除序列与输出顺序。 |
| AC-002 | 单元测试断言 Bash 专属 history 清理；PTY/交互式 Bash 检查后续 history 不含初始化命令。 |
| AC-003 | 单元测试覆盖无目录/有目录 POSIX 前导空格、PowerShell 例外及既有恶意目录夹具。 |

## Quality Check

真实输出已验证原根因判断中的行位置错误；用户授权覆盖 Bash/Zsh/Fish 且排除 PowerShell。每项行为要求均有可观察 acceptance，history 策略明确区分 Bash 强保证与 Zsh/Fish 非破坏性兼容，不隐式改变用户配置。

## Verification Evidence

- AC-001：新增 `posix_hooks_replace_the_previous_prompt_line_with_a_session_notice`，在旧实现上先失败，随后验证三种 POSIX Hook 使用 `CSI 1F + erase line` 覆盖上一显示行，并在 OSC 7 后仅输出一次固定提示。
- AC-002：新增 `bash_hook_removes_its_own_history_event_before_the_notice`；额外交互式 Bash 验证在显式清空 `HISTCONTROL` 的条件下，初始化完成后的 `history 10` 只包含查询命令，不包含 Qterm 初始化命令。
- AC-003：既有目录安全夹具扩展为检查有目录时整条 POSIX 提交仍以前导空格开始；PowerShell 分支和字符串未修改。`/bin/bash -n`、`/bin/zsh -n` 通过；当前环境未安装 Fish，Fish 由固定命令断言和 Rust 测试覆盖。
- `cargo test --all-targets --all-features`：304 项通过，4 项环境依赖测试忽略，0 项失败。
- `cargo clippy --all-targets --all-features -- -D warnings`、`cargo fmt --check` 和 `git diff --check` 通过。

## Residual Risk

- Zsh 仅在用户已启用 `HIST_IGNORE_SPACE` 时忽略前导空格命令；Fish 默认忽略，但用户自定义 `fish_should_add_to_history` 可覆盖。为避免删除用户记录或改写 Shell 配置，本次不对这两类 Shell 做侵入式 history 操作。
- 多行自定义提示符只清除紧邻命令输入位置的上一显示行；本次不推断提示符高度。
- 当前环境未执行真实远程 Fish 会话或截图级 SSH 冒烟测试。
