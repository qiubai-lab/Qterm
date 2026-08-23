# 文件编辑覆盖保存确认实施计划

计划级别：Standard（扩展已完成：未保存离开保护）

## Requirement

所有写回当前已打开文本文件的保存请求，以及 dirty 状态下从编辑器返回/取消的请求，都必须经过可访问、主题化的二次确认，同时保留现有 revision 冲突保护。

## Scope

包含工具栏保存、键盘保存、左上角返回、右上角取消、继续编辑、确认放弃、busy 和失败反馈；不包含另存为、自动保存、备份、全局窗口关闭拦截或后端接口变化。

## Affected Files

- `src/files/FileBrowserPane.tsx`：保存请求门、确认状态和确认弹窗。
- `src/files/FileBrowserPane.test.tsx`：覆盖保存关键行为回归。
- `src/files/fileBrowser.css`：路径摘要和提示区域的主题化局部样式。
- `src/app/appStyles.test.ts`：确认弹窗 feature 样式语义合约。

## Design

- `requestPreviewSave` 只校验当前 preview 是否可保存，然后打开确认，不执行 IPC。
- `requestLeavePreview` 是返回与取消的唯一入口：clean 直接调用 `leavePreview`，dirty 只打开离开确认。
- `leavePreview` 只执行已确认的资源清理和列表恢复，不自行弹出浏览器原生确认。
- 离开确认默认保留编辑器挂载；“继续编辑”、Escape 与关闭按钮只关闭嵌套弹窗，“放弃并退出”才调用 `leavePreview`。
- `confirmPreviewSave` 使用打开确认时仍存在的 preview 内容与 revision 调用现有 `writeTextFile`。
- 确认期间 DialogFrame 作为顶层 modal；默认焦点停留在取消操作，避免回车误覆盖。
- 写入失败将错误放在弹窗内的稳定反馈区，不清除编辑内容；成功才关闭确认并更新 original/revision。
- 路径使用等宽字体、单行截断与 title 完整值，三主题消费 shared warning/danger/text/panel token。

## Acceptance To Verification

- A1/A2：点击保存后断言 dialog 可见、路径/提示完整、IPC 未调用；取消后 editor value 与 dirty 标记保留。
- A3：确认后断言 IPC 参数和单次调用，随后 dialog/dirty 消失。
- A4：触发 `Ctrl+S` 后断言同一个 dialog 且 IPC 未调用。
- A5：拒绝 IPC 后断言 alert 可见、dialog 保留、dirty 保留并可重试。
- A6：复用既有 clean/preview/image 状态测试，并保持保存按钮禁用契约。
- A7：两个按钮分别触发同一个“放弃未保存的修改？”弹窗，并断言 `window.confirm` 未使用。
- A8：继续编辑/关闭确认保留 textbox value 与 dirty；确认放弃不调用写入并恢复文件列表。

## Test / Verification

1. 先更新 `FileBrowserPane.test.tsx`，使现有直接保存断言转为确认保存并新增取消、快捷键、失败测试。
2. `pnpm vitest run src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts --maxWorkers=1`
3. `pnpm check`

## Documentation Updates

- 本 task spec 与 plan 记录一次性功能决策。
- 不更新长期 project context；该行为不改变跨模块架构或产品长期领域规则。
- Directory Map 不需要更新。

## Completion Record

- 关键行为测试先行确认旧实现会直接写入，随后覆盖工具栏保存、快捷键保存、取消、失败、重试与成功收敛。
- 聚焦验证：2 个测试文件、85 项测试通过。
- 完整门禁：`pnpm check` 通过，包含 ESLint、51 个测试文件共 405 项测试、TypeScript 和 Vite production build。
- 构建仅保留项目既有的大 chunk 提示。
