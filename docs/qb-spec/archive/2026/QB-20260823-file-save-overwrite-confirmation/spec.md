---
id: QB-20260823-file-save-overwrite-confirmation
status: archived
archived: 2026-09-02
legacy: true
---
# 文件编辑覆盖保存确认

状态：已实现并验证（含覆盖保存确认与未保存离开保护）

## Goal

用户在文件预览/编辑功能中写回已有文件前，以及带着未保存修改离开编辑器前，都得到明确的二次确认，避免误覆盖或误丢失编辑内容。

## Scope

- 工具栏“保存”和编辑器 `Ctrl/Cmd+S` 统一进入覆盖确认。
- 确认弹窗展示文件名称、完整目标路径和覆盖后果。
- 只有“确认覆盖”才执行已有的 revision-guarded `writeTextFile`。
- 取消或 Escape 关闭确认时保留编辑器、修改内容和 dirty 状态。
- 写入期间锁定弹窗关闭；写入失败或版本冲突在弹窗内反馈，并允许取消或重试。
- dirty 编辑状态下，左上角“返回文件夹”和右上角“取消”统一打开未保存离开确认。
- 选择“继续编辑”或按 Escape 关闭确认后保留编辑内容、光标所在编辑会话与 dirty 状态；只有“放弃并退出”才返回文件列表。

## Constraints

- 继续使用后端现有 expected revision 防止覆盖外部并发修改，不增加强制覆盖接口。
- 本地与 SFTP 文件行为一致。
- 确认状态属于文件预览会话，不进入 Workspace 持久化。
- 弹窗使用共享 `DialogFrame`、`Button` 和主题语义色。

## Non-Goals

- 不增加自动保存、历史版本、差异比较或备份恢复。
- 不改变“创建空文件”、复制、改名和删除流程。
- 不扩展到关闭整个文件 Block、Workspace 或应用窗口的全局离开拦截。

## Acceptance

- A1：dirty 文本文件点击保存后先显示确认弹窗，写入尚未发生。
- A2：弹窗明确显示完整路径和现有内容将被替换；取消后编辑内容不丢失且不写入。
- A3：确认后仅写入一次，成功后关闭弹窗并清除 dirty 状态。
- A4：`Ctrl/Cmd+S` 与工具栏保存使用同一确认流程。
- A5：写入失败/版本冲突不关闭弹窗，显示错误且保留 dirty 内容以便重试或取消。
- A6：clean、loading、图片或只读预览不会打开确认或写入。
- A7：dirty 时左上角返回与右上角取消都打开同一个主题化确认弹窗，不调用浏览器原生 `window.confirm`。
- A8：取消/Escape 后继续显示原编辑内容与 dirty 标记；确认放弃后不写入文件并返回原文件列表。

## Acceptance To Verification

- A1/A2/A3 → FileBrowserPane 交互测试覆盖请求、取消与确认。
- A4 → CodeEditor 保存快捷键经 FileBrowserPane 集成测试验证。
- A5 → mock `writeTextFile` 失败，断言弹窗错误、内容与 dirty 状态保留。
- A6 → 既有按钮 disabled/预览测试与新增无写入断言。
- A7/A8 → FileBrowserPane 测试分别从两个入口触发，覆盖继续编辑、Escape/关闭和确认放弃。

## Open Questions

无。默认“保存”表示覆盖当前已打开文件；复制或另存为不在本次范围。

## Recommended Approach

保存继续由统一 `requestPreviewSave` 门控制；离开则新增统一 `requestLeavePreview` 门，clean 状态直接离开，dirty 状态打开共享 `DialogFrame`，最终确认才调用纯清理函数 `leavePreview`。相比保留原生 `window.confirm`，该方案能适配三套主题、保持顶层弹窗 Escape/focus 规则；相比两个按钮各写一套判断，统一入口能避免行为分叉。

## Next Skills

- `writing-qb-plans`：Standard 计划。
- `protecting-critical-behavior`：覆盖防误写的关键行为回归。
- `verifying-before-completion`：聚焦测试和完整质量门禁。
- Directory Map：not needed；没有目录、模块边界或入口职责变化。
