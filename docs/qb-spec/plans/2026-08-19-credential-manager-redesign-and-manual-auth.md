# Credential Manager Redesign And Manual Authentication — Strict Plan

## Background

当前凭证弹窗为固定高度，但 `.credential-dialog .dialog-content` 没有 `flex: 1`，`.credential-dialog-grid { height: 100% }` 的百分比高度因此没有可解析的父级剩余高度，网格只按内容高度布局并在弹窗底部留下大块空白。认证模型目前只有 password/privateKey/sshAgent 三种持久化偏好，fallback 弹窗也只接受一次性密码、设备私钥路径或 Agent。persistence 同时保留了多代 profile、vault 和 workspace reader/migrator，以及启动时的旧路径复制。

## Requirement

实现规格 `docs/qb-spec/specs/2026-08-19-credential-manager-redesign-and-manual-auth.md` 的全部 acceptance：修复并重构凭证管理布局；增加不持久化选择的手动认证策略；提供连接编辑器内的凭证管理入口；移除全部旧配置兼容路径，同时保留当前 schema、安全校验和原子写入。

## Non-Goals

- 不实现旧文件转换工具或自动重置。
- 不改动 SSH 协议实现、known-hosts schema 或配置目录归属。
- 不在认证弹窗中承担凭证 CRUD。
- 不进行与任务无关的通用 Dialog/表单组件大重构。

## Architecture Impact

- `domain/profile` 拥有持久化连接策略 `Manual`；它只表达“连接前询问”，不携带秘密或 UI 选择结果。
- `workspace/configuredAuth` 将 `manual` 明确解析为 `null`，由 `WorkspaceShell` 进入临时认证编排。自动 vault 解锁仅用于带 credential reference 的自动路径。
- `ConnectionAuthDialog` 拥有本次连接的 UI 状态：password / credential / sshAgent、临时密码、临时 credential ID 和解锁子流程；成功后只输出一次 `SessionAuth`。
- `session` 的 stored-credential 解析继续在 Rust/application 边界完成；前端只传 credential ID，秘密不跨 WebView。
- profile/workspace/vault 的当前 persistence record 与 domain model 保持分离；adapter 只接受精确当前 schema，不再拥有 migration policy。
- 凭证管理弹窗继续通过 credential IPC 操作，不读取私钥正文。连接弹窗只负责打开管理层并在返回时刷新安全元数据。

## Domain Model Impact

- `AuthPreference` / `AuthPreferenceDto` / frontend `AuthPreference` 增加 `manual`。
- invariant：`manual` 与 `sshAgent` 保存时必须清空 `credentialId`；password/privateKey 可持有匹配类型的 credential reference，也可为空以在连接时回退到手动认证。
- `manual` profile 不保存最近一次手动方式、密码、credential ID 或 Agent 选择。
- credential domain、vault material 和 session executable auth 不新增 `manual` variant。

## API Impact

- profile create/update/list DTO 的 `authPreference` 增加 `manual` 枚举值。
- session IPC 不新增 transport variant；手动弹窗分别提交现有 `password`、`storedCredential` 或 `sshAgent`。
- credential list/status/unlock API 复用于手动弹窗和连接编辑器刷新，不增加返回秘密的宽接口。

## Database Impact

- `connections.json` 保持 schema v4，但 reader 仅接受 v4；record 删除 `privateKeyPath`，auth enum 增加 `manual`。
- `secrets.vault` 保持 schema v2，但删除 v1 document/record/check/AAD/migration 分支，只接受 v2。
- `workspaces.json` 保持 schema v4，但删除 v1/v2/v3 record 与迁移函数，只接受 v4。
- 删除启动时 app-data `profiles.json` / `credential-vault.json` 到 `~/.qterm` 的复制。
- 不兼容文件只返回 unsupported-version，不自动覆盖或删除；用户可自行备份后清理开发数据。

## Implementation Tasks

1. **先固定关键行为测试。** 扩展 profile domain/DTO/configured-auth 测试，定义 `manual` 不产生自动认证；扩展 ConnectionAuthDialog/WorkspaceShell 测试，定义 password/credential/Agent 三条临时路径和“不回写 profile”；为连接弹窗内打开凭证管理、保留草稿、刷新列表建立失败测试。
2. **收紧 persistence 到当前 schema。** 在 `src-tauri/src/lib.rs` 删除旧路径复制；在 profile repository 删除 v1-v3 接受逻辑、`private_key_path` 和迁移映射；在 vault 删除 v1 reader/migrator；在 workspace repository 删除 V1/V3 records、辅助迁移算法与 v2 acceptance。用旧 schema 拒绝且源文件不变测试替换 migration tests。
3. **扩展 profile 认证策略。** 更新 Rust domain、application/command DTO、persistence record、TS contracts、连接列表标签和连接编辑器选项。保存/切换到 manual 或 sshAgent 时清空 credential reference，并对该 invariant 添加测试。
4. **重构临时认证编排。** 将 ConnectionAuthDialog 的 UI 方法改为 `password | credential | sshAgent`；credential 页加载安全摘要，锁定时提供就地解锁流程，提交现有 `storedCredential`。删除一次性设备私钥路径选择及相应前端状态/测试；确认后端通用私钥选择命令是否仍被其他入口使用，只有确认零调用后才删除未使用 command。
5. **接入 manual 连接流程。** `resolveConfiguredAuth(manual)` 返回 null；WorkspaceShell 对 manual 直接打开认证弹窗，不预先初始化/解锁 vault。stored credential 路径仍按需解锁；取消解锁返回认证选择而不发起连接。
6. **修复并重新设计凭证管理。** 让 `.credential-dialog .dialog-content` 成为 `flex: 1; min-height: 0; overflow: hidden`，网格使用 `minmax(0, 1fr)` 占满剩余区域。按连接管理重构为约 210px 紧凑左栏、固定创建工具栏、独立滚动列表、右侧全高详情/编辑区和固定底部 actions；名称为主信息、类型/算法为次信息，不显示 UUID。
7. **加入连接编辑器内管理入口。** 将 credential select 与按钮包装为横向行；在 ConnectionDialog 保持编辑器挂载的前提下叠加 CredentialDialog，父层关闭处理在子层打开时失效。子层关闭后重新读取 vault status/credential summaries，保留 name/host/port/group/auth 等草稿；若已选凭证被删除则显示明确的“引用已失效”状态而不静默改写未保存草稿。
8. **完成视觉与可访问性细节。** 凭证列表选择和 editor 切换采用 140–180ms opacity/translate 动画，无弹跳且可被新选择立即覆盖；添加 reduced-motion 降级。验证 Tab、Escape、焦点回归、窄窗口以及列表过长时只有列表/编辑内容区滚动。
9. **清理文案与文档。** 将 `credential-vault.json` 等旧文件名改为 `secrets.vault`；更新 `ARCHITECTURE_SPEC.md`、`DECISIONS.md`、`PRODUCT_SPEC.md` 和 `DIRECTORY_MAP.md` 中的迁移承诺与认证方式。历史 task spec/plan 保留为历史记录，不篡改其当时结论；新增 superseded/current-only 决策说明。
10. **完整验证。** 先运行相关 Vitest 与 Rust module tests，再执行前后端完整门禁；用桌面运行检查凭证弹窗独立打开、从连接编辑器叠加打开、列表溢出、三种手动连接路径和 reduced-motion。

## Affected Files

- Frontend contracts/orchestration: `src/lib/tauri/profiles.ts`, `src/workspace/configuredAuth.ts`, `src/workspace/WorkspaceShell.tsx` 及相邻测试。
- Frontend dialogs/styles: `src/components/dialogs/CredentialDialog.tsx`, `ConnectionDialog.tsx`, `ConnectionAuthDialog.tsx`, `MasterPasswordDialog.tsx`, `src/app/app.css` 及相邻测试/style tests。
- Rust profile model/transport/persistence: `src-tauri/src/domain/profile.rs`, `application/profile_service.rs`, `commands/profile.rs`, `infrastructure/persistence/json_profile_repository.rs`。
- Rust vault/workspace/composition root: `src-tauri/src/infrastructure/persistence/json_credential_vault.rs`, `json_workspace_repository.rs`, `src-tauri/src/lib.rs`。
- Documentation: `docs/qb-spec/context/{PRODUCT_SPEC,ARCHITECTURE_SPEC,DECISIONS}.md`, `docs/qb-spec/DIRECTORY_MAP.md`。

## Acceptance To Verification

| Acceptance | Automated verification | Manual verification |
| --- | --- | --- |
| 1、2 | CredentialDialog RTL + CSS declaration tests | 640px/小高度窗口、0/1/大量凭证截图检查 |
| 3 | Credential CRUD/confirm RTL tests | 新建、取消、删除、清空交互 |
| 4 | profile DTO/domain + configuredAuth tests | 保存 manual 后重复连接均弹窗 |
| 5、6 | ConnectionAuthDialog + WorkspaceShell tests | password、locked credential、Agent 实连/失败回退 |
| 7 | ConnectionDialog overlay/draft/refresh tests | 修改未保存字段后开关凭证管理 |
| 8、9 | Rust exact-schema、immutable rejection、security tests | 放置旧开发文件确认明确报错且未被改写 |
| 10 | focus/keyboard tests、reduced-motion style test | 键盘 Tab/Escape 与系统减少动态效果 |

## Test Plan

- Frontend focused: `pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/components/dialogs/ConnectionDialog.test.tsx src/components/dialogs/ConnectionAuthDialog.test.tsx src/workspace/configuredAuth.test.ts src/workspace/WorkspaceShell.test.tsx src/app/appStyles.test.ts`。
- Rust focused: profile domain/service/command/repository、credential vault、workspace repository tests。
- 安全断言：profile/workspace JSON 不含 password/passphrase/private-key material；vault JSON 不含任何秘密明文；manual 连接不触发 profile update/create。
- Schema 断言：只接受当前 4/2/4，旧版和未知版均返回稳定错误且文件字节不变。
- Full gate: `pnpm check`；在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 桌面 QA: `pnpm tauri dev`，检查真实系统选择/Agent/vault 解锁、弹窗叠层和视觉高度；无需 release bundle。

## Rollback Plan

- 功能提交应拆为：schema cleanup、manual auth、credential UI 三个可独立回退的提交。
- 回退 UI/manual 时不得覆盖或删除用户文件；profile 中若已存在 `manual` 而代码回退，旧代码应按 unsupported/corrupt 显式失败。
- 不恢复自动 migration 作为紧急回退；开发数据如需恢复，使用用户备份或单独离线转换脚本，但该脚本不属于本任务。

## Risks

- **数据不可读：** 删除兼容 reader 后旧文件立即不可用。以精确版本错误和不改写源文件降低不可逆风险；文档明确开发数据需自行清理。
- **弹窗叠层焦点冲突：** 两个 DialogFrame 同时监听键盘可能导致 Escape 关闭父层。实现时必须验证 topmost-only 行为；必要时为 DialogFrame 增加最小 modal-stack 判定，而不是散落事件补丁。
- **临时选择误持久化：** 复用连接表单状态可能把手动 credential ID 写回 profile。认证弹窗必须维护独立局部状态，只输出 SessionAuth。
- **锁定状态竞态：** vault 可在打开认证弹窗后被锁定或清空。提交 stored credential 时以后端错误为准，并留在弹窗中提示重试。
- **兼容清理误删安全校验：** migration 类型与通用 JSON 安全检查相邻。删除时以敏感字段、大小、unknown fields、atomic write 和 tamper tests 作为保护线。

## Documentation Updates

- 新增长期决策：开发阶段采用 current-schema-only，不提供运行时 migration。
- 更新产品认证方式为 password credential / private-key credential / Agent / manual prompt。
- 更新架构文档中 persistence adapter 的职责，移除“显式迁移”承诺。
- 更新 Directory Map 对 persistence 与 CredentialDialog 的说明；目录结构本身不变。

## Next Skills

- 实现阶段先使用 `protecting-critical-behavior`，再按任务 1–9 执行。
- 完成前使用 `verifying-before-completion`。
- Directory Map: 仅更新说明，不需要结构扫描；若实现时新增/移动模块则改用 `updating-directory-map`。
