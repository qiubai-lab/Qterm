## Requirement

右键菜单 hover 跟随主题色，head bar 空白区域双击稳定切换最大化/还原。

## Scope

包含四类右键菜单样式与应用顶栏事件处理；不改变危险项、禁用项、普通控件 hover 或原生窗口接口。

## Affected Files

- `src/app/styles/themes/dark.css`
- `src/app/styles/lateOverrides.css`
- `src/app/appStyles.test.ts`
- `src/workspace/WorkspaceShell.tsx`
- `src/app/App.test.tsx`

## Design

通过 `--menu-hover-background` 和 `--menu-hover-text` 映射现有主题 primary action 色彩，由共享 late override 覆盖四种 context menu 的普通可用项。head bar 在现有交互目标判定之后建立短生命周期指针手势：5px 内释放记为点击，350ms 与 5px 范围内的第二次按下切换最大化；移动达到 5px 则立即清理点击候选并调用原生拖动。组件卸载时清理全局指针监听。

## Acceptance To Verification

- 主题菜单 hover：样式测试断言语义变量与共享选择器。
- 危险/禁用状态：样式选择器显式排除，并由样式测试锁定。
- 双击切换：App 行为测试以 `detail: 0` 的两次静止点击断言一次 toggle，并用第二组静止点击覆盖还原。
- 拖拽保留：App 行为测试断言阈值内移动不拖拽、达到阈值后只启动一次原生拖动。
- 交互区域隔离：App 行为测试断言窗口按钮和工作区标签双击不触发 toggle。

## Test / Verification

- `pnpm vitest run src/app/App.test.tsx src/app/appStyles.test.ts`
- `pnpm check`

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期项目上下文或 Directory Map。
