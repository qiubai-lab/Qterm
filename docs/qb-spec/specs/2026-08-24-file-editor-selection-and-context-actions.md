## Goal

文件编辑器中的文本选择清晰可辨，文件管理器右键操作完整、主题一致，并允许把预览图片复制到系统剪贴板。

## Scope

- 修复 CodeMirror 活动行背景遮挡文本选择背景的问题。
- 使用现有主题语义色设计活动行、文本选择和文件右键菜单状态。
- 为文件夹补“打开”，为文件和文件夹菜单项补语义图标与键盘方向导航。
- 为图片文件菜单和图片预览右键菜单增加“复制图片”。
- 图片预览菜单同时提供“复制路径”，并展示不改变布局的操作反馈。
- 为主窗口增加最小的剪贴板图片写权限。

## Constraints

- 复用现有 `Icon`、主题 token、文件操作与上下文菜单定位逻辑。
- 不读取剪贴板，不引入新的剪贴板依赖，不新增自定义 Rust IPC 命令。
- 图片解码与 Tauri 图片资源转换封装在 `lib/tauri` adapter，UI 只编排用户动作和反馈。
- 保留右键菜单的 Escape、Shift+F10 和视口边缘定位行为。

## Non-Goals

- 不实现剪切、粘贴或跨目录移动。
- 不增加操作系统原生文件菜单。
- 不修改文件传输、删除或保存语义。

## Acceptance

- 编辑模式下，活动行内的非空文本选择保持清晰可见；活动行仍有克制的主题背景。
- 文件夹菜单包含“打开”；文件菜单保留预览、编辑等既有能力。
- 菜单项具有语义图标，并支持 ArrowUp、ArrowDown、Home、End 和 Escape。
- 图片列表项及图片预览的右键菜单都能复制实际图片到系统剪贴板。
- 图片复制成功或失败均提供可访问反馈，且不改变预览布局。
- capability 只新增 `clipboard-manager:allow-write-image`，不新增图片读取权限。
- 聚焦测试、`pnpm check` 和 Rust 检查通过。

## Acceptance To Verification

- 样式契约测试验证活动行使用透明混色，selection 使用主题 token 和可见边缘。
- FileBrowserPane 测试验证文件夹打开、图标、方向键导航以及图片复制成功/失败反馈。
- clipboard adapter 测试验证浏览器图片转 RGBA、Tauri 资源写入和资源释放。
- capability 测试验证最小权限集合。
- 运行聚焦 Vitest、`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Open Questions

无；“完善右键菜单”按现有能力缺口收敛为打开、图标、键盘导航和图片复制，不扩展到剪切/粘贴。

## Recommended Approach

方案 A（采纳）：保留现有 DOM 菜单，补齐语义项、图标、键盘 roving focus 和图片预览菜单；通过独立 Tauri adapter 将浏览器解码后的 RGBA 写入剪贴板。改动局部、跨平台能力明确、测试边界清晰。

方案 B：改用原生系统菜单。平台观感更原生，但动态状态、自动化测试和现有主题一致性成本更高，不采用。

方案 C：直接把图片编码字节传给插件。实现更短，但当前 Tauri image feature 不保证解码 JPEG/WebP/GIF，不能覆盖现有预览类型，不采用。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，本次不改变长期产品或领域规则。
- Directory Map：不需要，仅在既有 adapter 与文件功能目录内新增文件。
