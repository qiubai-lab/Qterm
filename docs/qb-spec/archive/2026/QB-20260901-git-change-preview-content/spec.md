---
id: QB-20260901-git-change-preview-content
type: bugfix
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 更改预览内容区修复

## Goal

修复 Git Block 的更改预览弹窗只显示文件工具栏、无法显示实际差异内容的问题。

## Scope

- 恢复预览弹窗内容容器对固定高度弹窗剩余空间的占用。
- 保持工具栏固定、差异编辑器独立填充和滚动。
- 保持现有 Git diff IPC、数据模型和 CodeMirror 比较行为不变。

## Non-Goals

- 不改变 Git diff 的生成规则或后端命令。
- 不重设计预览弹窗或引入新的编辑器依赖。

## Root Cause

`.git-change-preview-dialog .dialog-content` 缺少 `flex: 1`。父级弹窗是固定高度的纵向 flex 容器，而内容区仅按工具栏的固有高度参与布局，导致其内部使用 `flex: 1 1 0` 的 diff stage 被压缩为零高度。

## Requirements

- REQ-001：Git 更改预览的内容区必须占满弹窗标题栏之外的剩余高度。
- REQ-002：工具栏保持固定，差异舞台和 CodeMirror 比较视图在剩余空间内可收缩并独立滚动。
- REQ-003：文件选择浮层必须按标题、可滚动文件列表的纵向层级布局。

## Acceptance

- AC-001（REQ-001）：打开一个文本文件的 Git 更改预览后，左右来源标题与差异编辑器可见，不再出现工具栏以下空白。
- AC-002（REQ-002）：布局样式明确包含从弹窗内容区到 diff stage 的连续 flex/min-height 契约。
- AC-003（REQ-003）：展开文件选择浮层时，标题位于列表上方且列表拥有滚动空间。
- AC-004（REQ-001、REQ-002）：现有预览加载、错误、二进制回退和文件导航测试继续通过。

## Behavior Delta

### MODIFIED

- REQ-001：Git 更改预览由“内容舞台可能被压缩为零高度”改为始终占用弹窗剩余空间并显示差异。
- REQ-002：预览布局明确保持固定工具栏与可收缩、可滚动差异区。
- REQ-003：文件浮层由隐式横向 flex 改为明确的纵向标题/列表布局。

## Quality Check

目标、非目标、需求和验收闭合；不涉及 Git 领域规则、IPC 契约或安全边界，无阻塞歧义。

## Verification

- AC-001、AC-002、AC-003：新增样式契约断言；修复前聚焦测试按预期失败，修复后通过。
- AC-004：`pnpm exec vitest run src/git/GitChangePreview.test.tsx src/git/GitPane.operations.test.tsx src/git/gitStyles.test.ts`，39 项通过。
- 基础完整性：`pnpm check` 通过（77 个测试文件、675 项测试，lint、TypeScript 与 Vite build 均通过）。
- 差异完整性：`git diff --check` 通过，仅报告工作区 LF/CRLF 转换提示。

## Residual Risk

未在真实 Tauri 窗口中执行自动化截图比对；布局根因由 CSS flex 契约与回归测试直接覆盖。

