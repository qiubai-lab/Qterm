---
id: QB-20260901-git-repository-picker-file-browser-interactions
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git repository picker file-browser interactions

## Goal

让远程 Git 仓库目录选择器与文件管理 Block 使用同一套目录浏览心智模型，同时保留浏览不可用时直接确认手工路径的能力。

## Scope

- 将目录行改为单击选中、双击或 Enter 打开。
- 将导航改为文件管理 Block 的“上级目录 + 前进栈”模型。
- 将路径栏改为默认展示、单击编辑、Enter 导航、Escape 取消编辑。
- 复用文件浏览器的路径行 hover、selection 与 focus 视觉语义。
- 保留刷新、请求竞态保护、虚拟列表、浏览错误回退与确认/取消。

## Non-goals

- 不引入文件上传、下载、创建、删除、排序、预览或上下文菜单。
- 不修改 Git 目录 IPC、SSH/SFTP 生命周期或 Workspace target 持久化。
- 不抽取通用文件管理组件。

## Requirements

- REQ-001：目录行必须以单击选择候选路径，以双击或 Enter 进入目录，并以非颜色单一信号展示选择状态。
- REQ-002：上级导航成功后必须保留当前目录作为前进目标；普通目录打开或路径导航必须清空前进栈。
- REQ-003：路径默认以紧凑只读控件显示，单击切换为精确文本输入；Enter 导航，Escape 恢复当前路径并退出编辑。
- REQ-004：确认动作必须优先使用已选目录；无行选择时使用有效手工路径或当前目录，并继续支持浏览失败后的手工路径确认。
- REQ-005：加载、错误、空目录、虚拟列表、刷新、竞态丢弃、键盘语义与单一滚动区域必须保持可用。

## Acceptance

- AC-001 [REQ-001, REQ-004]：单击目录仅更新选中路径和 `aria-selected`，双击或 Enter 才发起目录读取，确认返回选中目录。
- AC-002 [REQ-002]：进入上级后前进按钮可返回原目录；打开子目录或提交路径后旧前进目标消失。
- AC-003 [REQ-003, REQ-004]：路径按钮可进入编辑；Escape 取消；浏览失败时输入有效路径可直接确认。
- AC-004 [REQ-005]：刷新、过期响应丢弃、大目录有界渲染、取消与 dialog 语义回归通过。
- AC-005 [REQ-001, REQ-005]：行 hover/selection/focus 使用文件浏览器语义，选中态在 hover 时仍占优，滚动和 reduced-motion 约束保持成立。

## Behavior Delta

### MODIFIED

- REQ-001：目录行从“单击立即打开”改为“单击选择，双击或 Enter 打开”。
- REQ-002：双向历史导航改为与文件管理 Block 一致的上级导航和前进栈。
- REQ-003：路径从常驻输入框改为按需编辑控件。
- REQ-004：确认候选从仅路径草稿扩展为优先使用选中的子目录。

## Assumptions

- “搬过来”指目录浏览操作模型，不包含文件管理操作能力。
- 用户当前请求即为对上述可观察行为的批准。

## Quality Check

目标、非目标、需求、行为变化与验收闭合；没有会改变范围的高影响歧义。

## Verification Evidence

- AC-001 至 AC-005：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts`，33 项通过。
- AC-001 至 AC-005 与前端基础完整性：`pnpm check` 通过，包括 ESLint、78 个测试文件共 689 项测试、TypeScript 检查与 Vite 生产构建。
- `git diff --check` 通过；仅输出工作区既有的 LF/CRLF 提示。
- Vite 保留仓库既有的大 chunk 警告，不影响本次验收。

## Completion

- 2026-09-01：实现、验证并按标准流程归档。
- 没有模块边界或目录结构变化，无需更新 Directory Map。
- 本次交互方向来自既有文件管理 Block 和 UI 规范，不形成新的长期风格偏好。
