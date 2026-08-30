---
id: QB-20260830-git-pane-exclusive-sections
type: feature
tier: standard
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

## Goal

让 Git 管理窗口的“更改”和“图表”以互斥方式展开，并让当前展开段占满存储库区域以下的可用高度。

## Scope

- 调整 Git Pane 的“更改 / 图表”展开状态转换。
- 保持图表段固定在窗口底部，并保留存储库段的独立折叠行为。
- 为互斥状态和弹性高度契约补充测试。

## Non-Goals

- 不持久化各段的展开状态。
- 不改变存储库折叠逻辑、Git 操作或文件差异查看范围。
- 不禁止用户收起当前已展开的段；这种情况下两段均可收起。

## Requirements

- REQ-001：当用户展开“图表”时，系统必须收起“更改”；当用户展开“更改”时，系统必须收起“图表”。
- REQ-002：在“更改”或“图表”有且仅有一个展开时，展开段必须占满存储库段以下、窗口底部以上的可用高度。
- REQ-003：图表段必须继续物理锚定在窗口底部，且各段的文档顺序保持“存储库 → 更改 → 图表”。

## Behavior Delta

### MODIFIED

- REQ-001：此前“更改”和“图表”可同时展开；现在打开一段会自动收起另一段。

## Acceptance

- AC-001 [REQ-001]：初始状态为“更改”展开、“图表”收起；点击“图表”后，图表展开且更改收起。
- AC-002 [REQ-001]：在图表展开时点击“更改”后，更改展开且图表收起；展开状态不会同时为真。
- AC-003 [REQ-002, REQ-003]：样式契约保证展开段可弹性增长，图表保留底部锚定和稳定的文档顺序。

## Quality Check

- 目标、范围与非目标已明确；每条需求均有可观察验收。
- 无认证、数据、传输或模块边界变化；standard tier 足够。

## Assumptions

- 点击当前已展开段仍允许将其收起，以保留原有折叠操作；互斥约束适用于打开另一段时。

## Verification Evidence

- AC-001、AC-002：`pnpm vitest run src/git/GitPane.test.tsx src/git/gitStyles.test.ts src/git/gitGraph.test.ts` 通过。
- AC-003：同一聚焦测试中的样式契约通过；`pnpm check` 通过（64 个测试文件、561 项测试，含 lint、类型检查和生产构建）。
