---
id: QB-20260824-terminal-p0-interactions
status: archived
archived: 2026-09-02
legacy: true
---
# 终端 P0 键盘、搜索与会话操作 Task Spec

Status: Complete (2026-08-24)

## Goal

让用户在终端保持输入焦点时，仍可安全地搜索输出、创建和切换工作区、分割并聚焦终端，同时能明确取消、断开和重新建立当前终端会话，且不破坏 Shell、vim、tmux 的常用控制键语义。

## Scope

- 建立可测试的跨平台应用快捷键解析层，统一 Workspace、分割和终端搜索命令。
- macOS 使用 Command 组合键；Windows/Linux 在终端作用域使用 Ctrl+Shift 组合键，避免占用 Ctrl 控制字符。
- 终端搜索支持打开、下一个、上一个、结果计数、无结果状态、Escape 关闭和焦点恢复。
- 分割、Workspace 切换、关闭活动 Block 后，将焦点交给新的活动 Terminal Block；文件和网络 Block 不被强制抢焦点。
- Terminal Block 右上角提供稳定的搜索入口；远程断开收纳到目标主机概要卡片，重新连接紧贴 `closed`/失败状态，本地停止/启动与连接取消也贴近状态；破坏活动会话前要求确认。
- 文件与网络 Block 复用同一远程生命周期：概要卡片内断开、连接进度旁取消、关闭/失败状态旁重连，并由各自 Provider 会话边界执行。
- 主机概要复制按钮在“复制主机地址/已复制”状态切换时保持固定宽度；终端搜索浮层在 Block 内光学居中，并提供明确的输入主层级、聚焦反馈和辅助功能降级。
- README 与按钮提示使用实际平台兼容的快捷键说明。

## Constraints

- 未匹配的按键必须继续交给 xterm 和终端程序；不得破坏无选区 Ctrl+C、中断、EOF、行编辑、IME 或备用屏幕应用。
- 搜索使用 xterm 公共 addon/API，不读取或推断 xterm 私有 DOM 缓冲结构。
- 会话生命周期继续由 WorkspaceProvider 编排；UI 不直接调用 Tauri session IPC。
- 复用现有 Qterm token、Icon、DialogFrame 和紧凑终端样式，不引入 UI 或动画框架。
- 终端锁定和顶层弹窗期间不得执行终端操作快捷键。

## Non-Goals

- 不实现用户自定义快捷键、命令面板或快捷键设置页。
- 不实现 URL 链接、回滚导航、Shell Integration、命令块识别或广播输入。
- 不重新加入 Terminal Block 最大化。
- 不改变 SSH、PTY、Workspace 持久化 schema 或后端 API。

## Acceptance

1. 终端聚焦时，安全的应用快捷键可执行；Ctrl+C、Ctrl+D、Ctrl+K 等未匹配控制键仍进入终端。
2. 新建/切换 Workspace、横纵分割的快捷键按平台解析，锁屏和表单编辑状态遵守既有隔离规则。
3. 搜索条不会改变终端布局尺寸；在 Terminal Block 顶部居中、输入区具有清晰视觉重点，并支持前后匹配、计数、空结果、Escape、焦点恢复、减少动态/透明度和高对比度偏好。
4. 活动 Terminal Block 发生分割、Workspace 切换或关闭后，输入焦点与活动外框保持一致。
5. 终端、远程文件与网络窗口连接中可以取消；活动会话断开前确认；远程断开位于目标主机概要卡片；关闭/失败状态的重新连接紧随状态文本；复制状态变化不改变按钮宽度；右上角搜索可打开同一个终端搜索界面。
6. 快捷键提示和 README 不再把 macOS 符号硬编码给 Windows/Linux，也不再宣称支持 Block 最大化。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1, 2 | 快捷键纯函数单测与 WorkspaceShell 组件测试，覆盖平台、精确修饰键、终端焦点、锁屏和表单。 |
| 3 | TerminalPanel 测试覆盖搜索 addon 调用、前后查找、结果状态、Escape 与焦点恢复；浏览器实测默认与紧凑视口的中心坐标和视觉层级。 |
| 4 | WorkspaceShell/TerminalPanel 集成替身测试覆盖活动 Block 变化后的聚焦请求。 |
| 5 | HostIdentity、TerminalTargetPicker、LayoutView、WorkspaceShell 与 WorkspaceProvider 测试覆盖固定宽度复制、三类 Block 的卡片内断开、状态旁重连/取消、确认路由和本地重启。 |
| 6 | 源码/README 搜索与前端完整 `pnpm check`。 |

## Open Questions

无。默认采用保守的终端安全快捷键；后续快捷键设置页可覆盖默认值。

## Recommended Approach

方案 A 是在现有 window keydown 中继续追加条件，改动少，但终端焦点、平台冲突、提示和测试仍会分散。方案 B 是引入轻量纯函数命令解析器，由 WorkspaceShell 捕获应用命令、TerminalPanel 处理搜索和剪贴板，并用显式终端焦点注册衔接布局变化。推荐方案 B：边界清楚、容易测试，也不需要通用 command framework。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed；不改变长期产品目标或领域规则。
- Directory Map: not needed；只在既有 `terminal/` 与 `workspace/` 职责内增加局部模块。

## Verification Evidence

- 聚焦回归：关键搜索、主机概要、Layout、Shell 与 Provider 测试通过，覆盖搜索、快捷键、焦点、固定宽度复制、三类 Block 会话动作位置与断开确认。
- 完整门禁：`pnpm check` 通过；ESLint 零警告，58 个测试文件、469 项测试通过，TypeScript 检查与 Vite 生产构建通过。
- 浏览器视觉验证：默认视口下搜索浮层与 Terminal Block 中心均为 `609px`；紧凑 `520px` 视口下均为 `239px`，确认居中、主输入层级与响应式宽度。
- 简化样式复验：搜索条收敛为 `360×34px` 单层结构；在宽 `588px` 的紧凑 Terminal Block 中，搜索条与 Block 中心均为 `299px`，且不再依赖百分比位移变换。
- 输入垂直对齐复验：隔离全局表单的 `5px` 上边距与聚焦阴影后，搜索条和输入框的纵向中心均为 `98px`；新增样式回归测试固定 `margin: 0`、`box-shadow: none`、原生外观清除和 `24px` 行高。
- 差异检查：`git diff --check` 通过，仅报告仓库既有的 LF/CRLF 工作区提示。
- 原生打包：未运行；本任务未改变 Rust、Tauri 配置、原生依赖或发布打包，符合仓库验证约定。
- Project Context：无需更新；本任务没有改变长期产品目标、领域规则或架构边界。
- Directory Map：无需更新；新增模块仍位于既有 `app/`、`terminal/` 与 `workspace/` 所有权边界内。
