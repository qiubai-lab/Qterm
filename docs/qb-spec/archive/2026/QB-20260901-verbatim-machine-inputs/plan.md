---
id: QB-20260901-verbatim-machine-inputs
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
spec: spec.md
---

# 机器标识逐字输入修复计划

## Requirement

执行 spec 的 REQ-001 至 REQ-004：为必须逐字保留的机器标识建立单一输入属性边界，修复从提交创建分支的自动大写回归，并完成相同风险输入审计。

## Scope

- 新增一个只封装原生文本辅助属性的共享 input。
- 迁移 Git、files、terminal、network、connection、workspace 中已识别的机器标识输入。
- 先补共享契约与截图路径回归，再实现并运行邻近/完整验证。
- 不调整自然语言字段、样式或 backend string handling。

## Affected Files

- `src/components/ExactTextInput.tsx` 与相邻测试
- `src/git/GitRepositoryOverlays.tsx`
- `src/git/GitRepositoryPickerDialog.tsx`
- `src/files/FileBrowserPane.tsx`
- `src/terminal/TerminalPanel.tsx`
- `src/workspace/TerminalTargetPicker.tsx`
- `src/workspace/LayoutView.tsx`
- `src/network/NetworkRuleDialog.tsx`
- `src/components/dialogs/{ConnectionDialog,TransferDialog}.tsx`
- 对应 Git graph 与受影响组件测试

## Design

- `ExactTextInput` 使用 `forwardRef` 透传 input ref 和全部原生 props，并在 props spread 之后强制写入 `autoCapitalize="none"`、`autoCorrect="off"`、`spellCheck={false}`，防止消费者误覆盖。
- 只替换 text/search 类型的机器字段；组件 className 和全局 `input` CSS 继续作用于最终原生 `<input>`，不引入包装 DOM。
- feature state、`onChange`、submit trim 和 operation API 原样保留，不做 value normalization。

## Implementation Tasks

- [x] 先新增共享输入和截图路径失败回归，证明当前 branch input 缺失属性。
- [x] 实现 `ExactTextInput` 并迁移全部 Git 分支名/筛选入口。
- [x] 按审计清单迁移路径、文件名、主机/用户名、网络端点和精确搜索输入。
- [x] 运行聚焦测试、完整 `pnpm check` 与 `git diff --check`，回写 evidence 并归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `pnpm exec vitest run src/components/ExactTextInput.test.tsx` |
| AC-002 | `pnpm exec vitest run src/git/GitPane.graph.test.tsx` 中从提交创建分支回归 |
| AC-003 | `rg` 审计机器字段消费者与原生 input 剩余清单，配合 TypeScript/import 验证 |
| AC-004 | 受影响 feature tests 后执行 `pnpm check` |

## Test / Verification

1. 先运行新增共享/branch tests，确认旧实现失败。
2. 实现共享组件和消费者迁移后重跑同一测试。
3. 运行 Git branch/graph、repository picker、FileBrowser、TerminalPanel/target picker、NetworkRule、ConnectionDialog、LayoutView 邻近回归。
4. 执行 `pnpm check` 与 `git diff --check`；没有 native dependency/config/packaging 变更，不运行 Rust 或桌面打包。

## Documentation Updates

- 验证通过后回写 AC evidence，并通过 standard ordinary completion path 归档。
- 本次逐字输入属于机器标识语义和既有回归修复，不新增独立长期 UI 偏好。

## Trigger Signals

- Architecture boundary：共享组件保持薄原语，各 feature 继续拥有数据和行为，无额外架构 gate。
- Critical behavior：触发；这是已出现过的回归，必须先补共享属性与 branch operation 参数测试。
- Directory Map：不触发；不新增目录或移动 owner。

## Execution Result

- 新增无包装 DOM 的 `ExactTextInput`，在 consumer props 之后强制三个 platform text-assistance 属性，同时保留 ref 与原生 input API。
- 截图中的从提交创建分支以及创建、指定起点创建、重命名和筛选分支全部迁移；输入 `test3` 会原样交给 Git operation。
- 审计迁移了 Git/files/terminal/network/connection/workspace/transfer 的机器字段；自然语言名称、确认输入、数字、密码与只读展示保持原语义。
- 新增 shared regression 与 branch integration regression；聚焦 10 文件 199 tests、完整 `pnpm check`（76 文件 / 666 tests、lint、typecheck、build）及 `git diff --check` 全部通过。
