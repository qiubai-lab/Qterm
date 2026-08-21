## Goal

让用户可以在本地和远程文件窗口中选择多个项目，并通过一次右键操作安全地批量删除。

## Scope

- 使用 Command（macOS）或 Ctrl（Windows/Linux）点击/键盘激活文件或文件夹，增减多选集合。
- 普通点击恢复单选；单个文件保留第二次点击预览，文件夹保留双击打开。
- 右键已选项目保留多选，右键未选项目切换为该项目单选。
- 多选右键菜单仅提供批量删除，单选菜单保持现有功能。
- 批量删除仅确认一次，同时支持本地与 SFTP 项目。

## Constraints

- 复用现有 `deleteEntry`、确认弹窗、目录刷新和错误反馈路径。
- 文件夹删除继续采用现有递归删除语义；链接只删除链接本身。
- 不改变 Tauri 命令、后端文件服务或文件数据模型。
- 保持虚拟列表、目录位置恢复、排序和预览行为。

## Non-Goals

- 不增加 Shift 连续范围选择、框选、拖拽移动或批量下载/复制/改名。
- 不在本机根目录列表中提供删除操作。

## Acceptance

- Command/Ctrl 操作可增减多个文件与文件夹，普通点击恢复单选。
- 多选时右键菜单只显示无多余分隔线的批量删除动作。
- 批量删除弹窗明确显示数量和永久删除语义，并只确认一次。
- 每个选中路径调用一次现有删除 API，操作结束后仅刷新当前目录一次。
- 单项预览、文件夹打开、单项菜单和目录位置恢复行为不回归。

## Acceptance To Verification

- FileBrowserPane 测试覆盖多选切换、右键选择规则、批量菜单与确认删除。
- 既有文件窗口测试覆盖单项预览、导航、虚拟列表和单项菜单回归。
- 运行聚焦测试与 `pnpm check`。

## Open Questions

- 无阻塞问题；按连接管理器已采用的平台修饰键约定实现。

## Recommended Approach

保留 `selectedPath` 作为当前焦点与目录恢复锚点，新增 `selectedPaths` 作为批量集合。批量删除继续逐项调用现有 API，并在全部操作结束后统一刷新。该方案无需后端变更，比改造列表语义或新增批处理命令风险更低。

## Next Skills

- `writing-qb-plans`：Standard 计划。
- `protecting-critical-behavior`：保护永久删除和既有打开行为。
- `verifying-before-completion`：运行聚焦测试和完整前端检查。
- Directory Map: not needed；无目录或模块边界变化。
