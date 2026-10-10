---
schema: 1
id: QB-20261011-terminal-activity
type: feature
tier: standard
status: archived
created: 2026-10-11
updated: 2026-10-11
supersedes: []
---

# 终端标题偏好与紧凑进度标签

授权：用户要求高级设置提供默认关闭的标题开关，并收紧进度标签高度、为出现和消失增加动画。沿用既有终端与连接信息布局。

## Behavior Delta

### ADDED
- REQ-001: 高级设置的“显示应用标题”默认关闭，保存成功后即时作用于所有终端，并在重启后保持；旧配置缺少该字段时使用关闭值。路径标题过滤继续有效，开关不影响进度或其他协议功能。
- REQ-002: 进度首次出现和被清除时分别淡入、淡出；快速重新上报不会被旧退出回调清除，断开连接时也退出，切换会话不串状态。减少动态效果时取消位移和旋转。

### MODIFIED
- REQ-003: 进度从共同状态组改成独立的 16px 高标签，运行、暂停、错误使用各主题语义色；窄窗口保持百分比与核心终端操作可见。

## Acceptance
- AC-001 [REQ-001]: 新配置与 v1–v3 配置默认不显示标题；开关保存、重开与保存失败的状态正确，启用即时展示当前应用标题，关闭仍显示进度。
- AC-002 [REQ-002]: 清除时保留退出元素至动画完成/超时；重新上报、无动画事件、卸载、断开与会话切换均不会留下过期标签。
- AC-003 [REQ-003, REQ-002]: 深色、浅色、赛博主题及窄窗口的标签高度、颜色、状态、百分比和动效通过截图/尺寸核查；减少动态效果仍可退出。

## Implementation
- [x] 扩展 terminal 设置 DTO、JSON v4 与演示默认值，覆盖兼容和错误保护。
- [x] 以终端标题偏好 Provider 为全局显示状态所有者，接入高级设置与 Header，无 Workspace 状态扩展。
- [x] 独立进度 presence 生命周期与紧凑 CSS，补充竞态/交互测试。
- [x] 完成主题与窄窗口浏览器核查、前后端检查并更新证据。

## Verification
| Acceptance | Check / Evidence |
| --- | --- |
| AC-001 | `SettingsDialog.applicationTitle.test.tsx` 覆盖多个当前终端即时更新、默认关闭、重开恢复、保存失败与忙碌；`TerminalTitleProvider.test.tsx` 覆盖旧字段默认值、初始读取失败和迟到读取不覆盖更新；`cargo test --all-targets --all-features settings` 27 项通过，覆盖 v1–v3 默认值、v4 持久化、独立布尔 DTO、损坏文件保护。 |
| AC-002 | `TerminalProgressPresence.test.tsx` 4 项通过，覆盖实际退出、子动画冒泡、快速恢复、百分比更新不重挂、缺少动画事件、卸载、断开与会话切换；浏览器实际进场/退场计数均为 12，快速恢复后保留 12 个标签。 |
| AC-003 | 浏览器实际组件三主题 running/paused/error/indeterminate 均测得 16px，280/360/480px 无横向溢出，百分比和关闭操作保留；截图 `qterm-progress-tags.png`、`qterm-title-setting.png` 位于本会话 visualizations 目录。CSS 测试确认 reduced-motion 取消旋转/位移，presence 超时退出覆盖无动画事件环境；未切换宿主 OS 的 reduced-motion 偏好。 |

门禁：Node 22.23.2；source-size 通过（0 ratchet reminders）、lint 通过、Vitest 188 文件 / 1195 测试通过（1 文件 / 2 测试跳过）、TypeScript 与 Vite 生产构建通过。Rust fmt 与 clippy all-targets/all-features -D warnings 通过；全量 Rust 为 324 通过 / 6 忽略 / 2 失败，失败情况如下。

兼容：terminal.json 只在保存时写为 v4；读取旧文件不主动重写。旧版程序拒绝未来 schema 的保护继续适用，保存后的 v4 文件不能由仅支持 v3 的旧版程序加载。

## Blockers
- `pnpm check` 已完成全部 Vitest，随后 Node shell 集成测试因系统 Bash 3.2（要求 4.4+）失败；19 项 Node 测试中 18 通过。构建单独执行通过。
- Rust `generated_bash_input_preserves_hooks_and_emits_command_boundaries` 在 Bash 3.2 下缺少 array hook；`default_shell_routes_terminal_io_and_can_be_closed` 没有在等待时间内获得目标输出，单独重跑仍失败。此次未修改 Shell 初始化或 PTY 路径。
- 首次与 Rust 全量并发运行时 Git 预览语言解析测试超时，单独 10 项与随后完整 Vitest 均通过。
