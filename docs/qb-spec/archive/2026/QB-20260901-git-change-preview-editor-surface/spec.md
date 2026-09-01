---
id: QB-20260901-git-change-preview-editor-surface
type: bugfix
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 更改预览编辑器表面优化

## Goal

让 Git 更改预览的左右文件表面完整铺满弹窗剩余区域，并消除只读比较视图中选中行重复出现的活动光标竖线。

## Scope

- 修复 CodeMirror MergeView 编辑器、scroller 与 gutter 的全高布局。
- 为 Git 只读比较视图使用精简的展示扩展，移除活动行、活动 gutter 和绘制光标等编辑态装饰。
- 保留行号、特殊字符提示、语法高亮、换行和 Git 差异背景/下划线。

## Non-Goals

- 不改变 Git diff 数据、冲突内容或后端命令。
- 不改变普通可编辑文件编辑器的活动行和光标反馈。
- 不隐藏 Git 新增、删除和行内变化标识。

## Root Cause

`@codemirror/merge` 为共享外层滚动将内部 `.cm-editor` 和 `.cm-scroller` 强制为内容高度，当前预览样式没有建立全高覆盖，因此 gutter 只延伸到最后一行。与此同时，`basicSetup` 注入 `highlightActiveLineGutter`、`highlightActiveLine` 和 `drawSelection`；全局文件编辑器主题会为 MergeView 的多个 gutter 同时绘制活动行左侧标记，形成重复竖线。

## Requirements

- REQ-001：左右文件编辑器、背景和行号 gutter 必须铺满差异舞台的可用高度，长内容仍由 MergeView 的既有外层滚动承载。
- REQ-002：只读 Git 比较视图不得显示活动行背景、活动 gutter 标记或编辑光标。
- REQ-003：行号、语法高亮和 Git 差异语义标识必须保持可见。

## Acceptance

- AC-001（REQ-001）：短文件预览时，左右 editor/scroller/gutter 从来源标题下方延伸到弹窗底部。
- AC-002（REQ-002）：聚焦或选择只读比较视图后，DOM 不产生活动行 gutter，绘制光标保持隐藏，不再重复显示竖线。
- AC-003（REQ-003）：比较视图仍创建两个只读 pane，并保留 line number、语言与 diff 配置。
- AC-004（REQ-001、REQ-002、REQ-003）：现有 Git 预览加载、文件导航、二进制回退和 Git 操作测试继续通过。

## Behavior Delta

### MODIFIED

- REQ-001：短文件的编辑器表面由内容高度改为填满整个可用差异区域。
- REQ-002：只读比较视图由继承完整编辑器活动态装饰改为无活动行与光标装饰。
- REQ-003：精简只读扩展时继续保留差异阅读所需的行号、语法与变更表达。

## Quality Check

目标、非目标、需求和验收闭合；改动局限于只读 Git 比较视图，不影响普通文件编辑器或 Git 数据边界。

## Verification

- 回归先行：新增测试在旧实现下同时检出活动行装饰和缺失的全高样式契约。
- AC-001：样式契约覆盖 MergeView、editor、scroller 和 gutter 的完整高度链。
- AC-002、AC-003：真实 CodeMirror 测试确认两个 `contenteditable=false` pane、两个行号 gutter，且无 `.cm-activeLine` / `.cm-activeLineGutter`；局部样式隐藏 cursor/drop cursor。
- AC-004：4 个聚焦测试文件、40 项测试通过。
- 基础完整性：`pnpm check` 通过（78 个测试文件、676 项测试，lint、TypeScript 与 Vite build 均通过）。
- 差异完整性：`git diff --check` 通过，仅有工作区 LF/CRLF 转换提示。

## Residual Risk

未在真实 Tauri 窗口中执行自动化截图比对；布局与重复装饰的底层 DOM/CSS 条件已由自动化直接覆盖。

