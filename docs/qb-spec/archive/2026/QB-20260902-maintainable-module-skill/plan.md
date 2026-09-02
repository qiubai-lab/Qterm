---
id: QB-20260902-maintainable-module-skill
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# 可维护模块开发项目 Skill 执行计划

## Requirement

实现对应 spec 的 REQ-001 至 REQ-006，以现有模块边界与源码尺寸工具为事实源。

## Scope

- 新建项目 skill、执行 reference 与 UI metadata。
- 新建长期工程风格入口，更新 Directory Map。
- 不修改运行时代码、尺寸阈值、baseline 或构建配置。

## Affected Files

- `.agents/skills/qterm-maintainable-modules/`
- `docs/qb-spec/context/ENGINEERING_STYLE_SPEC.md`
- `docs/qb-spec/DIRECTORY_MAP.md`
- 本 spec 与 plan

## Design

- `SKILL.md` 保留触发、必读上下文、核心工作流、停止信号与完成门禁。
- 详细 placement matrix、增长预算、façade、测试和 review checklist 放入按需 reference。
- 数值限制不写入 skill，由 `scripts/check-source-size.mjs` 和 baseline 单点维护。
- 自动 invocation 保持开启；description 只覆盖非平凡功能和结构性修改。

## Implementation Tasks

- [x] 复盘近期大文件拆分 spec 与当前源码尺寸门禁，提炼重复问题和成功模式。
- [x] 创建 skill 入口、reference 与 UI metadata。
- [x] 将用户批准的长期工程原则写入 engineering context。
- [x] 更新 Directory Map 的项目 skill 结构入口。
- [x] 执行 skill validator、尺寸检查和差异审查，记录验收证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `quick_validate.py .agents/skills/qterm-maintainable-modules`，检查 YAML 与自动触发 description |
| AC-002 | 聚焦审阅 `SKILL.md` 的 workflow、stop signals 与 completion gate |
| AC-003 | 将 reference placement matrix 与 Directory Map 的 frontend/Rust 边界逐项核对 |
| AC-004 | `rg` 检查 skill 未复制默认行数阈值，并核对 checker/baseline 引用 |
| AC-005 | 检查 engineering context 与 Directory Map 的稳定入口和非重复性 |
| AC-006 | `pnpm check:source-size`、`git diff --check` 与运行时代码/依赖 diff 检查 |

## Test / Verification

1. 运行 skill `quick_validate.py`。
2. 运行 `pnpm check:source-size`。
3. 静态检查 skill 的触发范围、事实源引用和禁止反模式。
4. 运行 `git diff --check` 并确认本 change 未修改运行时代码或依赖。

## Documentation Updates

- 创建 `ENGINEERING_STYLE_SPEC.md` 作为长期原则和 skill 入口。
- 更新 Directory Map，只记录 `.agents/skills/` 的稳定职责与本 skill 入口。
