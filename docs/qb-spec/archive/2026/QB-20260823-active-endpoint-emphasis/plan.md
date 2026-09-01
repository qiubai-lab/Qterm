---
id: QB-20260823-active-endpoint-emphasis
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

> 实施状态：已完成（2026-08-23），并通过完整前端质量门。

> 根因确认：连接成功后的可见地址属于保留的 route progress surface；最终实现同时覆盖 route endpoint 与无 route progress 时的普通 endpoint。

Cyberpunk 活动且已连接窗口的 endpoint 身份使用红色主题强调。

## Scope

只修改状态标记、主题 token、标题栏样式和相邻契约测试。

## Affected Files

- `src/workspace/TerminalTargetPicker.tsx`
- `src/terminal/terminalChrome.css`
- `src/app/styles/themes/{dark,light,cyberpunk}.css`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`

## Design

标题栏存在普通目标详情与连接路由完成态两条 endpoint 渲染路径。前者通过祖先活动状态、`data-remote` 与 `data-status` 限定；后者匹配活动 Block 内 `.connection-route-progress.connected .connection-route-endpoint`。两者统一消费 `--block-active-endpoint-text`；Dark/Light 映射 `--dim`，Cyberpunk 映射 `--danger`。

## Acceptance To Verification

- 活动 connected endpoint：样式契约断言。
- 非 connected 与其他主题保持：选择器范围和 token 映射断言。
- 全局无回归：`pnpm check`。

## Test / Verification

1. `pnpm vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts --maxWorkers=1`
2. `pnpm check`
3. `git diff --check`

## Documentation Updates

完成后更新 spec/plan 状态；无需更新 Directory Map。
