---
id: QB-20260902-git-picker-path-edit-polish
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
---

# Plan

## Requirement

实现 `QB-20260902-git-picker-path-edit-polish` 的 REQ-001 至 REQ-005。

## Scope

只调整 Git picker 的路径编辑/取消/目录行呈现和仓库 Qterm UI skill，不扩散修改其他既有弹窗。

## Affected Files

- `src/git/GitRepositoryPickerDialog.tsx`
- `src/git/GitRepositoryPickerDialog.test.tsx`
- `src/git/styles/gitRepositoryPicker.css`
- `src/git/gitStyles.test.ts`
- `.agents/skills/qterm-interface-design/SKILL.md`
- `.agents/skills/qterm-interface-design/references/qterm-ui-spec.md`

## Design

- 将 picker path shell/form/input CSS 收敛到 `fileBrowser.css` 的透明、单底线编辑模型。
- 使用现有 `Button variant="danger"` 和主题 `--danger` token，不添加 feature-local 颜色。
- 删除 JSX trailing icon，并将正常/窄视口 grid 从四列改为三列。
- skill 只记录能改变后续实现决策的主题语义规则，不复制按钮 CSS。

## Implementation Tasks

- [x] 修复 path shell/input CSS 并保持键盘行为。
- [x] 设置 picker 取消按钮 danger variant，移除目录箭头与网格列。
- [x] 更新组件和样式契约测试。
- [x] 增量更新 repository skill/reference 并运行 skill validator。

## Acceptance To Verification

- AC-001、AC-002、AC-003、AC-005：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts` 与 `pnpm check`。
- AC-004：`python C:/Users/Test/.codex/skills/.system/skill-creator/scripts/quick_validate.py .agents/skills/qterm-interface-design`，并审阅 skill diff。

## Test / Verification

先运行 picker 聚焦测试和 skill validator，再运行完整前端检查及受影响文件 diff check。

## Documentation Updates

用户已明确批准将取消按钮主题语义写入 repository skill；不另行更新不存在的 `UI_STYLE_SPEC.md`，不改变 Directory Map。
