## Requirement

为文件窗口增加平台修饰键多选和右键批量删除，同时保持既有文件打开、目录导航与单项菜单行为。

## Scope

包含本地/SFTP 文件列表选择集合、批量菜单、批量删除确认、错误反馈和状态栏选择数量；不包含后端批处理、Shift 区间选择、拖拽或其他批量动作。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`

## Design

新增路径集合承载多选，原单路径继续承担活动项与目录恢复。列表行根据修饰键切换集合；只有单独选中的文件才响应第二次普通点击预览。右键菜单从当前集合派生操作目标，多选时仅渲染批量删除。确认后逐项调用 `deleteEntry` 并统一刷新；失败项保留在确认状态以便重试。

## Acceptance To Verification

- 多选增减、普通单选和二次点击：组件行为测试。
- 右键已选/未选规则和精简菜单：组件行为测试。
- 批量确认与 API 调用/单次刷新：组件行为测试。
- 单项行为、导航和虚拟列表：运行既有 FileBrowserPane 测试。

## Test / Verification

- `pnpm vitest run src/files/FileBrowserPane.test.tsx`
- `pnpm check`

## Documentation Updates

本 plan 与对应 task spec 记录本次变更；无需长期项目上下文或 Directory Map 更新。
