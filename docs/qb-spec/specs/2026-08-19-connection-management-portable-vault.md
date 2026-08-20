# Connection Management And Portable Credential Vault

## Goal

连接管理在连接数量增长时保持稳定布局，并允许用户为每个 profile 选择密码、私钥或 SSH Agent 作为默认认证方式；用户可选择保存密码、发现 `.ssh` 中的私钥，同时清楚理解密码/私钥方案的风险并优先采用 SSH Agent。

## Scope

- 连接管理弹窗使用固定的响应式高度；标题与操作区稳定，左侧连接列表和右侧编辑区分别在内部滚动。
- profile 的默认认证方式支持 `password`、`privateKey`、`sshAgent`，旧 profile 无损迁移。
- 密码认证提供显式“保存密码”选择；保存的密码进入独立、可迁移的 `credential-vault.json`，不进入 `profiles.json`。
- 首次保存密码时创建主密码；使用 Argon2id 从主密码和随机 salt 派生 256-bit 密钥，再用 AES-256-GCM 对凭据执行带认证加密。
- vault 保存 schema version、KDF 参数、salt、每条记录的随机 nonce、ciphertext 和认证 tag；主密码与派生密钥不得落盘。
- 首次使用已保存密码时解锁 vault；同一应用会话复用内存中的派生密钥，应用退出或用户手动锁定时清零。
- `.ssh` 私钥发现仅由用户主动触发，扫描当前用户 `.ssh` 第一层并返回安全元数据。
- 在快速连接弹窗与连接管理中选择密码或私钥时显示风险提示及“推荐 SSH Agent”；SSH Agent 显示推荐状态。
- 连接管理左侧新增“密码管理”按钮；vault 未初始化时先创建并确认主密码，已初始化时必须验证主密码，成功后才打开密码管理弹窗。
- 密码管理按连接展示名称、主机、用户名和掩码密码；用户可逐条查看原始密码或删除已保存密码。

## Constraints

- 主密码不可恢复；忘记后只能清空 credential vault，profile 与私钥路径不受影响。
- `credential-vault.json` 可离线迁移，但安全性最终受主密码强度约束；UI 必须明确说明该风险。
- KDF 默认采用 Argon2id 的内存受限推荐配置：64 MiB、3 passes、4 lanes、16-byte salt；参数必须随 vault 保存以支持未来升级。
- AES-GCM nonce 在同一派生密钥下不得重复；每次新增或更新凭据都生成新的 96-bit 随机 nonce。
- AEAD associated data 绑定 vault schema、profile id 和 credential type，防止密文记录被跨 profile 调换。
- `profiles.json` 继续拒绝 `password`、`passphrase`、`privateKeyData`、明文/密文 credential 等敏感字段。
- 密码管理每次打开都必须重新验证主密码，不得因应用会话中的 vault 已解锁而跳过；验证只授权当前管理弹窗实例。
- 管理弹窗默认只展示掩码；明文仅在用户点击对应查看按钮后进入该条目的局部 UI 状态，窗口失焦、弹窗关闭或删除条目时立即隐藏并释放。
- 初始化主密码必须二次确认，并提供强度提示；不允许空密码或少于 12 个字符的主密码。
- `.ssh` 扫描不递归、不跟随符号链接，忽略公钥、配置和 host-key 文件，限制候选数量与单文件大小；私钥正文不进入前端。
- 只列出当前 Rust SSH adapter 能识别的私钥，并明确标记加密、权限警告和不支持状态；扫描不会尝试口令或连接。

## Non-Goals

- 不把 vault 主密码、派生密钥或解密后的密码同步到云端、日志、Workspace 或 profile。
- 不实现主密码找回、安全问题或绕过解锁。
- 不解析 `~/.ssh/config`、`Match`、`Include`、`ProxyJump` 或自定义 `IdentityFile` 语义。
- 不递归扫描用户目录，不自动把私钥加入 SSH Agent，不实现 `ssh-add`。
- 本阶段不设计完整导入导出 UI；迁移格式保持独立、版本化，为后续打包 profiles 与 vault 留出入口。
- 不在密码管理中提供修改主密码、恢复主密码、批量导出明文密码或复制全部密码。

## Acceptance

1. 连接数量和表单内容增长不会改变弹窗外部高度；左右区域分别滚动，操作按钮始终可访问。
2. 新建和编辑 profile 均可选择密码、私钥或 SSH Agent；旧 schema 数据迁移后语义不变。
3. 密码仅在用户明确选择保存时进入 credential vault；取消保存或删除 profile 会删除对应密文记录。
4. 正确主密码可以在迁移后的 vault 中恢复凭据；错误主密码、篡改密文、错误 AAD 和重复/非法 nonce 均安全失败且不返回部分明文。
5. 主密码和派生密钥从不序列化；应用退出、锁定和失败路径会释放或清零内存秘密。
6. 密码与私钥方式显示风险提示，SSH Agent 具有推荐标识，但用户仍可继续使用前两种方式。
7. 用户主动扫描 `.ssh` 后只得到受限候选元数据；不会递归、跟随 symlink、读取超限文件或把私钥正文发送到前端。
8. 系统无 `.ssh`、目录不可读、候选为空或部分文件损坏时给出稳定、非泄漏错误，不影响手动文件选择。
9. 未初始化 vault 时，“密码管理”先完成主密码创建与确认；已初始化时，错误主密码不能打开管理弹窗。
10. 即使 vault 已在应用会话中解锁，每次打开密码管理仍需验证一次；验证成功后只在当前弹窗存续期间允许逐条查看原始密码。
11. 管理弹窗关闭或失焦后所有已显示密码恢复为掩码且明文状态被释放；删除保存密码不会删除对应连接 profile。

## Acceptance To Verification

- 1、6：React Testing Library 验证结构、滚动容器、风险 callout 和推荐状态；聚焦桌面手工检查固定高度。
- 2：frontend DTO、domain、persistence schema migration 单元测试与 round-trip 测试。
- 3、4、5：vault domain/adapter 测试，使用固定 fixture 覆盖正确解密、错误密码、篡改、AAD 置换、随机 nonce 和 zeroizing wrapper；持久化敏感字段拒绝回归测试。
- 7、8：临时目录 fixture 覆盖合法 key、`.pub`、config、symlink、子目录、超限和损坏文件；IPC DTO 测试确认只返回元数据。
- 9、10、11：密码管理 RTL 测试覆盖初始化、确认不一致、错误主密码、重复打开验证、逐条 reveal、失焦/关闭清理和仅删除 credential；Rust command/service 测试确认管理授权不能跨弹窗复用。
- 全部：`pnpm check`、Rust fmt/clippy/test；真实加密私钥与 sshd 集成测试作为安全门禁。

## Open Questions

- 无。普通连接使用已保存凭据时采用“首次使用解锁一次，应用会话内保持解锁，可手动锁定”；进入密码管理属于更高风险操作，每次打开必须重新验证主密码。

## Recommended Approach

将 profile metadata 与 credential vault 分离：profile repository 继续保存非敏感连接信息，credential vault adapter 独立负责 KDF、AEAD、原子写入和 secret lifecycle。连接应用服务按 profile id 解析一次性认证请求，UI 不直接读取 vault 文件或持有派生密钥。密码管理通过短生命周期的 backend authorization handle 获取单条解密结果，handle 绑定当前弹窗实例并在关闭时撤销；不得把完整 vault 明文列表一次性发送到前端。`.ssh` discovery 作为独立只读 adapter，只输出经过边界过滤的 key metadata。

相比把密钥与密文一起保存，该方案在保持 JSON 可迁移的同时避免“拿到文件即可解密”；相比系统凭据库，它需要用户管理主密码并承担离线猜测风险，因此必须使用 memory-hard KDF、认证加密和明确风险提示。

## Next Skills

- `writing-qb-plans`：认证、加密、schema 与文件扫描属于 Strict 计划。
- `maintaining-project-context`：更新长期凭据持久化与 `.ssh` 扫描决策。
- `checking-architecture-boundaries`：新增 credential-vault port/adapter，避免加密逻辑进入 UI 或 JSON profile repository。
- `protecting-critical-behavior`：优先建立 vault 与扫描边界回归测试。
- `verifying-before-completion`：执行前后端完整门禁及加密/迁移 fixture。
- `updating-directory-map`：实现新增 vault 模块后同步职责索引。
