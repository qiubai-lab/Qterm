# SSH Config Import Strict Plan

## Background

连接管理目前只能逐条创建 profile，标题栏只展示凭证库状态。profile 已能表达 name、host、port、username、authPreference、credentialId 与 groupId，凭证库已能在 Rust 内校验和加密保存私钥，但现有私钥入口只能经系统文件选择器。用户已确认从 SSH config 导入时可解析 IdentityFile，但必须在预览中逐项明确授权。

## Requirement

在连接管理标题栏提供常驻导入入口，由用户选择 SSH Config 文件，安全预览和批量导入基础连接字段，并把用户明确选择的私钥导入或按公钥身份复用现有 portable credential 后关联 profile。

## Non-Goals

- 不让连接运行时读取 SSH config。
- 不导入密码、ProxyJump/ProxyCommand、Match、证书、转发或算法配置。
- 不写回 SSH config，不改变持久化 schema。
- 不建立通用文件导入框架或重构无关连接/凭证 UI。

## Architecture Impact

- 新增 `infrastructure/ssh/config_import.rs`：有界读取/Include 展开、Match 隔离、解析与私钥候选探测；不得访问 repository 或 Tauri。
- 新增 application 导入用例：把 importer candidate 映射并验证为 profile，检测 endpoint 重复，编排 credential/profile 写入和回滚。
- `commands/profile.rs` 拥有系统文件选择、一次性预览令牌、preview/commit DTO 与安全字段裁剪；通过 `CredentialState` 的窄化方法按公钥身份复用或导入已授权私钥。
- 前端新增 feature-local `SshConfigImportDialog`，ConnectionDialog 只控制打开/关闭、刷新和标题栏入口。

## Domain Model Impact

不修改持久化 domain model。SSH config candidate 是外部格式的 application/infrastructure model；导入成功后仍构造现有 `ConnectionProfile` 和 `CredentialSummary`。私钥授权不是新的认证类型。

## API Impact

- `profile_import_ssh_config_preview`：打开默认位于 `~/.ssh` 的系统文件选择器，取消返回空；选择后返回一次性 previewId、文件名、非敏感候选与警告。
- `profile_import_ssh_config_commit`：接收 previewId、alias、私钥候选索引和可选口令，不接受 groupId；后端固定创建未分组连接。
- DTO 禁止接受或返回私钥路径、正文、密码字段或任意配置路径。

## Database Impact

无 schema 变化。批量 profile 通过 repository 单次锁定/原子写入；vault 继续使用现有 schema。跨文件失败对本次新建 credential 做尽力删除回滚。

## Implementation Tasks

1. 添加 parser 依赖并用 tempfile 测试固定 Host/Include/Match/IdentityFile 行为。
2. 实现有界配置展开和 parser candidate 模型；只枚举无通配、无否定的字面别名。
3. 为 profile repository/service 增加批量创建，先完整校验再单次保存。
4. 为 `CredentialState` 增加按解析后公钥身份查找的窄接口；同公钥复用，同名不同公钥新建。
5. 实现系统文件选择、一次性 previewId 与 commit command/TS adapter，移除 groupId 并确保 config/私钥路径均不跨 IPC。
6. 重构 SshConfigImportDialog：先显示紧凑说明窗并由“选择配置”显式触发选择器；选择后显示双 Tab 管理器，把同高、水平对齐的截断文件名与小尺寸“重新选择”放入标题栏并移除分组组件；连接列表采用约 40px 的中性紧凑行，移除突兀的左侧选中色条，凭证条目同步保持合理密度。
7. 在 ConnectionDialog 标题栏按状态、导入、关闭顺序挂载入口，并保持父编辑草稿。
8. 更新 context 与 Directory Map，执行完整验证。
9. 修复导入身份判定：后端预览与提交均以名称（不区分大小写）、用户名、规范化 Host 和端口识别已导入候选；完整身份相同则禁用并显示“已导入”，仅 endpoint 相同但名称不同仍默认选中并批量创建；对预览后新出现的完整重复候选返回变化错误。
10. 在后端预览与提交中使用同一名称分配规则：按不区分大小写的现有名称集合依次分配，冲突时追加递增序号并为 80 字符上限预留后缀；前端展示分配后的名称和改名状态，但提交继续只发送非敏感 alias。

## Acceptance To Verification

| Acceptance | Test / check |
| --- | --- |
| 标题栏顺序和键盘可达 | ConnectionDialog RTL 查询 header action 顺序和按钮名称 |
| Host/default/Include 解析 | config_import Rust unit tests |
| Match/高级配置隔离 | fixture 断言字段不污染且 warning 存在 |
| 路径/正文不跨 IPC | DTO serde 测试与 TS invoke payload 测试 |
| vault lock、加密口令、关联与降级 | command/application tests + dialog tests |
| 按公钥身份复用且同名不同密钥可导入 | credential command 回归测试 |
| 批内私钥去重与 profile 原子创建 | application/repository tests |
| 前置说明、显式文件选择、后端固定未分组、双 Tab、标题栏文件名与小尺寸操作、紧凑长列表和反馈 | dialog behavior/style tests + IPC/DTO tests |
| 完整身份已存在、同 endpoint 异名 | Rust preview/commit identity tests + dialog imported-state/default-selection/submit tests |
| 名称与现有连接或同批候选冲突 | Rust unique-name allocation tests + preview DTO test + dialog renamed-state test |

## Test Plan

- 先写 Rust importer 与 DTO 安全失败测试，再实现解析/命令。
- 先写前端标题栏和导入弹窗失败测试，再实现 UI。
- 聚焦：相关 Vitest、Rust module tests。
- 完整：`pnpm check`；在 `src-tauri/` 运行 fmt、clippy 和 all-targets tests。
- 不运行 `pnpm tauri build`：无 native dependency family、Tauri config 或打包设置变化。

## Rollback Plan

删除新增 command/adapter/dialog/importer，移除 parser 依赖和标题栏入口；profile/vault schema 未变化，无数据迁移回滚。已由用户导入的 profile/credential 是普通现有实体，可继续使用或在管理器内删除。

## Risks

- 第三方 parser 不完整支持 Match/token；通过前置隔离、警告和不执行语义控制。
- Include 可能递归或放大读取；通过深度、文件数和字节上限控制。
- 所选文件可能在预览后变化；commit 使用后端令牌重新解析，并重新执行重复与候选校验。
- vault 与 profile 分属两个文件；通过先验证、批量 profile 原子写入和新 credential 尽力回滚降低残留。
- 多个 IdentityFile/加密口令增加交互复杂度；第一版每个 Host 只允许授权一个已探测候选，其他条目显示警告。

## Documentation Updates

- `docs/qb-spec/context/PRODUCT_SPEC.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`
- `docs/qb-spec/DIRECTORY_MAP.md`
