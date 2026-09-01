---
id: QB-20260823-theme-tooltip-and-initial-paint-stability
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

> 实施状态：已完成（2026-08-23）。

修复连接状态气泡的跨主题适配，以及网络代理开关和设置图标的首帧亚像素偏移。

## Scope

- 主题化连接状态气泡。
- 稳定对话框及代理开关的初始绘制几何。
- 增加相邻样式回归保护。

非目标：不改组件状态、IPC、持久化或页面结构。

## Affected Files

- `src/terminal/terminalSurface.css`
- `src/network/network.css`
- `src/components/dialogs/dialogFrame.css`
- `src/components/dialogs/settingsDialog.css`
- `src/app/appStyles.test.ts`
- 本 spec 与 plan

## Design

气泡使用 shared floating material 与状态语义色。DialogFrame 使用 opacity-only 的短入场动画，避免 scale/translate 令内部小型图标落在亚像素坐标。代理开关使用固定盒模型和绝对定位滑块，只在 checked 状态改变水平 transform。

## Acceptance To Verification

- 主题气泡 → 断言背景、边框、标题、端点均使用主题角色。
- 稳定开关 → 断言轨道为 relative、滑块 absolute 且 top/left 固定，checked 仅 translateX。
- 稳定设置图标 → 断言图标容器固定尺寸、SVG block rendering，dialog-in 不含 transform。
- 无障碍与完整性 → focused tests、完整 `pnpm check`。

## Test / Verification

1. 先更新 `appStyles.test.ts` 并确认旧样式无法满足新增断言。
2. `pnpm vitest run src/app/appStyles.test.ts src/components/ConnectionRouteProgress.test.tsx --maxWorkers=1`
3. `pnpm check`
4. `git diff --check`

## Documentation Updates

新增本 task spec/plan。Project Context 与 Directory Map 不需要更新。

Plan Level：Standard。
