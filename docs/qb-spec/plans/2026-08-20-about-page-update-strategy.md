## Requirement

用项目信息和静态更新占位替换帮助页快捷键列表，并形成可执行的正式 updater 方案。

## Scope

包含 HelpDialog 内容与样式、帮助入口名称、运行时版本读取、相邻测试和版本检测评估文档；不包含 updater 依赖、签名密钥、CI 或安装行为。

## Affected Files

- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/InfoDialogs.test.tsx`
- `src/workspace/WorkspaceShell.tsx`
- `src/workspace/WorkspaceShell.test.tsx`
- `src/app/app.css`
- 本 task spec 与 plan

## Design

使用标准 DialogFrame。顶部产品身份作为单一视觉锚点；中间以紧凑 definition list 呈现可扫描元数据；底部更新卡片只显示中性占位状态，不包含按钮或链接。版本由 `@tauri-apps/api/app` 的 `getVersion()` 读取，浏览器开发模式降级为“开发构建”。

正式更新推荐单独实施 Tauri Updater：配置 public key、HTTPS GitHub `latest.json` endpoint 与 updater artifacts；CI 私钥仅存在受保护 secrets；UI 状态机覆盖 idle/checking/latest/available/error/downloading/ready，并把安装与重启留给用户确认。

## Acceptance To Verification

- 项目元数据、真实版本、降级状态、链接与内容替换：`InfoDialogs.test.tsx`。
- 工具栏入口更名：`WorkspaceShell.test.tsx`。
- 内容滚动、紧凑响应与 reduced-motion：CSS 规则检查及生产构建。
- 全局回归：`pnpm check`。

## Test / Verification

1. 运行 `pnpm test -- src/components/dialogs/InfoDialogs.test.tsx src/workspace/WorkspaceShell.test.tsx`。
2. 按需补充 `appStyles.test.ts` 的 about-page 布局断言。
3. 运行 `pnpm check`。

## Documentation Updates

本 spec 记录当前 updater 缺口、方案比较与推荐路径。Directory Map 无需更新。
