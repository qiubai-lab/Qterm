# 全平台统一无边框标题栏实施计划

## Status

Completed on 2026-08-18；标题栏左右布局随后由 `2026-08-18-qterminal-titlebar-brand.md` 更新。无边框配置、拖动触发、排除交互区域和 Window API 映射继续有效。

## Background

Windows 已使用自定义无边框标题栏，但 macOS/Linux 仍走不同装饰策略；当前拖动属性只位于外层 header，实际铺满 header 的 Workspace navigation 不继承该属性，导致可见顶部栏无法拖动窗口。

## Requirement

所有桌面平台采用同一个无边框窗口和左置窗口控件，并修复标题栏空白区域无法拖动的问题。

## Non-Goals

- 不引入 Rust 自定义窗口 command。
- 不实现平台专属按钮、交通灯或系统菜单。
- 不改变 Workspace 与 session 模型。

## Architecture Impact

- `tauri.conf.json` 成为唯一窗口装饰策略，删除 `tauri.windows.conf.json`。
- `src/lib/tauri/window.ts` 删除平台识别，增加语义化 `startDraggingCurrentWindow`。
- `WorkspaceShell` 统一渲染控件，并只负责根据 DOM 命中区域决定是否请求拖动。

## Domain Model Impact

无。

## API Impact

继续使用 Tauri 内置 Window API；新增前端 adapter 映射 `startDragging`，对应权限已存在。

## Database Impact

无。

## Implementation Tasks

1. 先修改 App/window adapter 测试，覆盖统一控件顺序、空白区拖动、交互元素不误拖和 API 映射。
2. 将 `decorations: false` 与 resizable 配置移入通用 Tauri window 配置，删除 overlay/traffic lights 和 Windows override。
3. 删除平台判断，调整 DOM 为左侧 controls + Workspace navigation。
4. 在 header pointer down 中过滤 button/input/workspace tab 后显式调用 window adapter `startDragging`。
5. 更新统一 CSS、README、Decision 与 Directory Map。
6. 运行聚焦测试、`pnpm check`、`pnpm tauri build` 和 release 窗口检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 单一无边框配置 | 配置审查和 Tauri build。 |
| 控件统一左置 | App DOM 顺序测试和 release 截图。 |
| 拖动恢复 | App pointer 测试、window adapter 测试及 release 手工拖动。 |
| 交互不误拖 | 对窗口按钮和 Workspace 标签 pointer down 的负向断言。 |
| 标签行为不回归 | 既有 Workspace 往返切换测试与全量 Vitest。 |

## Test Plan

- `pnpm exec vitest run src/app/App.test.tsx src/lib/tauri/window.test.ts`
- `pnpm check`
- `pnpm tauri build`
- release：检查左侧 controls、无原生标题栏、拖动、resize、窗口动作。

## Rollback Plan

恢复平台 decorations 配置并移除显式 startDragging 入口即可；Workspace reducer、持久化和 session 不受影响。

## Risks

- Linux 窗口管理器对无边框 resize/shadow 支持存在差异，当前平台无法完整目视验证时需明确残余风险。
- macOS 用户不再看到原生交通灯，这是用户明确要求的统一策略。
- header 事件过滤不完整会造成按钮点击触发拖动；使用正向与负向组件测试保护。

## Documentation Updates

- `DECISIONS.md`：旧平台差异策略标记 superseded，新增统一无边框策略。
- `DIRECTORY_MAP.md`：删除 Windows override 入口，更新通用 Tauri 配置职责。
- `README.md`：改写窗口 chrome 说明。
