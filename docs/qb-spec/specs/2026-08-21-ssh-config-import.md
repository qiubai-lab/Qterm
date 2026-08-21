# SSH Config Import

## Goal

用户可从连接管理标题栏选择并预览 SSH Config 文件中的非敏感连接信息，并可在逐项明确授权后将可用的 `IdentityFile` 私钥安全导入加密凭证库并自动关联连接。

## Scope

- 在连接管理标题栏按“凭证库状态 → 导入 → 关闭”的顺序提供常驻“导入”按钮。
- 点击“导入”后先显示紧凑说明窗，告知可选择系统已有的 `~/.ssh/config`；只有用户点击“选择配置”后才打开默认位于 `~/.ssh` 的系统文件选择器。
- 在嵌套导入弹窗中用“连接信息 / 凭证”两个可切换 Tab 分离连接选择与私钥授权。
- 所有连接由后端强制导入“未分组”，界面不提供导入分组选择；用户导入后可在连接管理中自行调配。
- 文件选定进入导入管理器后，文件名与小尺寸“重新选择”共同显示在标题栏右侧，文件名位于按钮左侧且过长时截断。
- 用户可逐项选择连接；私钥默认不导入，只有逐项勾选后才读取、校验、加密保存并关联。
- 加密私钥在导入行内收集一次性口令；口令只进入受控 IPC，不持久化到 profile 或前端长期状态。
- 私钥去重使用公钥身份，不使用凭证名称：已有相同公钥时复用凭证，同名但公钥不同的私钥仍可导入；不可用或未授权的私钥使连接降级为 `manual`。

## Constraints

- 私钥路径与正文不得进入 WebView、日志或 profile；前端只接收文件名、状态与稳定候选索引。
- 用户选择的 config 路径不得进入 WebView；前端仅持有后端生成的一次性预览令牌与文件名。
- `Match`、ProxyJump、ProxyCommand、token 展开等高级语义不作为连接能力导入，并必须显示警告。
- Include 展开必须限制深度、文件数、单文件大小和总字节数；不得执行 shell 或 `Match exec`。
- profile 与 credential 保持独立模型；SSH config DTO 不复用 domain 或 persistence model。
- 不改变 `connections.json` 或 `secrets.vault` schema。

## Non-Goals

- 不让 Qterm 运行时直接依赖 SSH config。
- 不导入密码、证书、Agent、转发、跳板机、算法或系统级 SSH 配置。
- 不支持编辑或写回 `~/.ssh/config`。
- 不保证跨 profile catalog 与 vault 两个文件的崩溃级事务原子性；提交失败时做尽力回滚并保留明确结果。

## Acceptance

1. 标题栏显示带导入图标的“导入”按钮，位于凭证库状态右侧、关闭按钮左侧，键盘可达。
2. 普通 Host、多别名、Host 通配默认、HostName、Port、User 和有界 Include 得到正确预览；通配/否定模式本身不生成候选。
3. Match 块不会污染普通 Host；ProxyJump/ProxyCommand/Match 等高级配置产生可见警告且不被执行。
4. 预览不返回私钥完整路径或正文；未勾选私钥时不读取私钥正文或写入凭证库，连接以 `manual` 导入。
5. 勾选可用私钥时要求 vault 解锁，Rust 校验文件并加密保存，连接关联 credential 并设为 `privateKey`；加密私钥必须使用一次性口令。
6. 同批相同私钥只创建一个 credential；私钥失败不会把路径写入 profile，也不会阻止用户改为仅导入连接。
7. 与已有连接的名称、用户名、规范化 Host 和端口均相同的候选标记为“已导入”且不可重复选择；只有 endpoint 相同但名称不同的候选继续允许导入。导入成功刷新连接列表并保持原连接编辑草稿不被嵌套弹窗清空。
8. 导入弹窗具备加载、空、错误、禁用、成功状态；长列表独立滚动，标题和底部操作固定。
9. 打开导入流程先显示紧凑说明窗，不自动打开系统选择器；点击“选择配置”后选择器默认定位 `~/.ssh`，取消后仍停留在说明窗，所选文件路径不跨 IPC。
10. “连接信息 / 凭证”使用语义化 Tab；“已导入”只由完整连接身份判定，不会仅因 endpoint 或凭证同名禁用有效连接或私钥。
11. 导入 DTO 不接受 groupId，所有 profile 的 groupId 由后端固定为 null；凭证按公钥身份复用，同名不同密钥可分别保存并关联。
12. 导入管理器内容区不再显示重复的文件选择或分组选择组件。
13. 导入管理器标题栏按“文件名 → 重新选择 → 关闭”排列，三者高度和垂直中心一致；连接列表使用约 40px 的紧凑双行条目，选中状态由复选框、轻量边框与状态色共同表达，不使用左侧高亮条或大面积高饱和填充；凭证条目同步保持合理密度。
14. 同一 Config 内或已有连接中解析到相同 `username@host:port`、但名称不同的多个别名允许全部选择和导入，不因 endpoint 相同而互斥、禁用或误报“预览失效”。
15. 导入连接名称与现有连接或同批候选名称发生不区分大小写的冲突时，后端自动追加递增序号生成唯一名称；预览展示最终名称及改名说明，提交仍以 alias 定位原始候选，用户无需逐项处理冲突。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1、7、8 | ConnectionDialog 与 SshConfigImportDialog Testing Library 测试；样式契约测试 |
| 2、3 | Rust SSH config importer 单元测试，使用 tempfile 配置与 Include fixture |
| 4、5、6 | Rust command/application 测试验证 DTO 脱敏、vault lock、口令、降级与批内去重；前端 IPC/交互测试 |
| 9、12、13 | SshConfigImportDialog 前置说明窗、取消/进入管理器与标题栏顺序测试；样式契约测试紧凑行高、文件名截断与克制的选中态；代码检查选择器起始目录 |
| 10、11 | SshConfigImportDialog Tab 测试；DTO 拒绝 groupId、Rust 固定未分组与公钥身份去重回归测试 |
| 7、10、14 | Rust preview/commit 完整身份匹配与同 endpoint 异名测试；SshConfigImportDialog “已导入”禁用、默认计数和异名批量提交测试；错误语义回归测试 |
| 15 | Rust 名称分配边界测试（现有名称、批内冲突、大小写与长度）；SshConfigImportDialog 改名提示测试 |
| 全部 | `pnpm check`；`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` |

## Open Questions

无。已确认私钥采用预览中逐项显式授权，不做静默自动导入。

## Recommended Approach

采用“紧凑前置说明窗 → 系统选择器 → 导入管理器”的显式两阶段流程，并继续使用 Rust 一次性预览令牌。提交协议不包含 groupId，后端固定构造未分组 profile。后端以“名称（不区分大小写）+ 用户名 + 规范化 Host + 端口”判定是否已导入；相同 endpoint 的不同 SSH 别名作为独立连接保留。名称唯一化由后端按现有连接与本批候选统一分配，前端只展示结果。前端继续用双 Tab 分离连接选择和凭证授权，凭证按公钥身份复用。

## Next Skills

- `writing-qb-plans`：Strict 计划。
- `checking-architecture-boundaries`：隔离 parser、application use case、command DTO 与 credential/profile model。
- `protecting-critical-behavior`：优先保护配置语义、秘密边界、vault 状态与批量导入失败路径。
- `maintaining-project-context`：更新产品流程、架构安全规则与 accepted decision。
- `verifying-before-completion`：执行前后端完整质量闸口。
- `updating-directory-map`：记录新增 SSH config adapter 与导入弹窗入口。
