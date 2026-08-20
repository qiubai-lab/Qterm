# 终端高度分层与窗口间距实施计划

## Requirement

Plan Level: Standard。改动覆盖终端容器契约、布局间距、回归测试和视觉验证，但不涉及领域模型或后端。

## Scope

修复 tall Terminal Block 中的背景分层，并缩小画布 padding、split divider 和最大化 inset；不改变 split 状态与 xterm resize 流程。

## Affected Files

- `src/app/app.css`
- `src/app/appStyles.test.ts`
- 本 task spec 与 plan

## Design

将旧 `.terminal` 规则改为组件真实输出的 `.terminal-surface`，继续使用 `flex:1`、`min-height:0` 和一致背景色。画布 padding 与最大化 inset 统一为 2px，横纵 divider 统一为 3px。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| surface 填满高 Block | CSS 契约回归测试；浏览器比较 surface 与 Block 内容高度。 |
| 背景无分层 | 浏览器检查 surface/xterm/Block 背景色和截图。 |
| 间距紧凑 | CSS 测试与浏览器测量 padding、divider 宽高。 |
| 行为无回归 | `pnpm check` 覆盖 layout、provider 与 app 测试。 |

## Test / Verification

1. 先添加 CSS 契约测试并确认旧实现失败。
2. 修复样式后重跑聚焦测试。
3. 在本地浏览器构造双 Block 高画布，测量高度与间距并截图。
4. 运行 `pnpm check` 和 `git diff --check`。

## Documentation Updates

更新本 task spec 状态；无需长期 context 或 Directory Map 更新。
