---
id: QB-20260819-pointer-drag-group-regression
status: archived
archived: 2026-09-02
legacy: true
---
# 连接分组 Pointer 拖动回归修复 Task Spec

Status: Complete (2026-08-19)。

## Goal

连接项在 Tauri 桌面 WebView 中可以可靠、直接地拖到其他分组或“未分组”，不再依赖不稳定的浏览器原生 Drag and Drop 事件链。

## Scope

- 用 Pointer Events 和 pointer capture 替换连接项的 HTML Drag and Drop。
- 指针移动超过 8px 后才进入拖动，避免普通点击被误判。
- 拖动预览保持抓取偏移并持续跟随指针。
- 通过当前指针坐标命中整个分组区块，持续更新有效落点高亮。
- pointer up 在有效目标提交移动；pointer cancel 或无效目标完整清理状态。

## Constraints

- 继续复用现有 `moveProfile/updateProfile`，不改变后端、schema 或领域规则。
- 同组释放不写入；右键菜单和键盘管理路径保持可用。
- 仅主指针左键启动拖动，保留右键菜单。
- reduced-motion 下不使用位移补间，预览仍保持即时跟手。

## Non-Goals

- 不实现连接/分组排序、惯性投掷、触屏长按菜单或跨窗口拖放。

## Acceptance

1. 左键按下并移动超过阈值后出现跟手预览，原连接项显示拖动状态。
2. 指针进入其他分组或“未分组”时目标高亮，释放后持久化正确 `groupId`。
3. 同组、空白区域释放或 pointer cancel 不调用更新并清理所有视觉状态。
4. 未超过阈值的普通点击仍选择连接，右键菜单不受影响。

## Acceptance To Verification

- 1–4：更新 `ConnectionDialog.test.tsx`，以 pointerDown/move/up/cancel 覆盖真实手势状态机。
- 样式：`appStyles.test.ts` 验证预览、抓取光标和 reduced-motion 契约。
- 全量：`pnpm check` 与 Rust 质量门禁。

## Open Questions

无。

## Recommended Approach

保留原生 Drag and Drop 只能继续依赖 WebView 差异，修补事件细节无法形成可靠保证；Pointer Events + pointer capture 能连续获得位置、明确处理取消并提供 1:1 反馈，因此采用后者。

## Verification Evidence

- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx`：11 项通过。
- `pnpm check`：ESLint、93 项 Vitest、TypeScript 与 Vite production build 全部通过。
- `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`：76 项通过，1 项依赖本机 OpenSSH 环境的测试按既有标记忽略。
- `git diff --check`：通过。

## Next Skills

- `writing-qb-plans`（Standard：交互状态机回归修复）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context / Directory Map: not needed
