---
id: QB-20260820-terminal-session-lock
status: archived
archived: 2026-09-02
legacy: true
---
# 终端会话锁 Task Spec

Status: Complete (2026-08-20)。

## Goal

用户可从主界面选择只锁定凭证库，或同时锁定终端界面与凭证库；后者必须输入主密码才能同时恢复终端操作和凭证库访问。

## Scope

- 右侧工具轨入口由“锁定凭证库”改为“锁定终端”，仍位于系统设置上方。
- 点击入口打开紧凑选择弹窗，提供“锁定凭证库”和“锁定终端和凭证”两个明确选项。
- 只锁定凭证库时复用现有手动锁定能力，不显示终端遮罩。
- 同时锁定时先确保凭证库已锁定，再在顶部标题栏下方显示覆盖工作区舞台的半透明深色锁屏。
- 锁屏期间终端、文件面板与右侧工具轨不可被指针、键盘或焦点操作，Escape 和背景点击不能退出。
- 顶部 Workspace 标签、新建 Workspace 及窗口最小化、最大化和关闭控制保持可用；Workspace 切换快捷键不受锁屏影响。
- 输入正确主密码后复用现有凭证库解锁能力，同时移除锁屏并恢复操作。
- 终端锁状态只存在于当前前端进程，重启或重新创建应用后为未锁定。

## Constraints

- 主密码只短暂存在于锁屏表单 state，提交前转交现有窄化解锁 IPC，随后立即清空；不得持久化或记录。
- 凭证库锁定失败时不得显示终端已锁定；解锁失败时必须保持遮罩。
- 锁屏不关闭 SSH/SFTP/local PTY，会话和后台输出继续运行。
- 凭证库未初始化时入口不可用；凭证库已锁定时“只锁定凭证库”选项不可重复执行，但仍可选择同时锁定。
- 锁屏是应用内隐私与误操作防护，不声明为操作系统登录会话级安全边界。

## Non-Goals

- 不持久化终端锁状态，不增加自动终端锁定计时或 Windows 会话锁定联动。
- 不终止、暂停或重连现有终端和文件会话。
- 不新增主密码验证算法、凭证格式、Tauri IPC 或 Rust 后端规则。

## Acceptance

1. 工具轨显示“锁定终端”，其后紧邻系统设置；点击后显示两个锁定范围选项。
2. 选择“锁定凭证库”只调用现有锁定能力，成功后关闭选择弹窗且不显示终端锁屏。
3. 选择“锁定终端和凭证”在凭证锁定成功后显示最高层遮罩；失败时保持选择弹窗并展示错误。
4. 锁屏期间工作区舞台内容为 inert/隐藏于辅助技术，Escape、背景点击和终端操作快捷键均不能解除或操作该区域。
5. 错误或过短主密码保持锁屏并展示错误；正确主密码调用现有解锁能力，同时恢复终端和凭证库。
6. 主密码提交即从输入 state 清除；锁屏状态不进入任何持久化 action 或文件，重新挂载应用默认未锁定。
7. 半透明锁屏保持终端内容不可辨读，并为 reduced transparency / reduced motion 提供降级。
8. 锁屏不覆盖顶部标题栏，Workspace 切换/新建和窗口最小化、最大化、关闭可由指针与相应快捷键继续使用。
9. 主密码校验与解锁错误固定显示在解锁按钮同一操作行；消息出现、变化或消失不得改变锁屏弹窗高度及按钮位置。

## Acceptance To Verification

- 1—6、8、9：`WorkspaceShell`、终端锁弹窗和 `DialogFrame` Testing Library 回归测试。
- 7：`appStyles` 样式契约测试及聚焦视觉检查。
- 全量：`pnpm check` 和 `git diff --check`。

## Open Questions

无。用户已确认解除终端锁定时同时解锁凭证库。

## Recommended Approach

采用进程内 `terminalLocked` UI 状态与现有 `lockVault` / `unlockVault` 编排。专用锁屏挂载在 `workspace-stage` 内，只有其底层工作区内容设置 `inert` 和 `aria-hidden`；顶部 `app-chrome` 保持在锁定边界外。`DialogFrame` 以非全局模态语义呈现区域锁屏，使键盘焦点仍可进入顶部控件。该方案完整复用现有认证边界，并符合“同时还原终端和凭证”的确认语义。

## Next Skills

- `writing-qb-plans`（Strict：认证与交互隔离）
- `maintaining-project-context`（记录长期锁屏边界）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（只在既有 dialogs/workspace 模块内新增功能组件，不改变模块职责）

## Verification Evidence

- 聚焦回归覆盖锁定范围、凭证锁失败、工作区 inert、终端快捷键阻断、顶部控制保留、不可取消弹窗、密码清空、同时解锁和重新挂载不保留状态。
- `pnpm check`：通过；31 个测试文件、181 项测试全部成功，ESLint、TypeScript 与 Vite 生产构建成功。
- `git diff --check`：通过；工作区仅有既有 LF/CRLF 提示。
