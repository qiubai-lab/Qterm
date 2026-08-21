## Background

终端内容区当前显示 WebView 原生文本菜单，包含与终端无关的剪切、拼写和文本转换项。产品已确认改为 Qterm 自定义菜单，并采用平台兼容的剪贴板快捷键策略。

## Requirement

- 在终端内容区提供复制、粘贴、全选、清除终端缓冲区菜单。
- macOS 使用 Command+C/V；Windows 同时支持 Ctrl+Shift+C/V，并支持选区态 Ctrl+C 与 Ctrl+V；Linux 保留 Ctrl+Shift+C/V。
- 无选区 Ctrl+C 必须继续发送终端中断；Linux Ctrl+V 必须继续交给终端程序。
- 外部和内部复制的纯文本使用同一粘贴路径。
- 多行或超过 1000 字符的文本粘贴前确认。

## Non-Goals

- 不实现搜索、链接、目录和命令语义菜单。
- 不加入分屏、关闭、切换连接等标题栏动作。
- 不增加图片、HTML 或其他剪贴板权限。
- 不新增通用菜单抽象或依赖。

## Architecture Impact

- 交互状态保留在 `TerminalPanel`，通过已有 `WorkspaceProvider` 获取会话状态与清理动作。
- 为可测试性，将平台快捷键判断与菜单定位保留为终端域内的纯函数；不改变 Workspace reducer 或后端会话边界。

## Domain Model Impact

无。

## API Impact

- Tauri capability 新增 `clipboard-manager:allow-read-text`。
- 不修改应用公共 TypeScript/Rust API。

## Database Impact

无。

## Implementation Tasks

1. 扩展 `TerminalPanel` 测试替身，先覆盖选区、剪贴板、快捷键和菜单行为。
2. 在 `TerminalPanel` 接入系统纯文本剪贴板、自定义 xterm 按键处理和上下文菜单状态。
3. 实现多行/超长粘贴紧凑确认，保持选择区和终端焦点。
4. 在 `app.css` 增加复用现有菜单语言的终端菜单及确认层样式，包括 reduced motion/transparency。
5. 最小化新增 Tauri 纯文本读取权限。
6. 运行聚焦测试、前端完整检查和 Rust capability/config 相关检查。

## Acceptance To Verification

- 原生菜单被替代；鼠标、菜单键和 Shift+F10 可打开：`TerminalPanel.test.tsx`。
- 复制仅在有选区时启用并写入准确文本：`TerminalPanel.test.tsx`。
- 单行粘贴直接进入 xterm，多行/超长粘贴先确认且取消不输入：`TerminalPanel.test.tsx`。
- macOS、Windows、Linux 快捷键策略及 Ctrl+C 中断保留：纯函数/组件测试。
- 全选与清除只作用当前终端：`TerminalPanel.test.tsx` 和既有 Workspace 测试。
- 菜单关闭与焦点恢复、视口夹紧和 reduced-motion 样式：组件测试、样式断言和手工检查。
- 权限仅扩大到纯文本读取：配置 diff、`cargo check` 或等价 Rust 检查。

## Test Plan

- 先运行 `pnpm vitest run src/terminal/TerminalPanel.test.tsx`，确认新增测试在实现前失败。
- 实现后重跑聚焦测试。
- 运行 `pnpm check`。
- 从 `src-tauri` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 手工检查菜单在终端四角、分屏与选择区上的视觉和定位；若桌面运行环境不可用则明确记录。

## Rollback Plan

- 移除终端菜单/快捷键处理与相关样式、测试。
- 从 capability 删除 `clipboard-manager:allow-read-text`，恢复为仅写权限。
- 不涉及数据迁移或持久化回滚。

## Risks

- 错误截获 Ctrl+C/Ctrl+V 会破坏 Shell、vim/tmux 行为；以平台和选区状态测试保护。
- 菜单打开可能清除 xterm 选区或转移隐藏 textarea 焦点；显式保留选择并恢复焦点。
- 多行文本可能执行多条命令；确认层不显示敏感全文，取消路径不得调用 xterm paste。
- 缓存的 xterm 实例可能持有旧 React 回调；使用稳定代理并在卸载时清空。

## Documentation Updates

- 更新现有 task spec 的快捷键结论（已完成）。
- 不需要长期 project context 或 Directory Map 更新。
