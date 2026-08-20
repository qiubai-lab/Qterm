# Windows Local File Navigation

## Goal

Windows 用户从右侧文件管理入口打开本机文件时进入用户主目录，并能从盘符根目录浏览其他当前可见盘符，同时只看到适合用户阅读的 Windows 路径。

## Scope

- 右侧文件管理入口和文件连接切回本机时，以用户主目录为初始位置。
- Windows 本地文件浏览支持“本机”位置视图，列出当前系统可见的逻辑盘符。
- 从盘符根目录返回时进入“本机”，并可选择其他盘符继续浏览。
- 普通 Windows canonical path 不向 UI 暴露 `\\?\`；UNC 和必须保留扩展语法的路径继续保持可操作。
- Windows 路径的父级、展示和根目录判断获得自动化回归覆盖。

## Constraints

- 不改变远程 SFTP 路径语义。
- 不修改 workspace 持久化 schema；“本机”是文件窗格内的瞬时位置状态。
- 后端负责主目录解析、路径规范化与盘符枚举，前端负责位置视图与展示文本。
- 保留现有文件窗格的紧凑布局、键盘语义和滚动所有权。

## Non-Goals

- 不实现完整的 Windows Explorer 功能、卷容量或卷标展示。
- 不改变系统文件选择器与文件传输流程。
- 不重构现有本地文件 command/application 分层。

## Acceptance

1. 点击右侧“文件管理”后，本地文件窗格加载当前用户主目录而不是进程工作目录。
2. Windows 用户可到达盘符根目录，并从根目录返回到“本机”盘符列表后切换到其他盘符。
3. 普通磁盘路径与 UNC 路径以用户可读格式显示，不暴露不必要的 `\\?\` 前缀。
4. 超长或特殊 Windows 路径仍使用真实操作路径，不因展示格式化而损坏。
5. 远程 SFTP 导航、文件创建与现有列表行为不回归。

## Acceptance To Verification

- 1：`openFileWindowAction`、本机连接切换测试和 Rust 主目录解析测试。
- 2：Rust 盘符枚举测试、`parentPath` 边界测试和 `FileBrowserPane` 盘符视图组件测试。
- 3、4：Windows 路径格式化单元测试及 Rust canonical path 测试。
- 5：`FileBrowserPane` 聚焦测试、`pnpm check` 和 Rust fmt/clippy/test。

## Open Questions

- 无。用户已采纳带“本机”位置视图的方案。

## Recommended Approach

用 `~` 表达本地用户主目录意图，Rust 在文件系统边界展开并通过 `dunce::canonicalize` 返回最兼容的真实路径；新增只读的本机位置 IPC 枚举 Windows 逻辑盘符。前端保留真实路径用于 IPC，使用纯函数负责路径展示和父级判断，并将“本机”作为非持久化位置视图。

## Next Skills

- `writing-qb-plans`（Standard）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（未新增顶层目录、模块边界或持久化入口）
