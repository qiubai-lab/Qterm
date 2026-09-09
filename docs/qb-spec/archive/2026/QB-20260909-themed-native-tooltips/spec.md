---
id: QB-20260909-themed-native-tooltips
type: design
tier: standard
status: archived
created: 2026-09-09
updated: 2026-09-09
---

# 统一产品气泡样式

## Goal

让 Qterm 产品界面中现有的浏览器/WebView 原生 `title` 气泡统一使用共享主题气泡，同时避免完整可见的操作标识产生多余提示。

## Scope

- 审计真实 DOM 上的 `title` 用途，不改动仅作为 React 组件标题参数的同名属性。
- 在应用组合根接管动作说明、禁用原因以及文件名、路径、分支、提交和状态等信息气泡。
- 标题与可见文本一致时，仅在目标真实溢出时显示；说明性或补充性标题保持悬停/聚焦可见。
- 保留既有点击、禁用、ARIA、主题、视口约束和 reduced-motion 行为。

## Non-Goals

- 改写业务组件的提示文案或操作逻辑。
- 替换 Markdown 文档正文的可见内容或浏览器页面自身 UI。
- 为第三方编辑器、终端画布内部不可见 DOM 注入业务逻辑。

## Requirements

- REQ-001: 所有应用 DOM 原生 `title` 提示在运行时必须由共享主题气泡呈现，不得同时出现系统原生气泡。
- REQ-002: 与目标可见文本相同的完整值仅在真实溢出时显示气泡；补充说明、快捷键、禁用原因和缩写展开始终可显示。
- REQ-003: 气泡必须支持鼠标与可聚焦目标的键盘访问、Escape/离开/滚动/窗口变化收起，并恢复原始 DOM 属性。
- REQ-004: 既有显式共享气泡、业务交互与组件边界保持不变。

## Behavior Delta

### MODIFIED

- 原生灰色 `title` 气泡改为 Qterm 主题气泡，并受视口边界、主题和无障碍交互约束。
- 完整可见且标题等同正文的标识不再显示冗余气泡。

## Acceptance

- AC-001 (REQ-001, REQ-004): 应用组合根挂载唯一的原生标题气泡代理，动作标题显示主题气泡且悬停期间 DOM 不保留可触发系统气泡的 `title`。
- AC-002 (REQ-002): 等同正文的标题在未溢出时不显示、溢出时显示；缩写或说明性标题不受该过滤影响。
- AC-003 (REQ-003): 鼠标离开、焦点离开、Escape、滚动和窗口变化正确收起，原始 `title` 与 `aria-describedby` 正确恢复。
- AC-004 (REQ-001, REQ-004): 共享 tooltip、应用测试、source-size、lint、typecheck 和生产构建通过。

## Implementation Steps

- 在共享组件目录新增事件代理与主题气泡呈现模块，复用现有位置计算和 CSS。
- 在 `App` 组合根挂载一次，不向 feature 页面传播 tooltip 状态或参数。
- 为动作提示、溢出过滤、属性恢复和键盘收起增加相邻行为测试。
- 运行聚焦测试、source-size 和 `pnpm check`，通过后记录证据并归档。

## Verification Mapping

| Acceptance | Evidence |
| --- | --- |
| AC-001 | 代理组件动作标题测试；应用组合测试 |
| AC-002 | 相同文本的 fit/overflow 测试；缩写标题测试 |
| AC-003 | pointer/focus/Escape/scroll 属性恢复测试 |
| AC-004 | focused Vitest；`pnpm check` |

## Quality Check

范围限定为现有 DOM 标题的展示层行为；共享组件拥有事件代理和气泡生命周期，`App` 只负责组合，feature 业务与 IPC 契约不变。需求和验收闭合，无阻塞歧义。

## Verification Evidence

- AC-001/AC-002/AC-003: `ThemedTitleTooltipProvider.test.tsx` 的 5 个场景覆盖动作提示、完整/溢出文本、缩写展开、焦点/Escape、滚动期间的原生提示抑制和属性恢复；`App.test.tsx` 证明窗口控制标题经过应用级代理。
- AC-004: 聚焦检查通过 6 个测试文件、52 项测试；最终 `pnpm check` 通过 source-size（0 reminders）、ESLint、148 个前端测试文件/1005 项测试、17 项 Node 测试、TypeScript 与 Vite production build。
- 架构边界：共享展示生命周期位于 `src/components/`，`App` 仅挂载一次；文件、Git、网络、工作区、终端和对话框业务组件无需引入跨 feature 状态或改变 IPC。
