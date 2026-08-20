# 终端缓冲保留与连接选择器强调 Task Spec

Status: Complete (2026-08-19)

## Goal

创建或重排分割终端时保留原终端的完整 xterm 缓冲区，并让标题栏连接选择入口在视觉上居中、清晰且易于识别。

## Scope

- 保留同一 Block、同一连接目标在布局结构变化前后的 xterm 实例与 scrollback。
- 真正关闭 Block 或切换本地/SSH 目标后及时销毁旧终端视图。
- 重构连接选择器触发器：胶囊式容器、独立下拉图标区、内容垂直居中和更明确的交互状态。
- 为下拉菜单加入从触发器锚点展开的轻量进入效果及 reduced-motion 降级。

## Constraints

- 不复制终端输出到 React state，不序列化或持久化终端缓冲。
- 不改变 PTY/SSH 会话、工作区持久化 schema 或 split layout 数据结构。
- 布局重排期间不得重复创建 xterm、重复注册输入监听或截断 scrollback。
- 高频点击反馈应短促，菜单动效不超过 180ms，并支持键盘 Escape 与 reduced motion。

## Non-Goals

- 不在应用重启后恢复终端缓冲。
- 不改变 xterm 的 8000 行 scrollback 上限。
- 不重新设计整个 Terminal Block 标题栏或连接管理对话框。

## Acceptance

1. 已产生多屏输出的终端在左右/上下分割后仍可滚动查看分割前的全部缓冲。
2. 布局结构重排复用同一终端实例；关闭 Block 或切换连接目标后旧实例会被销毁。
3. 连接选择按钮在 29px 标题栏内垂直居中，名称与下拉图标均清晰可见。
4. 下拉图标具有独立视觉区域，hover、展开和按压状态能明确表达“可选择连接”。
5. 菜单锚定触发器展开，Escape/外部点击关闭与 reduced-motion 行为保持可用。
6. 聚焦回归测试、`pnpm check` 和本地视觉/行为验证通过。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1, 2 | TerminalPanel 生命周期测试断言布局重排只创建一个 xterm，最终关闭才 dispose；桌面多屏输出后分割手工验证。 |
| 3, 4 | 选择器组件测试、浏览器几何/样式测量和截图。 |
| 5 | 现有选择器行为测试扩展 Escape；浏览器检查菜单位置与 reduced-motion CSS。 |
| 6 | 聚焦 Vitest、`pnpm check`、`git diff --check`。 |

## Open Questions

无。

## Verification Evidence

- TerminalPanel 回归测试确认布局重挂载复用同一 xterm，切换目标和最终关闭会释放旧实例。
- 连接选择器测试确认图标结构、选择行为与 Escape 关闭。
- 浏览器截图与可访问性树确认入口、菜单和展开状态正常。
- `pnpm check`：13 个测试文件、32 项测试全部通过，TypeScript 与 Vite 构建通过。
- `git diff --check` 通过（仅 Git 提示现有 Windows 行尾转换，无空白错误）。

## Recommended Approach

方案 A：在 TerminalPanel 模块内按稳定 session key 托管 xterm view，卸载时延迟到下一任务再销毁；同一 React commit 内重挂载则取消销毁并复用实例。方案 B：把全部终端输出镜像到 React/Provider state，再重建 xterm 时回放。推荐方案 A，因为它保留 xterm 原生 buffer、selection、viewport 和解析状态，内存只保留一份；方案 B 会重复存储大量输出并引入回放和控制序列一致性风险。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；这是局部生命周期回归修复和视觉优化。
- Directory Map: not needed；职责仍位于现有 terminal/workspace 模块，不改变目录边界。
