## Requirement

修复连接管理侧栏的主题 hover 割裂：分组展开箭头不得单独黄色高亮，分组和连接信息的 hover 应由当前主题的语义颜色统一控制。

## Scope

只调整连接管理分组箭头的颜色继承并补充样式契约；不修改全局主题 palette、组件行为或布局。

## Affected Files

- `src/components/dialogs/connectionDialog.css`
- `src/app/themeStyles.test.ts`
- `docs/qb-spec/specs/2026-08-24-connection-manager-theme-hover.md`
- `docs/qb-spec/plans/2026-08-24-connection-manager-theme-hover.md`

## Design

让 `.connection-group-chevron` 继承 `.connection-group-toggle` 的文字颜色，用透明度保持默认态层级，hover 时仅提升透明度。保留 `.connection-group-heading:hover` 与 `.connection-item:hover` 对现有主题 token 的使用。

## Acceptance To Verification

- 箭头不使用 `--icon-hover`：在主题 CSS 契约测试中检查箭头规则。
- 分组和连接 hover 适配主题：断言使用 `--hover` / `--text` 语义 token。
- 交互和构建无回归：运行相关 Vitest 和 `pnpm check`。

## Test / Verification

1. 运行 `pnpm exec vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts`。
2. 运行 `pnpm check`。

## Documentation Updates

仅新增本任务的 spec 与 plan；无需更新长期项目上下文或 Directory Map。
