# Private Key Add And Generate

## Goal

凭证管理提供清晰、等权的“从本地文件导入”和“生成新私钥”入口，同时继续保证私钥正文只存在于 Rust Core 与加密凭证库中。

## Scope

- 将现有私钥创建页改为两个占满编辑区宽度、宽高一致的操作入口。
- 本地文件入口打开嵌套表单，收集凭证名称与可选私钥口令，再复用系统文件选择器导入。
- 生成入口打开嵌套表单，收集凭证名称、算法和可选注释，在 Rust 内生成并保存私钥。
- 首期生成算法仅支持 Ed25519（默认）和 ECDSA P-256。
- 成功后关闭嵌套弹窗、选中新凭证并自动派生展示公钥。

## Constraints

- 私钥正文、生成种子、解析后的第三方密钥类型不得进入 WebView、日志、事件、panic 文本或普通 IPC 返回值。
- 本地私钥仍只能由系统文件选择器授权；不支持粘贴私钥正文、任意路径或目录扫描。
- 生成使用操作系统安全随机源；只接受封闭算法枚举，RSA 必须拒绝。
- 生成私钥由现有 vault data key 加密保存，不额外设置或保存 key-level passphrase。
- 嵌套弹窗必须保留父管理器挂载，只让最上层处理 Escape/焦点循环并在关闭后恢复焦点。

## Non-Goals

- 不支持 WebView 粘贴私钥内容。
- 不生成 RSA、ECDSA P-384 或 ECDSA P-521 私钥。
- 不导出、下载或回显生成后的私钥正文。
- 不修改凭证库 schema、已有凭证或连接引用。

## Acceptance

1. 私钥添加页不再显示原内联名称/口令表单和底部“选择并导入”按钮，而是按“从本地文件导入、生成新私钥”顺序显示两个全宽等高入口。
2. 本地文件入口打开嵌套表单；名称为空时不能继续，取消系统选择器不创建凭证且表单仍可操作。
3. 生成入口打开嵌套表单；默认 Ed25519，可选择 ECDSA P-256，可填写最长 80 字符且不含控制字符的注释。
4. 生成命令 DTO 不包含私钥正文，只接受名称、`ed25519 | ecdsaP256` 和可选注释；未知算法与 RSA 被拒绝。
5. Ed25519 与 ECDSA P-256 均使用安全随机源生成不同密钥，序列化为可重新解析的 OpenSSH 私钥并通过现有 vault 加密保存。
6. 导入或生成成功后选中新凭证，显示正确算法并可派生/复制对应公钥；失败时保留弹窗和非敏感输入以便重试。
7. 凭证库锁定、弹窗关闭或流程取消时清空名称、口令、算法和注释等临时表单状态；任何路径都不向前端返回私钥正文。

## Acceptance To Verification

- 1、2、3、6、7：CredentialDialog Testing Library 覆盖入口结构、嵌套表单、取消、成功、失败、锁定和焦点/顶层弹窗行为。
- 1：appStyles 测试覆盖全宽等高入口及嵌套表单稳定布局。
- 4：TypeScript IPC 测试与 Rust DTO 反序列化测试覆盖窄参数和未知算法拒绝。
- 5、6：Rust 私钥生成单元测试覆盖两种算法、随机唯一性、OpenSSH round trip、算法元数据与 vault round trip。
- 最终运行 `pnpm check`、Rust fmt、Clippy 和全量测试。

## Open Questions

无。

## Recommended Approach

推荐复用现有 `CredentialDialog` manager 与 `DialogFrame` 堆栈，在私钥创建 stage 中只展示两个 feature-local 入口。文件导入继续调用现有命令；新增窄化 `credential_generate_private_key` 命令，将封闭 DTO 映射为 domain 算法枚举，再调用 SSH infrastructure 的生成/OpenSSH 编码能力，最后复用现有私钥解析与 credential lifecycle 保存路径。

相比把生成逻辑放入 React 或外部执行 `ssh-keygen`，该方案跨平台一致、无需 shell 权限，并维持私钥正文的 Rust-only 边界。

## Next Skills

- `writing-qb-plans`：Strict。
- `maintaining-project-context`：更新长期私钥来源与生成安全规则。
- `checking-architecture-boundaries`：保持 UI、command、domain 与 SSH infrastructure 职责分离。
- `protecting-critical-behavior`：测试优先保护 CSPRNG、算法白名单、vault round trip 与弹窗状态。
- `verifying-before-completion`：执行前后端完整质量门禁。
- Directory Map：若不新增模块或改变现有模块职责描述则不需要；若拆出新的生成模块则实现后更新。
