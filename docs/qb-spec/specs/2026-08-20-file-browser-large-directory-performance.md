## Goal

大目录加载完成后，文件窗口保持响应，滚动与目录导航不会因为一次性创建数千个文件行而明显卡顿。

## Scope

- 对较大的文件列表启用固定行高虚拟渲染，只挂载视口附近的文件行。
- 保持当前唯一滚动容器、表头、排序、选择、打开、上下文菜单和目录状态栏行为。
- 将返回/前进的位置恢复从 DOM 行扫描改为路径到索引的计算。
- 仅格式化当前挂载行的大小、权限和日期。

## Constraints

- 不新增前端依赖。
- 不修改 Rust 目录读取、SFTP 或 IPC 契约。
- 文件行维持 27px 高度和现有紧凑视觉样式。
- 小目录继续完整渲染，避免没有必要的无障碍与键盘行为变化。

## Non-Goals

- 后端分页、增量 SFTP 协议或 Windows 元数据并发读取。
- 文件搜索、过滤或新的键盘导航模型。

## Acceptance

1. 目录超过虚拟化阈值时，DOM 中的文件行数量由视口与 overscan 决定，而不是目录总项数。
2. 滚动到大目录中部后，对应文件行能够被渲染并保持现有点击、双击和菜单语义。
3. 从大目录进入子目录再返回时，即使父目录锚点前新增项目，原锚点仍保持相同视口偏移。
4. 小目录、盘符根目录、排序、状态统计和文件操作行为保持不变。

## Acceptance To Verification

- 1、2：组件测试构造 1000 项目录，断言挂载行数有界并能滚动到中部项目。
- 3：组件测试在返回结果中向锚点前插入一项，断言滚动位置按路径索引调整。
- 4：运行现有文件浏览测试与完整 `pnpm check`。

## Open Questions

- 无阻塞问题；若 IPC 解析或后端读取仍占主导，后续独立评估分页与元数据并发。

## Recommended Approach

在 `FileBrowserPane` 内实现固定 27px 行高的 feature-local 虚拟列表。小目录完整渲染；大目录根据 `.file-browser-content` 的 `scrollTop`、可用高度和 overscan 计算挂载范围。位置缓存保存路径锚点和偏移，恢复时通过当前排序结果中的路径索引直接计算 `scrollTop`，不依赖锚点 DOM 已挂载。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
