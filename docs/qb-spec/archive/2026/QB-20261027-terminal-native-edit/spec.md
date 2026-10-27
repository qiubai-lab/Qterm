---
schema: 1
id: QB-20261027-terminal-native-edit
type: bugfix
tier: standard
status: archived
created: 2026-10-27
updated: 2026-10-27
supersedes: []
---

# 终端原生编辑快捷键回归修复

用户授权：当前请求要求恢复 macOS Command+V 图片上传，并检查 Windows 与其他快捷键。修复同次菜单改动导致的终端 Command+A 回归也在此范围内。

## 原因与范围

真实 Tauri 主 WebView、原生菜单和 xterm 复现：Command+V 产生 paste 事件但不产生 keydown，绕过应用图片/文件暂存与文本确认；Command+A 被原生菜单处理，未调用 xterm 的全选。Windows 无此 macOS 菜单，但直接 paste 事件也会绕过应用流程。

- REQ-001：macOS/Windows 原生 paste 事件与现有快捷键共用本地路径准备/SSH 暂存及有序粘贴流程；不重复发送，不绕过多行确认，断开连接不粘贴。
- REQ-002：macOS Command+A 与编辑菜单全选应全选当前终端输出；普通输入框和浏览器 Block 继续由原生响应者处理。
- REQ-003：保留 Command+Shift+V、Windows Ctrl+V/Ctrl+Shift+V、Linux Ctrl+Shift+V；保留无选区 Ctrl+C、Ctrl+A/Z、词导航、搜索、工作区切换及 Block 关闭语义。
- REQ-004：绑定按终端视图生命周期清理、重建；不拦截搜索框/其他 Block，不改变 IPC、剪贴板优先级、暂存实现或持久化；Linux 中键 PRIMARY 选区粘贴保留 xterm 原流程。

## Behavior Delta

### MODIFIED
- REQ-001：原生粘贴从 xterm 纯文本旁路改为与应用上传、确认、顺序控制共用入口。
- REQ-002：原生全选在终端焦点下选择终端输出，其余焦点保留系统行为。

## 验收与检查

- AC-001 [REQ-001]：DOM paste 只调用一次应用入口、阻止 xterm 默认处理；远端上传结果先于后续输入，本地路径及多行确认保持有效。绑定单测、TerminalPanel 集成测试、真实 macOS xterm 菜单测试。
- AC-002 [REQ-002]：真实 macOS Command+A/C 复制终端选区；普通输入框、iframe、contenteditable 及浏览器 Block 的原生编辑测试仍通过。
- AC-003 [REQ-003]：跨平台快捷键矩阵和现有 workspace/search/navigation 测试通过；Windows 标明静态/自动化覆盖与未实机测试边界。
- AC-004 [REQ-004]：捕获仅作用于目标 xterm、禁用状态拦截、清理后无旧回调、重挂载无双重调用；source-size 与完整前端/Rust 检查通过。

## 实施步骤

- [x] terminalClipboardShortcuts 拥有编辑事件分流；useTerminalInputBindings 拥有绑定生命周期。TerminalPanel 只接线并缩小，不增长既有热点。
- [x] macOS 全选菜单桥接仅询问当前主 WebView；终端取消自定义事件表示已处理，否则调用原生响应者全选。异步返回后检查焦点，避免误操作新的焦点。
- [x] 相邻测试与真实 Tauri/xterm 检查覆盖回归及邻接行为，更新目录图与验证入口。
- [x] 完成验证、记录证据并归档。

架构检查：既有 terminal 输入适配与 macOS 菜单 adapter 内修复；不新增状态存储、权限、依赖、IPC 或数据迁移。质量检查通过，需求/验收覆盖完整。回退只需撤回此变更涉及的代码，保留先前浏览器 Block 修复。

## 验证证据

- AC-001：`terminalClipboardEvents.test.ts` 与 `TerminalInput.test.tsx` 验证捕获、一次回调、禁用、IPC 排队、远端路径上传、原生/键盘本地路径、多行确认与错误。真实菜单+PNG 入口已通过；原生 fixture 使用记录回调，上传由集成测试验证。
- AC-002：真实 Tauri 主 WebView+xterm 的 Command+A/C，以及 Swift 浏览器 guest 的 input/textarea/contenteditable/iframe 的 A/C/X/V/Z/Shift+Z 测试通过；普通主视图输入框仍使用 AppKit 原生编辑。
- AC-003：跨平台快捷键矩阵、工作区关闭/搜索/切换及词导航测试通过。检查 Windows 原生 accelerator 只截获 exact Ctrl+W，macOS Edit 菜单不编译到 Windows；Windows Ctrl+V/Ctrl+Shift+V 与 DOM paste 有前端自动化覆盖，没有 Windows 实机验证。Linux PRIMARY 粘贴保持原处理。
- AC-004：解绑、重建、断开连接和搜索框隔离测试通过。`pnpm check` 通过：247 测试文件通过、1 跳过；1485 测试通过、2 跳过；27 脚本测试通过；ESLint、TypeScript、Vite build、尺寸检查通过。TerminalPanel 从 578 缩小至 553 行，旧测试按输入行为与共享 fixture 拆分并删除尺寸 baseline。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 通过；`cargo test --all-targets --all-features` 为 374 通过、6 个既有环境测试忽略。最终 AppKit 响应链 fallback 调整后重新通过 clippy，并进行原生针对性复测。
- Directory Map 与 `scripts/macos-web-smoke/README.md` 已同步；未修改长期工程规范、未打包或安装运行中的应用。
- 最终原生复测：`node scripts/macos-web-smoke/native-edit.mjs` 全部通过，覆盖浏览器编辑、主视图终端文字/PNG 粘贴、全选复制、控制键与普通输入框隔离。一次复测在初始窗口获取焦点时中断、未执行行为断言；无代码变更重跑后全部通过。
