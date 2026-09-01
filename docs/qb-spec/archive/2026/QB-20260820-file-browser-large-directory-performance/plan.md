---
id: QB-20260820-file-browser-large-directory-performance
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

降低大目录响应完成后的 React/DOM 渲染、滚动和位置恢复成本。

## Scope

实现无依赖固定行高虚拟列表和索引式位置恢复；不修改后端协议与目录数据上限。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本任务 spec 与 plan

## Design

- 小目录按原方式完整渲染；超过阈值后只挂载可见范围加 overscan。
- 保持 `.file-browser-content` 为唯一滚动容器，虚拟列表通过总高度占位，文件行绝对定位。
- 滚动范围仅跨过行边界时更新，避免每个滚动像素都产生不同 DOM 范围。
- 目录位置使用当前排序数组的路径索引计算，不扫描全部 DOM 节点。
- 虚拟行提供 `aria-posinset` 与 `aria-setsize`。

## Acceptance To Verification

- 有界 DOM：1000 项目录挂载的 `.file-row` 数量远低于总数。
- 中部访问：模拟滚动后中部条目出现，首部条目卸载。
- 导航连续性：大目录进入子目录再返回，新增前置项目后路径锚点偏移不变。
- 兼容性：现有文件浏览和样式测试通过。

## Test / Verification

1. 先添加大目录虚拟化与锚点恢复回归测试并确认旧实现失败。
2. 运行 `pnpm vitest run src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts`。
3. 运行 `pnpm check`。
4. 运行 `git diff --check` 并检查没有新增滚动容器或依赖。

## Documentation Updates

新增本任务 spec 与 Standard plan；不更新长期项目上下文或 Directory Map。
