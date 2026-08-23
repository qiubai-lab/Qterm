## Requirement

为工作区标签重排增加连续拖动和落点让位反馈；成功拖动非选中标签后自动进入该工作区，同时避免普通点击误触发拖动态。

## Scope

包含工作区标签手势状态、成功落位后的选中组合动作、点击隔离、拖动/落点样式及回归测试；不改变 reducer、工作区数据结构或键盘行为。

## Affected Files

- `src/workspace/WorkspaceShell.tsx`
- `src/app/styles/shell.css`
- `src/app/styles/lateOverrides.css`
- `src/app/App.test.tsx`
- `src/app/appStyles.test.ts`

## Design

使用 10px 滞后阈值，并要求水平位移大于竖向位移后才拾取标签。指针按下时记录每个标签槽位中心，拖动态用投影中心选择最近落点；源与目标之间的所有标签整体平移 `标签宽度 + gap`，在腾出的完整槽位上绘制主题色占位。有效拖动结束时在两帧无过渡提交阶段内同步 DOM 顺序与视觉槽位，然后组合派发排序和选中动作；工作区内容切换方向使用重排后的最终顺序。生成 click 仍被隔离；pointercancel 不排序也不切换工作区。

## Acceptance To Verification

- 阈值和方向判定：App 测试模拟轻微、竖向和水平移动。
- 连续反馈与落点：App 测试使用三标签跨位场景，断言 dragging、X 偏移、路径内完整槽位让位和唯一落点占位。
- 排序、选中与点击隔离：App 测试断言释放后 DOM 顺序改变、被拖标签成为活动项、内容方向与最终顺序一致，且生成 click/double-click 不触发重命名。
- 清理与动效契约：App 与 CSS 测试断言结束状态、transform、主题反馈和 reduced-motion。

## Test / Verification

- `pnpm vitest run src/app/App.test.tsx src/app/appStyles.test.ts`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm check`

## Documentation Updates

新增本 task spec 与 Standard plan；无需更新长期项目上下文或 Directory Map。
