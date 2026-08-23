# 主机身份概要与复制入口实施计划

计划级别：Standard

## 影响范围

- `src/components/HostIdentity.tsx` 及测试：共享触发器、概要浮层、视口定位、剪贴板反馈。
- `src/workspace/TerminalTargetPicker.tsx`：普通直连路径接入共享组件。
- `src/components/ConnectionRouteProgress.tsx`：连接路由完成态接入共享组件。
- `src/workspace/LayoutView.tsx`：向路由路径传递已解析的 profile，不新增业务查询。
- `src/terminal/terminalChrome.css`、`src/terminal/terminalSurface.css`：触发器与浮层主题样式。
- `src/app/styles/themes/{dark,light,cyberpunk}.css`：活动主机身份主题映射。
- `src/app/appStyles.test.ts`、`src/app/themeStyles.test.ts`：样式与 token 合约回归。

## 实施步骤

1. 创建无业务状态依赖的 `HostIdentity`，接收 profile 摘要并只复制 `host`。
2. 实现 portal 浮层、视口约束定位、外部点击、Escape 和焦点恢复。
3. 让目标选择器仅在远程且 connected 时渲染共享组件，其余状态继续显示普通详情。
4. 让路由完成态使用同一组件，并由三个 Block 类型传入对应 profile。
5. 将 endpoint 的活动色、hover/focus surface 和浮层全部落到共享主题语义角色。
6. 添加行为、样式与主题契约回归测试，执行聚焦测试与 `pnpm check`。

## 风险与约束

- Header 本身支持拖动；触发器必须保持 button 语义，使既有拖动过滤逻辑忽略该交互区域。
- 两个 portal（路由节点 tooltip 与主机概要）可能同时存在；点击主机时应由独立状态控制，且概要层级高于节点 tooltip。
- 剪贴板插件在浏览器测试中需要 mock；失败不能关闭浮层，应显示可恢复反馈。
- profile 变化或组件卸载时不得遗留全局 pointer/keyboard/scroll listener。

## 验证映射

- A2/A3/A4 → `HostIdentity.test.tsx`、`ConnectionRouteProgress.test.tsx`、`TerminalTargetPicker.test.tsx`。
- A1/A6 → `themeStyles.test.ts`、`appStyles.test.ts`。
- A5 → `TerminalTargetPicker.test.tsx` 的本地与未连接回归。
- 集成门禁 → `pnpm check`。

## 完成记录

- 聚焦回归：6 个测试文件、96 项测试通过。
- 完整门禁：`pnpm check` 通过，包含 ESLint、51 个测试文件共 401 项测试、TypeScript 与 Vite production build。
- 构建仅保留既有的大 chunk 提示，没有新增错误或警告级 lint 问题。
