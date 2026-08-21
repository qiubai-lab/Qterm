# Credential Public Key Refresh Plan

## Requirement

在私钥凭证的 OpenSSH 公钥复制按钮前增加刷新按钮，安全地重新派生当前公钥。

## Scope

只调整凭证管理组件、相邻样式和前端行为测试；不修改后端、IPC、持久化或密钥轮换语义。

## Affected Files

- `src/components/dialogs/CredentialDialog.tsx`
- `src/components/dialogs/CredentialDialog.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

将公钥标题右侧改为紧凑操作组，刷新按钮复用现有 `refresh` 图标与 `generatePublicKey`。当前凭证派生中时，刷新与复制按钮同时禁用；既有 request generation 继续防止过期异步结果覆盖当前选择。

## Acceptance To Verification

- 按钮顺序和可访问名称：RTL DOM 顺序断言。
- 再次派生与更新结果：RTL 断言 IPC mock 第二次调用及新文本。
- 忙碌禁用与恢复：使用可控 Promise 断言刷新、复制及 `aria-busy` 状态。
- 布局密度：样式测试断言操作组和图标按钮尺寸。
- 现有行为：运行 CredentialDialog 与 appStyles 聚焦测试，最后运行 `pnpm check`。

## Test / Verification

- `pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/app/appStyles.test.ts`
- `pnpm check`

## Documentation Updates

本计划与对应 task spec 即为所需文档；无需更新长期 context 或 Directory Map。
