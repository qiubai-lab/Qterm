# macOS 原生标题栏实施计划

## Status

Completed on 2026-08-22. 聚焦测试、`pnpm check`、macOS release build 与原生窗口目视检查通过。

## Requirement

仅在 macOS 恢复原生交通灯，并调整 Qterm 顶栏避让系统窗口控制；Windows/Linux 保持当前无边框标题栏。

## Scope

新增 macOS 平台窗口配置，给现有 Shell 增加平台语义和对应样式，更新相关组件测试与长期文档。不新增应用菜单、Workspace 状态或后端业务能力。

## Affected Files

- `src-tauri/tauri.macos.conf.json`
- `src/lib/tauri/window.ts`
- `src/lib/tauri/window.test.ts`
- `src/workspace/WorkspaceShell.tsx`
- `src/app/app.css`
- `src/app/App.test.tsx`
- `src/workspace/WorkspaceShell.test.tsx`
- `docs/qb-spec/context/DECISIONS.md`
- `docs/qb-spec/DIRECTORY_MAP.md`
- 当前 task spec 与 plan

## Design

Tauri 的 macOS 平台配置将主窗口数组替换为与通用配置相同的尺寸和效果，但开启 `decorations`、使用 `Overlay` title bar、隐藏系统标题文字并把交通灯对齐到 40px 顶栏。`window.ts` 统一识别桌面平台；Shell 在 macOS 标注 `data-platform`、保留品牌与标签，只不渲染右侧仿 Windows 窗口按钮。CSS 为原生交通灯留出左侧安全区。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| macOS 使用原生交通灯 | 平台配置审查、Tauri macOS build、release 目视检查 |
| 交通灯不遮挡顶栏内容 | macOS DOM/CSS 断言与 release 目视检查 |
| macOS 不重复显示窗口按钮 | App 平台分支组件测试 |
| Windows/Linux 保持应用内控制 | 非 macOS App 测试与窗口 adapter 测试 |
| Workspace 与锁屏行为不回归 | 聚焦 App/WorkspaceShell 测试和 `pnpm check` |

## Test / Verification

1. 更新测试覆盖 macOS 与非 macOS 顶栏结构。
2. 运行 `pnpm exec vitest run src/app/App.test.tsx src/workspace/WorkspaceShell.test.tsx src/lib/tauri/window.test.ts`。
3. 运行 `pnpm check`。
4. 运行 `pnpm tauri build --bundles app`，并启动 `.app` 产物检查原生交通灯、拖动与内容避让。

## Documentation Updates

将“全平台统一无边框”决策标记为被平台自适应策略取代，新增当前 accepted 决策；Directory Map 登记 `tauri.macos.conf.json`。无领域或产品长期上下文变化。
