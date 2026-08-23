## Goal

> 实施状态：已完成（2026-08-23）。

将文件读取与预览加载状态统一为内容区中央、跨主题清晰可读的紧凑浮层。

## Scope

- 提供文件域内共享的 `FileLoadingState`。
- 覆盖文件内容、Markdown、编辑器、本机位置与文件夹读取状态。
- 使用主题浮层、语义文字和轻量旋转指示器。
- 保持加载状态的 `role=status` 与实时播报。

## Constraints

- 加载层不改变工具栏或内容区尺寸。
- 不阻断读取逻辑，不新增依赖。
- 支持 reduced motion 与 reduced transparency。

## Non-Goals

- 不改变错误、空状态和传输进度样式。
- 不调整文件读取、缓存或 Tauri IPC。

## Acceptance

- 所有文件读取状态显示在所属内容区域中央的小浮层中。
- 浮层在 Light/Dark 下使用主题材质且文字清晰。
- 加载指示器只表达进行中状态，并在 reduced motion 下停止旋转。
- 加载文案继续通过可访问状态区域播报。

## Acceptance To Verification

- 组件结构与语义 → `FileBrowserPane.test.tsx`。
- 居中、主题材质和无障碍回退 → `appStyles.test.ts`。
- 完整回归 → focused tests 与 `pnpm check`。

## Open Questions

无。

## Recommended Approach

使用文件域内共享组件替换五处纯文字加载态，容器负责居中，内部小浮层负责主题材质和加载指示。避免把加载状态泛化为全局模态组件。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context：不需要。
- Directory Map：不需要。
