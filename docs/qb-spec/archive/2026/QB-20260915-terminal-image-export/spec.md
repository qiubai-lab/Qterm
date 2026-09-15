---
schema: 1
id: QB-20260915-terminal-image-export
type: feature
tier: standard
status: archived
created: 2026-09-15
updated: 2026-09-15
supersedes: []
---

# Terminal selection image export

用户在本任务中批准开发：选中行完整导出、固定原终端宽度；上方 macOS/Linux/Windows 样式，左侧系统三主题，中央预览；每次默认当前主题；仅复制图片与保存 PNG。

## Behavior Delta

### ADDED
- REQ-001: 右键及键盘终端菜单提供“导出选中行为图片…”，无选区时禁用；复制文本保持原选区语义。
- REQ-002: 导出选区触及的完整屏幕行，末端首列不包含空终止行；保留全部列、空格、空行、软换行、宽字符与终端样式；内容及宽度在打开预览时冻结。
- REQ-003: 预览上方仅 macOS/Linux/Windows 样式，左侧仅深色/浅色/赛博朋克主题；默认当前系统风格、当前应用主题；样式不改变列布局，主题不改变应用。
- REQ-004: PNG 统一 2× 清晰度；复制与保存使用同一生成结果；原生保存可取消，失败可重试，不静默裁切超限图片。
- REQ-005: 预览独立滚动，操作区固定，键盘导航/焦点恢复可用，异步结果不覆盖更新的样式或已关闭弹窗。

## Acceptance
- AC-001 [REQ-001]: 无选区禁用，有选区导出，文本复制与菜单键盘回归通过。
- AC-002 [REQ-002]: 真实 xterm 缓冲区测试覆盖部分文本/跨视口/换行/宽字符/ANSI/空行/终点；输出变化后快照不变。
- AC-003 [REQ-003]: 仅 3×3 选择，每次当前主题默认，主题切换不修改根主题，三风格图片同宽同正文排版。
- AC-004 [REQ-004]: 复制释放原生资源；保存 PNG 有界校验和原子写入，取消无写入，失败反馈可重试。
- AC-005 [REQ-005]: 异步过期结果释放、关闭恢复焦点、短窗口/长图预览与固定操作区验证。

## Implementation / boundaries
- [x] 从 TerminalPanel 提取终端菜单展示及键盘交互 owner，热点不得增长；新增模块低于默认 source-size 限制。
- [x] src/terminal/imageExport/ 拥有行快照、颜色解析/Canvas 绘制、图片生成状态与弹窗；仅菜单入口接入 TerminalPanel。
- [x] 三套 CSS 增加隔离采样作用域，复用 terminalTheme 与共享 DialogFrame/Button/OverlayScrollArea。
- [x] src/lib/tauri/ 负责图片复制/PNG 保存适配；Rust command 拥有系统路径选择，infrastructure 负责 PNG 校验及原子落盘，无会话或持久设置变更。
- [x] 定向行为测试、pnpm check、Rust fmt/clippy/test 与浏览器视觉验证；更新 Directory Map。

架构 gate：新增能力按上述 owner 隔离，既有菜单交互测试保护提取；不改变输出 writer、会话生命周期或缓冲区。
关键行为 gate：真实 xterm 数据转换测试，异步过期保护，PNG 有界校验、原子写入及取消测试。
轻量规格检查：请求与当前范围一致，已获开发授权，无待决产品行为。

## Verification evidence
- AC-001：TerminalContextMenu 与既有 TerminalPanel 测试通过；浏览器使用真实 xterm 选区→右键→导出链路验证。
- AC-002：terminalImageSnapshot 测试覆盖跨视口完整行、首列终点、软换行、中文/组合字符、ANSI/真彩色、隐藏/反色、备用缓冲区与冻结快照；renderTerminalImage 测试覆盖列坐标和色彩。
- AC-003：浏览器 3×3 组合全部生成 1800×448 PNG（原终端 900 CSS px）。同主题三样式正文像素 hash 一致，三主题 hash 不同；重开时默认当前应用主题，选择不改变根主题。
- AC-004：clipboard adapter 的资源释放测试、PNG 原始字节 IPC 测试、Rust PNG 验证/原子替换/取消/失败测试通过；对话框复制、保存、取消与重试行为测试通过。
- AC-005：过期图片及关闭后的资源释放测试通过；真实浏览器 Escape 后恢复终端焦点，640×420 窗口的 101 行图片可滚动，footer 位置稳定。
- `pnpm check`：通过（161 个测试文件、1036 个 Vitest 测试、17 个脚本测试；ESLint/TypeScript/Vite/source-size 均通过，无 ratchet reminder）。构建仍提示主 bundle 大于 500 kB，不影响构建成功。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`：通过（307 通过、4 个既有 OpenSSH 环境测试忽略）。
- `git diff --check` 与 native_dialog 非阻塞调用审计通过。
- 浏览器视觉验证：macOS 本机 Chrome，全部主题/风格、小窗口及长图；截图和像素对比结果保存在本任务 visualizations 目录。原生剪贴板与保存面板的三平台实机点测未执行；已验证既有 adapter 回归、新命令编译和底层文件写入/取消。
- Directory Map 已更新。用户要求仅限当前导出功能，无需额外长期偏好写入。

