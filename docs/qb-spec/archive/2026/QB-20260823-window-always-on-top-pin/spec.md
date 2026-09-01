---
id: QB-20260823-window-always-on-top-pin
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让用户可从程序右上角快速切换窗口始终置顶，并清楚看到当前置顶状态。

## Scope

- 在所有桌面平台的 head bar 右侧显示图针按钮。
- 点击图针切换当前窗口 always-on-top 状态。
- 激活时仅图针使用当前主题的导航强调色，按钮区域保持透明。
- 窗口控制 hover 框缩小为紧凑圆角样式；图针无论是否置顶，鼠标悬停时都显示 hover 框。
- hover 框使用真实边框而非合成阴影，窗口控制按钮不做缩放，避免透明 Windows 材质出现重绘残留。
- 补齐 Tauri 查询与设置置顶状态的窗口权限。

## Constraints

- 沿用现有窗口适配层、图标体系和窗口控制样式。
- macOS 保留原生窗口按钮，只新增右侧图针，不复制最小化/最大化/关闭按钮。
- 切换请求进行中禁用重复点击；失败时保持原状态。

## Non-Goals

- 不持久化置顶偏好到应用设置。
- 不改变窗口在所有工作区可见、任务栏显示或焦点策略。

## Acceptance

- Windows/Linux 右上角依次显示图针、最小化、最大化/还原、关闭按钮；macOS 右上角只显示图针。
- 图针具有动态可访问名称和 `aria-pressed` 状态。
- 点击后调用 Tauri always-on-top API，成功时切换 UI 状态，再次点击可取消。
- 激活静止态仅高亮图针，按钮背景和阴影保持透明；赛博主题图针显示黄色。
- 最小化、最大化、关闭和图针使用一致的紧凑圆角 hover 框，置顶图针在 hover 时继续保持主题色。
- 反复置顶和取消置顶后，图针周围不应出现强调色像素残留。
- Tauri capability 仅新增所需的查询与设置权限。

## Acceptance To Verification

- App 行为测试覆盖平台按钮排列、置顶/取消置顶及 ARIA 状态。
- 样式测试覆盖主题高亮、hover 与 focus-visible。
- 配置断言覆盖两项 Tauri 窗口权限。
- 运行相关 Vitest 与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

推荐由 `WorkspaceShell` 持有临时窗口状态，通过 `src/lib/tauri/window.ts` 的薄适配函数访问 Tauri。相比引入全局设置状态，这与当前最小化/最大化控制保持同一边界，且不会把运行时窗口属性误当作持久化偏好。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（无目录或模块职责变化）
