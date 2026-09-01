---
id: QB-20260901-git-change-preview-synchronized-diff
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 更改预览同步差异视图

## Goal

让 Git 更改预览呈现接近 VS Code 的双栏差异阅读体验：两侧共享纵向滚动并以物理行对齐，长行各自水平滚动，缺失行使用明确但克制的占位纹理。

## Scope

- 使用 MergeView 原生 spacer 维持两侧未变化行的垂直对齐。
- 由 `.cm-mergeView` 单独拥有纵向滚动，每侧 `.cm-mergeViewEditor` 独立拥有水平滚动，内部 scroller 自然展开。
- 关闭只读差异视图的自动换行，避免相同行因折行高度不同而错位。
- 为 `.cm-mergeSpacer` 增加主题化斜纹占位，同时保留现有新增、删除、行内变化和行号表达。

## Non-Goals

- 不实现 VS Code 的右侧差异概览尺。
- 不同步两侧水平滚动。
- 不折叠未变化区，不改变普通文件编辑器或冲突解决编辑器。
- 不改变 Git diff 数据与后端命令。

## Requirements

- REQ-001：两侧必须共享唯一的纵向滚动容器，滚动任一可见区域时两侧内容同步移动。
- REQ-002：双方相同的未变化行必须保持相同垂直坐标；长行不得因自动换行破坏物理行对齐。
- REQ-003：每一侧必须能够独立水平滚动查看长行。
- REQ-004：缺失行占位必须可辨识，且不能遮蔽行号、Git 变更颜色或文本内容。

## Acceptance

- AC-001（REQ-001）：视图中只有 `.cm-mergeView` 拥有纵向滚动，内部 scroller 自然展开且不产生纵向滚动范围。
- AC-002（REQ-002）：比较视图不安装 line-wrapping 扩展，带插入/删除的长样本在滚动后存在成对的对齐锚点。
- AC-003（REQ-003）：两个 `.cm-mergeViewEditor` 均拥有水平滚动能力，改变一侧 `scrollLeft` 不强制改变另一侧。
- AC-004（REQ-004）：MergeView spacer 使用中性斜纹和结构边界，现有 change gutter 与 diff 高亮保持启用。
- AC-005（REQ-001 至 REQ-004）：现有 Git 预览加载、只读状态、全高显示与错误/二进制回退行为继续通过。

## Behavior Delta

### MODIFIED

- REQ-001：双栏预览由滚动所有权不明确改为共享单一纵向滚动。
- REQ-002：长行由自动换行改为保持单一物理行并通过 spacer 对齐。
- REQ-003：长行阅读由折行改为每侧独立水平滚动。
- REQ-004：差异侧缺失行由普通空白改为带中性斜纹的语义占位。

## Verification Evidence

- 浏览器：外层 `clientHeight=388`、`scrollHeight=1959`；内部 scroller `clientHeight=scrollHeight=1959` 且 `scrollTop=0`。
- 浏览器：外层滚动至 `scrollTop=1050` 后，第 90 行两侧锚点 Y 坐标差为 0。
- 浏览器：左侧水平滚动至 420px 时，右侧保持 0；两侧水平范围均为 1863px。
- 浏览器：无 `.cm-lineWrapping`，存在中性斜纹 `.cm-mergeSpacer`。
- `pnpm check`：78 个测试文件、679 个测试全部通过；lint、typecheck 与生产构建通过。
- `git diff --check`：通过（仅报告工作区既有 CRLF 提示）。

