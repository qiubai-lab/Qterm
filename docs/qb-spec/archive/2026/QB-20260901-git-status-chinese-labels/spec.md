---
id: QB-20260901-git-status-chinese-labels
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 文件状态中文化

## Goal

将 Git 管理界面中面向用户展示的文件状态码统一替换为清晰的中文状态名称，同时保留底层原始状态码用于数据和操作逻辑。

## Scope

- Git 工作区与暂存区文件列表。
- Git 更改预览顶部状态和文件选择浮层。
- Git 提交历史展开后的文件列表。
- 覆盖新增、修改、未跟踪、删除、重命名、复制、类型变更与冲突等已支持状态。

## Non-Goals

- 不修改 Tauri/Rust 返回的 Git 状态协议。
- 不修改暂存、取消暂存、抛弃或预览逻辑。
- 不翻译路径、分支名或 Git 命令错误原文。

## Requirements

- REQ-001：所有 Git 文件状态的用户可见文本必须使用中文语义名称，不直接显示 `A`、`M`、`U` 等原始代码。
- REQ-002：不同 Git 界面必须复用同一状态映射；重命名百分比等状态后缀不得导致翻译失败。
- REQ-003：ARIA 标签、title 与可见状态文本必须保持一致且可理解。
- REQ-004：原始状态码必须继续用于键值、数据传输、冲突判断和 Git 操作逻辑。

## Acceptance

- AC-001（REQ-001、REQ-002）：`A/M/U/D/R100/C075/T/!` 分别得到稳定的中文展示名称，未知非空状态得到可理解的回退文案。
- AC-002（REQ-001、REQ-003）：变更列表、预览顶部、预览文件浮层和提交文件列表均显示中文状态，相关辅助文本不再暴露原始缩写。
- AC-003（REQ-004）：现有 Git 选择、预览、暂存和提交文件加载测试继续通过，数据模型中的 `status` 保持原值。

## Behavior Delta

### MODIFIED

- REQ-001：Git 文件状态由原始英文缩写改为完整中文名称。
- REQ-002：各 Git 组件的状态展示改为共享映射。
- REQ-003：状态相关辅助文本同步采用中文名称。
- REQ-004：仅展示层改变，底层状态协议和行为保持不变。

## Quality Check

目标、覆盖界面、状态范围与非目标明确；所有需求均有可观察验收。实现限定在 Git 前端展示层，不涉及架构边界或后端协议。

## Verification Evidence

- AC-001：`gitStatus.test.ts` 验证新增、修改、未跟踪、删除、重命名、复制、类型变更、冲突、带百分比后缀及未知状态回退。
- AC-002：`GitPane.basics.test.tsx`、`GitChangePreview.test.tsx` 与 `GitPane.graph.test.tsx` 验证变更列表、预览顶部、预览文件浮层和提交文件列表均显示中文状态及中文辅助文本。
- AC-003：原始 `status` 继续用于数据键值和 Git 加载参数；相关选择、预览、批量操作及提交历史回归通过。
- 中文长标签布局契约验证四类状态位置均保持单行、不压缩固定操作区域。
- `pnpm check`：79 个测试文件、701 个测试全部通过；ESLint、TypeScript 类型检查和生产构建通过。
- `git diff --check`：通过，仅有工作区既有 LF/CRLF 提示。

## Residual Risk

- 未逐一制造每种罕见 Git 状态的真实仓库截图；共享映射已由单元测试覆盖，所有用户可见入口均使用该映射。
