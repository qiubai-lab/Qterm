# Windows Local File Navigation

## Goal

Windows 用户从右侧文件管理入口打开本机文件时进入用户主目录，并能从盘符根目录浏览其他当前可见盘符，同时只看到适合用户阅读的 Windows 路径。

## Scope

- 右侧文件管理入口和文件连接切回本机时，以用户主目录为初始位置。
- Windows 本地文件浏览在虚拟根目录中列出当前系统可见的逻辑盘符；盘符复用普通文件夹行，不增加专用入口或特殊列表样式。
- 从盘符根目录返回时进入虚拟根目录，并可像打开普通文件夹一样切换到其他盘符。
- 普通 Windows canonical path 不向 UI 暴露 `\\?\`；UNC 和必须保留扩展语法的路径继续保持可操作。
- 文件窗格从本机切换到远程连接时以 `.` 请求 SFTP 会话初始目录，并使用服务端 canonicalize 返回的绝对 home 路径；切换前尚未完成的本地目录请求不得回写远程窗格路径。
- Windows 路径的父级、展示和根目录判断获得自动化回归覆盖。

## Constraints

- 不改变远程 SFTP 路径语义。
- 不修改 workspace 持久化 schema；虚拟根目录是文件窗格内的瞬时位置状态。
- 后端负责主目录解析、路径规范化与盘符枚举，前端负责位置视图与展示文本。
- 保留现有文件窗格的紧凑布局、键盘语义和滚动所有权。

## Non-Goals

- 不实现完整的 Windows Explorer 功能、卷容量或卷标展示。
- 不改变系统文件选择器与文件传输流程。
- 不重构现有本地文件 command/application 分层。

## Acceptance

1. 点击右侧“文件管理”后，本地文件窗格加载当前用户主目录而不是进程工作目录。
2. Windows 用户可到达盘符根目录，并从根目录返回到盘符列表后切换到其他盘符；盘符行的布局、图标和交互与普通文件夹一致，导航栏不显示专用“本机”按钮。
3. 普通磁盘路径与 UNC 路径以用户可读格式显示，不暴露不必要的 `\\?\` 前缀。
4. 超长或特殊 Windows 路径仍使用真实操作路径，不因展示格式化而损坏。
5. 从 Windows 本地文件切换到远程 SFTP 后不把字面量 `~` 发送给 SFTP；连接成功后以服务端返回的绝对 home 路径（如 `/home/dev`）显示和继续导航。旧本地请求即使晚完成也不能把盘符路径写入远程文件窗格。
6. 远程 SFTP 导航、文件创建与现有列表行为不回归。

## Acceptance To Verification

- 1：`openFileWindowAction`、本机连接切换测试和 Rust 主目录解析测试。
- 2：Rust 盘符枚举测试、`parentPath` 边界测试和 `FileBrowserPane` 普通文件夹行组件测试。
- 3、4：Windows 路径格式化单元测试及 Rust canonical path 测试。
- 5：文件目标切换测试断言远程入口为 `.`，`FileBrowserPane` 测试断言 SFTP canonical listing 将路径更新为绝对 home；workspace reducer 继续覆盖过期本地路径隔离。
- 6：`FileBrowserPane` 聚焦测试、`pnpm check` 和 Rust fmt/clippy/test。

## Open Questions

- 无。用户已确认盘符使用默认文件夹列表样式，并要求隔离本机与远程路径状态。

## Recommended Approach

本地用 `~` 表达用户主目录意图，由 Rust 本地文件系统边界展开；远程恢复原有的 `.` 入口，由 SFTP `canonicalize` 解析为服务端绝对 home。相比新增“查询远程 home”IPC，这一方案复用既有目录读取返回的 canonical path，改动更小且不会假设 shell 展开规则。前端将盘符转换成只读目录条目并复用标准 `FileRow`。workspace 路径更新携带目标 profile 身份，reducer 仅接收与当前文件目标一致的更新；文件目标变化时重新挂载浏览器，清除旧请求与瞬时列表状态。

## Next Skills

- `writing-qb-plans`（Standard）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed（未新增顶层目录、模块边界或持久化入口）
