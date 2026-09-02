---
id: QB-20260902-maintainable-module-skill
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# 可维护模块开发项目 Skill

## Approval

用户明确要求根据近期类似模块化修改归纳开发规范，并落地为仓库级 skill，供后续功能迭代自动采用。

## Goal

把多次大文件治理中已验证的做法转化为可发现、可执行、可验证的项目工作流，使非平凡功能在进入稳定入口前先形成明确 owner、窄 façade、相邻测试和源码增长预算。

## Change Shape

- Type：`design`，变更的是长期工程工作流和模块质量约束，不改变产品行为。
- Tier：`standard`，涉及新项目 skill、长期工程 context 与 Directory Map，但不改变运行时代码、公共 API 或安全规则。

## Scope

- 新建自动发现的 `.agents/skills/qterm-maintainable-modules/` skill。
- 从近期 Git、SSH、Workspace、command/application 和前端模块化 change 中提炼通用决策规则。
- 复用现有源码尺寸 checker/baseline 作为唯一数值事实源，不复制一套新阈值。
- 将长期工程原则写入 `ENGINEERING_STYLE_SPEC.md`，并在 Directory Map 中登记项目 skill 入口。

## Non-Goals

- 不继续拆分任何当前热点文件。
- 不提高或新增源码尺寸 baseline，不改变 `pnpm check`。
- 不规定所有小函数都必须拆文件，也不以行数代替内聚性判断。
- 不改变应用架构、运行时行为、依赖或测试框架。

## Requirements

- REQ-001：skill 必须在新增纵向功能、扩展热点、引入状态/adapter 编排或调整模块边界时可被准确发现，并排除简单文案和 token-only CSS 修改。
- REQ-002：工作流必须要求先确定 owner 和 growth budget，再实现；baselined hotspot 不得因新功能继续增长。
- REQ-003：规范必须保持 React 与 Rust 现有分层方向，说明稳定 façade、capability module、单一状态 owner 和最小可见性原则。
- REQ-004：规范必须把测试布局视为模块边界的一部分，并覆盖失败、恢复、竞态、安全或回滚中实际相关的行为。
- REQ-005：源码限制必须引用现有 checker/baseline 事实源，并规定 ratchet 收紧和显式例外条件，不能复制易漂移阈值。
- REQ-006：长期工程 context 与 Directory Map 必须能把后续 agent 引导到该 skill，同时避免重复详细工作流。

## Acceptance Criteria

- AC-001 [REQ-001]：skill frontmatter、目录名和 UI metadata 通过官方 quick validator，描述包含清晰触发与排除范围。
- AC-002 [REQ-002, REQ-003]：skill 对 owner、growth budget、稳定 façade、纵向切片和 stop/reshape 信号给出可直接执行的顺序。
- AC-003 [REQ-003, REQ-004]：reference 提供与当前 Directory Map 一致的 placement matrix、测试规则和 review checklist，不引入相反依赖。
- AC-004 [REQ-005]：skill 不硬编码第二套行数限制，并明确 baseline 不增长、缩小时同批收紧、例外需用户批准。
- AC-005 [REQ-006]：`ENGINEERING_STYLE_SPEC.md` 和 Directory Map 记录稳定入口、职责和事实源，且没有任务流水账。
- AC-006 [REQ-001 至 REQ-006]：`pnpm check:source-size` 与相关文档/skill 检查通过，运行时代码和依赖清单无本 change 行为性修改。

## Behavior Delta

不适用。本 change 新增开发期指导和长期工程规范，不改变用户可观察的产品行为。

## Quality Check

目标、范围和非目标明确；REQ-001 至 REQ-006 均有 AC 覆盖。现有 checker 继续作为可执行事实源，skill 只负责改变 agent 的设计决策，无阻塞歧义。

## Risks

- 过度触发可能给微小修改增加流程负担；description 明确排除简单文案与 token-only CSS。
- 规则可能与项目结构漂移；placement 以 Directory Map 为准，数值以 checker/baseline 为准。
- 机械追求小文件可能造成转发碎片；skill 明确以 owner/change reason 为主，并提供无需拆分的判断。

## Verification Outcome

- AC-001：官方 `quick_validate.py` 返回 `Skill is valid!`；目录名、frontmatter 和 `agents/openai.yaml` 合法，默认保持自动发现。
- AC-002：48 行 `SKILL.md` 包含 required context、owner/growth budget 优先工作流、稳定 façade、纵向切片、stop/reshape 信号与完成门禁。
- AC-003：126 行按需 reference 提供 frontend、Rust、CSS、test 与 script placement matrix，以及 ownership/dependency/change-isolation review checklist；方向与 Directory Map 一致。
- AC-004：静态检查确认 skill/context 未复制默认行数或 `DEFAULT_LIMITS`；规范引用 checker/baseline，并要求 baseline 缩小时同批收紧、例外获得用户明确批准。
- AC-005：`ENGINEERING_STYLE_SPEC.md` 只保存长期原则和事实源入口；Directory Map 新增项目 skill 的稳定职责、入口与禁止内容。
- AC-006：`pnpm check:source-size` 通过且 0 ratchet reminders；`git diff --check` 通过。当前 change 只新增或修改 `.agents/skills/` 与 `docs/qb-spec/` 文档，没有修改运行时代码、依赖或构建配置。
- 残余风险：skill 的实际触发精度仍需以后续真实功能迭代观察；优先基于误触发或漏触发的具体证据窄化 description，不累积泛化规则。
