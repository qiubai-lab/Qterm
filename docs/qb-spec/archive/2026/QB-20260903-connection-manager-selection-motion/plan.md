---
id: QB-20260903-connection-manager-selection-motion
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
---

# 连接管理主题分组与选择动效计划

## Requirement

实现 REQ-001 至 REQ-006，并保持连接管理业务与传输契约不变。

## Scope

只修改连接管理 presentation、局部动效 hook、主题兼容样式、相邻测试和结构索引；不修改后端、IPC 或持久化。

## Affected Files

- `src/components/dialogs/ConnectionDialog.tsx`
- `src/components/dialogs/connection/ConnectionSelectionIndicator.tsx`
- `src/components/dialogs/connection/useConnectionManagerMotion.tsx`
- `src/components/dialogs/connectionDialog.css`
- `src/components/dialogs/ConnectionDialog.test.tsx`
- `src/components/dialogs/connectionManagerMotion.test.ts`
- `src/app/themeStyles.test.ts`
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

- 局部 hook 根据主连接 DOM 行相对滚动列表的位置维护单一承载面位置；首次定位禁用过渡，后续选择使用 transform/opacity，布局变化通过 layout effect 与 ResizeObserver 重算。
- hook 同时拥有 editor transition key/mode；已有连接切换与新建状态分别触发 switch/create keyed 面板入场，不参与保存或表单状态所有权。
- 分组颜色只消费现有 `--accent`、`--accent-bg`、`--border` 和文本 token；Cyberpunk 已将 `--accent` 定义为青色。

## Implementation Tasks

- [x] 先增加主题、列表主选择、编辑切换和 reduced-motion 的失败契约测试。
- [x] 新增连接管理局部 motion hook/indicator，并通过窄接口接入基线热点入口。
- [x] 更新列表、分组与编辑 stage 样式，保留多选和拖放层级。
- [x] 更新 Directory Map 的局部 presentation 所有权。
- [x] 运行聚焦测试、源码尺寸、lint/typecheck/build 与完整前端检查。

## Acceptance To Verification

- AC-001：`themeStyles.test.ts` 与 motion CSS 契约。
- AC-002～AC-004：`ConnectionDialog.test.tsx` 可观察切换行为。
- AC-005：`connectionManagerMotion.test.ts` 的 motion/reduced-motion 契约。
- AC-006：`pnpm check:source-size`、聚焦 Vitest、`pnpm check`、`git diff --check`。

## Documentation Updates

新增局部 hook 后更新 Directory Map；验证通过后归档本 spec 与 plan。不更新长期主题规范，因为实现复用既有语义 token 与动效规则。
