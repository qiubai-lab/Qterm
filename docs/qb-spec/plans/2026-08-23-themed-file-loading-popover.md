## Requirement

> 实施状态：已完成（2026-08-23）。

把文件读取加载状态改为主题化的居中小浮层。

## Scope

统一文件内容和目录相关加载入口；不改变读取逻辑、错误态或空状态。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/fileBrowser.css`
- `src/files/FileBrowserPane.test.tsx`
- `src/app/appStyles.test.ts`
- `src/app/styles/lateOverrides.css`
- 本 spec 与 plan

## Design

`FileLoadingState` 输出一个占满所属内容区的居中状态容器，内部使用 `--floating-material`、`--floating-border` 和语义文字色；纯 CSS spinner 使用 accent，reduced motion 时静止。

## Acceptance To Verification

- 五处读取入口统一组件 → 源码断言与组件加载态测试。
- 居中浮层及主题角色 → 样式测试。
- 无障碍回退 → reduced-motion/reduced-transparency 样式断言。

## Test / Verification

1. 更新相邻测试并确认旧实现失败。
2. `pnpm vitest run src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts --maxWorkers=1`
3. `pnpm check`
4. `git diff --check`

## Documentation Updates

新增本 task spec/plan；无需更新长期 context 或 Directory Map。

Plan Level：Standard。
