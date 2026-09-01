---
id: QB-20260901-verbatim-machine-inputs
type: bugfix
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# 机器标识输入保持原始大小写

## Goal

阻止 macOS WebView/系统文本辅助对分支名等机器标识执行自动大写、自动纠错或拼写替换，确保用户输入的字符以原样进入前端状态和后端操作；同时审计并修复其他具有相同风险的机器标识输入。

## Approval

用户于 2026-09-01 提供“从此提交创建分支”截图，明确要求修复输入内容自动转换为大写的问题，并检查其他位置是否存在相同问题后统一修复。

## Observed Behavior

- “从此提交创建分支”的分支名称输入缺少 WebView 文本辅助控制；输入 `test3` 时系统会显示 `Test3` 自动纠正候选，并可能接受为首字母大写值。
- 代码扫描没有发现 branch-name 路径中的 `toUpperCase`、capitalize 或其他数据转换；同一缺失属性也存在于其他分支名、路径、文件名、主机、网络端点和精确搜索输入。
- 连接用户名此前已通过 `autoCapitalize="none"`、`autoCorrect="off"`、`spellCheck={false}` 修复同类问题，但该约束没有形成可复用输入边界。

## Expected Behavior

用户在机器标识字段中输入的大小写和拼写必须原样保留；系统不得提供会自动修改该值的大小写、纠错或拼写候选。自然语言名称、说明和确认文本仍可保留平台文本辅助能力。

## Scope

- 新增轻量 `ExactTextInput` 原生输入封装，统一关闭自动大写、自动纠错和拼写检查，并继续透传 ref、原生属性、受控值和事件。
- 将所有 Git 分支名/分支筛选、Git 远程仓库路径、文件浏览器路径/文件名、终端输出搜索/目标筛选、连接主机/用户名、网络监听/目标地址、文件传输远程路径和 workspace Git 远程路径迁移到该输入。
- 为共享输入契约和截图对应的从提交创建分支流程增加回归测试。

## Non-Goals

- 不改变 Git 分支命名合法性、trim 行为、大小写敏感规则或 Rust/Tauri API。
- 不对连接名称、workspace 名称、分组名、凭证名、网络规则名称等自然语言字段关闭平台文本辅助。
- 不修改密码、数字、checkbox、radio、只读展示或系统文件选择器。
- 不通过 CSS `text-transform` 模拟或修正数据大小写。

## Requirements

- REQ-001：`ExactTextInput` 必须始终输出 `autocapitalize="none"`、`autocorrect="off"` 和 `spellcheck="false"`，且调用方不能意外覆盖这些逐字输入不变量。
- REQ-002：所有创建/从分支创建/从提交创建/重命名分支的名称输入和分支筛选必须使用逐字输入；`test3` 必须以完全相同的值提交给既有 Git operation。
- REQ-003：审计中识别的路径、文件名、主机/用户名、网络端点和精确搜索输入必须使用同一逐字输入边界，不得各自维护不一致的属性组合。
- REQ-004：既有受控输入、autoFocus、required、maxLength、placeholder、搜索键盘行为、dirty state 和 operation submit 行为必须保持不变。

## Behavior Delta

### ADDED

- REQ-001：新增共享的逐字文本输入不变量。

### MODIFIED

- REQ-002：分支名和分支筛选从允许系统自动大写/纠错改为逐字输入，提交值不再受平台文本辅助修改。
- REQ-003：其他机器标识输入统一关闭自动大写、纠错和拼写检查；自然语言输入保持原行为。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-004]：组件测试证明 `ExactTextInput` 渲染三个逐字输入属性、支持 ref/原生属性，并在 change 后保留 `test3` 原始值；调用方传入相反属性也不能覆盖不变量。
- AC-002 [REQ-002, REQ-004]：Git graph 集成测试证明“从此提交创建分支”的输入具有三个逐字属性，输入 `test3` 后调用 `createGitBranchFromCommit` 的 name 仍为 `test3`。
- AC-003 [REQ-002, REQ-003]：实现审计证明所有已识别机器标识字段都复用 `ExactTextInput`，仓库中只保留有明确语义的原生 text/search inputs；连接用户名不再维护独立属性组合。
- AC-004 [REQ-004]：受影响组件测试与完整 `pnpm check` 通过，既有 Git、文件、终端、网络、连接和 workspace 交互不回归。

## Architecture Boundary Decision

- `ExactTextInput` 只封装原生 input 属性，不拥有领域状态、验证、格式化或样式，属于 `src/components/` 的薄共享原语。
- 各 feature 继续拥有 value、事件、验证和提交；后端收到的字符串契约不变。
- 这是至少十个明确消费者共享的同一平台输入不变量，满足现有组件复用门槛，不引入新的表单系统。

## Quality Check

- observed/expected、根因证据、机器字段范围和自然语言 non-goal 已明确，避免把所有文本输入粗暴改为同一策略。
- REQ-001 至 REQ-004 均由 AC-001 至 AC-004 覆盖；截图主路径、共享防回归和邻近行为均有自动化证据计划。
- 变更涉及多个前端 feature 但不触及 backend/domain/security，采用 bugfix + standard tier 合理，无阻塞产品决策。

## Open Issues

- 无阻塞项。WebView 系统候选的视觉本身无法由 jsdom 模拟，DOM 属性和最终 operation 参数作为可自动化的直接证据。

## Verification Evidence

- AC-001：新增 `ExactTextInput.test.tsx`，证明 shared input 强制输出 `autocapitalize="none"`、`autocorrect="off"`、`spellcheck="false"`，调用方相反属性不能覆盖；ref、maxLength、controlled change 仍透传，`test3` 保持原值。
- AC-002：`GitPane.graph.test.tsx` 在“从此提交创建分支”真实 overlay 路径验证三个 DOM 属性，并证明 `createBranchFromCommit` 收到的 name 精确为 `test3`。
- AC-003：实现审计确认 Git 四类分支名称与筛选、Git repository path、文件 path/name、terminal output/target search、connection host/username、network endpoints、transfer remote path 和 workspace Git remote path 均复用 `ExactTextInput`。目标文件剩余原生 inputs 仅为自然语言名称、数字端口、只读值或非文本控件。
- AC-004：10 个受影响测试文件的聚焦回归共 199 项通过；完整 `pnpm check` 通过 ESLint、76 个测试文件共 666 项测试、TypeScript no-emit 和 Vite production build；`git diff --check` 通过。

## Residual Risk

- jsdom 不能显示 macOS/WebView 的自动纠正候选气泡；测试验证的是平台识别的直接 DOM 控制属性与最终 Git operation 参数。建议在 macOS Tauri 窗口中输入一次 `test3`，确认系统候选不再出现。
- Vite 继续报告既有主 chunk 超过 500 kB 的非阻塞提示；新增组件为极小原生 wrapper，没有新 dependency 或独立 chunk。
