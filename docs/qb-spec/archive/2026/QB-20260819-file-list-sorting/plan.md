---
id: QB-20260819-file-list-sorting
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

文件列表表头支持按名称、大小、修改时间进行升序、降序和默认顺序切换。

## Scope

仅修改文件浏览组件、相邻样式和测试；不修改后端、IPC 或目录结构。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

在组件内维护单一排序状态。默认态直接使用原数组；活动态复制并稳定排序，先按目录类型分组，再按活动字段比较。表头使用原生按钮并显示方向符号，提示下一次点击动作。

## Acceptance To Verification

- 三态与列切换：组件交互测试。
- 名称、大小、时间及空时间规则：组件交互测试。
- 紧凑布局、焦点和活动态：样式断言。
- 基础完整性：`pnpm check`。

## Test / Verification

1. 先新增排序行为测试并确认其在实现前失败。
2. 实现排序状态、比较器、表头按钮和样式。
3. 运行 `pnpm test -- src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts`。
4. 运行 `pnpm check`。

## Documentation Updates

本计划和对应 task spec 已记录；无需更新长期项目上下文或 Directory Map。
