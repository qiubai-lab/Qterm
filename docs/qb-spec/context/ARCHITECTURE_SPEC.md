# Architecture Spec

## Technology Baseline

- Desktop shell: Tauri 2
- Frontend: React + TypeScript + Vite + xterm.js
- Core runtime: Rust + Tokio
- SSH: russh
- File transfer: russh-sftp
- Authentication: one-time password, reusable encrypted credential reference, and system SSH Agent

## Trust Boundaries

- 前端是不可信展示边界，只短暂持有输入或按需显示的单条密码；不得直接持久化。私钥正文、KEK、vault data key 永不进入前端。
- Tauri command 是 transport adapter，只校验 DTO、将敏感输入包装为 secret type、调用应用服务并映射错误。
- 应用层拥有连接、认证、host-key、终端和传输的编排与状态机。
- SSH/private-key/SFTP/known-hosts 是基础设施实现，不能把库类型泄漏为前端或持久化契约。

## Dependency Direction

```text
Frontend -> Tauri Commands -> Application -> Domain / Ports <- Infrastructure
                                      ^                         |
                                      +------ composition ------+
```

`src-tauri/src/lib.rs` 是组合根。Infrastructure 实现 ports；domain 和 application 不依赖 Tauri、russh、xterm.js 或具体存储格式。

## Model Separation

- Domain model 表达 profile、authentication request、trust decision、session 和 transfer 状态。
- 普通 IPC DTO 只包含 UI 所需字段和稳定错误码；认证请求 DTO 是唯一允许短暂携带密码/口令的受控例外，且不得被记录或持久化。
- Persistence model 带 schema version，只接受当前开发 schema，不直接复用 domain struct；不兼容文件默认显式拒绝且不得自动改写。设备安全设置是开发期例外：旧 `settings.json` schema 可直接删除并采用当前默认值，未来版本与损坏的当前版本仍保留并报错。
- russh/lib types 只能存在于 infrastructure 和组合根附近。
- Authentication 使用有限策略边界；一次性 password、stored credential 和 SSH Agent 由 session 请求表达，平台 Agent 协议只存在于 infrastructure adapter。`manual` 只属于 profile 连接策略，不是 session auth variant。
- profile-auth resolver 把 SSH Agent 或 `credentialId` 解析为无秘密 IPC 请求，并让 `manual` 返回人工认证流程。session command 在 Rust 内通过 credential application service 得到 `AuthRequest`；WorkspaceProvider 和 WebView 不读取私钥或批量凭证。
- profile route resolver 只接收目标 profile ID，在 Rust 内把 `jumpProfileIds` 显式数组解析为跃点到目标的有序路径。被选 profile 作为跃点时只贡献自身端点和认证，不递归展开它自己的目标路径。domain 统一校验引用存在、自引用、重复、最多 4 个中间节点及中间节点认证资格；候选查询与保存使用同一规则，WebView 不提交 endpoint、认证材料或运行时 route。
- credential application service 拥有凭证实体、保险库生命周期与恢复重置用例；`CredentialVault` port 提供恢复材料准备、初始化、解锁、锁定、主密码重包、恢复轮换、列表元数据、密码/私钥存取和整体 clear。Json adapter 实现 envelope encryption、严格恢复文件格式与 zeroized runtime data key；Tauri command 只拥有系统文件选择、受限文件 I/O，以及对 Rust SSH infrastructure 密钥生成能力的窄化编排。
- settings domain/application 分别拥有两项可选自动锁定时长与可迁移目录规则；固定系统 app-config 中的 `storage-location.json` 只承担启动定位，组合根从可迁移目录派生 `connections.json`、`secrets.vault` 与 `network-forwards.json`，从系统 app-data 派生 `known-hosts.json`、`workspaces.json` 与 `settings.json`。默认可迁移目录为 `~/.qterm`，保存新目录只初始化并要求重启，不自动迁移旧数据。credential lifecycle application/runtime coordinator 拥有最近解锁时间、凭证固定有效期 deadline 与统一 lock；React timer、window blur 和 command handler 不拥有凭证有效期规则。
- WorkspaceShell 拥有终端空闲锁编排：从设备设置读取可选时长，以绝对最后活动时间和可清理 timer 监听键盘、指针按下与滚轮输入，并在页面恢复可见或窗口获得焦点时重新检查 deadline。终端输出、网络活动与重绘不续期；到期只复用现有 vault lock 与进程内终端锁屏，不新增后端终端状态。
- 连接 profile catalog 同时保存独立的一层 `ProfileGroup` 与 profile 的可空 `groupId`。domain 不提供父分组字段；repository 在单次锁定和原子写入内维护引用完整性，删除 group 时清空相关 profile 引用而不删除 profile。
- `connections.json` schema v6 持久化顶层 `groups`、profile `groupId`、`manual | password | privateKey | sshAgent` 偏好、可空 `credentialId` 与有序 `jumpProfileIds`，不保存私钥路径。reader 在载入与写入时验证全部显式路径；被引用的跃点不可删除，使既有依赖路径失效的修改不可保存。`network-forwards.json` 使用独立 schema，按 `profileId` 保存非敏感 Local/Remote/SOCKS5 规则，不保存运行状态；它与 connections/vault 位于同一个可迁移目录。profile、network、vault 和 workspace reader 只接受当前 schema，旧版本不运行时迁移。
- 不兼容连接配置的破坏性清理由 application 协调 profile 与 network repository：profile repository 在删除瞬间再次确认 `connections.json` 确为 unsupported schema，随后清除 `connections.json` 与 `network-forwards.json` 并关闭 Network session。command 不接受路径或 force 参数；凭证和 Workspace 不参与清除。
- profile 删除由 application use case 协调 ProfileService 与 NetworkService：先校验两侧存储可读，再删除 profile 并按 profile 在单次 Network repository 写入中批量删除规则；第二步失败时尽力恢复 profile。成功后 command 只负责关闭对应 Network session 并返回删除摘要。React 不逐条编排跨 repository 删除，credential 永远不在该流程中删除。
- SSH Config 导入先由前端紧凑说明窗取得用户明确意图，再由 command 通过默认定位 `~/.ssh` 的系统选择器取得授权文件，并只向 WebView 返回一次性预览令牌与文件名；config 路径留在 Rust 内存。infrastructure 适配器负责所选入口的有界读取、相对 Include 展开和 Match 隔离，解析器模型不得跨越 infrastructure 边界。WebView 只以预览令牌、候选别名、私钥索引和可选口令提交选择，不能接收或提交 groupId、配置路径、私钥路径或私钥正文；command 固定把导入 profile 的 groupId 设为 null。提交重新解析授权文件；批量导入先校验全部候选，再原子写入 profile，失败时回滚本批次新建凭证。私钥复用比较解析后的公钥身份，不比较凭证显示名称。

## Workspace UI Model

- 长期界面层级固定为 `Workspace → Block layout`。顶部每个标签直接对应 Workspace，不存在下拉 Workspace 管理器或内部终端 Tab。当前 Block 实现 Terminal、Files 与 Network，未来 Web/AI 等类型必须通过显式 widget 边界加入。
- Workspace 直接拥有可序列化 layout tree 与 active block；Terminal、Files 与 Network Block 都以稳定 block id 隔离运行时。Terminal 持有本地 PTY 或交互 SSH session，Files 只持有本机来源或独立 SFTP SSH session，Network 持有独立 SSH session、listener、活动转发与子 channel；Network 运行状态不进入 Workspace reducer。
- 切换 Workspace 只改变可见性和焦点，不关闭、重建或混用活动 session。显式关闭 Block 才触发对应 session close；关闭 Workspace 必须级联处理其 Block。
- 高频终端字节直接进入 block-scoped xterm runtime，不进入 Workspace reducer 或持久化 model。
- Workspace、layout、Terminal/Files/Network 的 profile 引用与文件路径可以持久化；Network 规则由独立 repository 按 profile 保存。session id、listener、活动转发、终端 buffer 和私钥口令禁止持久化。用户明确保存的密码只能进入独立加密 vault，不得进入 Workspace/profile/network rule。
- 前端组合入口只装配 workspace shell。layout tree 变换、terminal runtime registry、工具弹窗和持久化 IPC 必须拥有独立模块边界。
- ConnectionDialog 只编排 profile/group CRUD 与管理器内部编辑状态；浏览、编辑、保存和复制 profile 不得调用 Workspace 的 Terminal/Files/Network target selection 或 session connection API。Block header 的目标选择器拥有目标切换与连接发起职责。
- WorkspaceShell 拥有不可持久化的应用内终端锁状态与最后活动时间：锁屏挂载在 `workspace-stage`，只有工作区内容必须 inert 且隐藏于辅助技术；顶部 `app-chrome` 位于锁定边界外，Workspace 切换/新建与窗口控制保持可用。Escape、背景点击和终端操作快捷键不得绕过锁屏；专用锁屏只短暂持有主密码输入并复用 credential unlock IPC。settings 只保存空闲策略，当前锁定状态和活动时间不得进入 Workspace reducer 或 persistence。
- SSH session 必须带显式用途。`Terminal` 用途可以申请 PTY/shell并接受 write/resize；`Files` 用途不得申请 PTY/shell，只接受 SFTP 目录和传输控制；`Network` 用途不得申请 PTY/shell/SFTP，只接受有界的 TCP forwarding start/stop/close 控制。
- 三类 SSH session 都从目标 profile ID 解析同一 route。首节点使用常规 TCP SSH，后续节点在前一 handle 上打开 `direct-tcpip` channel 并以 `russh::client::connect_stream` 建连；每个节点独立完成 host-key 与认证。上游 handle 由该 session 独占并在失败、取消或关闭时全部断开，不跨 Block 池化或共享。
- 远程 Files leaf 初次创建或切换 profile 时必须自动请求自身的 SFTP 会话，不复用来源终端 session；本机 Files leaf 不触发认证。
- Network rule 字节只在 Rust TCP socket 与 SSH channel 之间流动，不进入 WebView。一个 Network Block 内的活动规则共享该 Block 的 Network session；不同 Block 和 Terminal/Files runtime 不共享生命周期。规则默认停止，切换 profile 或关闭 Block/Workspace 必须级联取消 listener、remote forward、子 channel 与 session。

## Streaming Rules

- 高频、有序终端输出和传输进度使用 Tauri IPC Channel。
- 内部队列必须有界；小输出可批量后发送。
- 所有长任务必须拥有取消路径、超时策略和幂等 close。
- 大文件必须流式处理，禁止为方便一次性读入内存。

## Security Rules

- 私钥只能通过凭证管理中的系统文件选择器、SSH Config 预览中的逐项明确授权导入，或由 Rust SSH infrastructure 使用系统 CSPRNG 生成；设备路径、生成种子和私钥正文不进入连接配置或 WebView。
- SSH Agent 私钥不得由应用读取或导出；Unix 仅通过 `SSH_AUTH_SOCK`，Windows 通过 OpenSSH Agent named pipe 或 Pageant 请求签名。
- profile 只允许保存认证偏好和 `credentialId`。`secrets.vault` 使用 Argon2id KEK 与独立 256-bit recovery key 分别包装同一个随机 data key，并用 AES-256-GCM 逐条加密密码、私钥正文和可选口令；恢复文件只保存 vault identity、generation 与 recovery key，不保存主密码、data key 或凭证明文。主密码、KEK、recovery key 和 data key 禁止进入 WebView 或日志。
- 密码和口令使用 secret wrapper，在成功、失败、取消和断开路径释放；不得通过 Debug/Display/Serialize 泄漏。
- 私钥正文只存在于 Rust Core 的导入、生成、认证与公钥派生路径，不得进入前端、日志或应用配置文件。SSH infrastructure 按容器识别 OpenSSH、PKCS#8 与 PuTTY PPK v2/v3 加密私钥、在解密前限制 PPK Argon2 资源参数并归一稳定失败，不依赖外部本地工具。生成开放 Ed25519 与 ECDSA P-256/P-384/P-521，并在 Rust 内序列化后直接交给既有加密 vault；公钥派生复用同一私钥解析器，窄化 credential IPC 只接收凭证 ID 并只返回标准 OpenSSH 公钥文本。
- host-key unknown 需要用户明确接受；changed 必须阻断。
- 多跳 route 的 host-key、认证与隧道错误必须携带结构化节点元数据和阶段；未知密钥的待确认状态必须先在 Rust 注册，再向 WebView 发事件，避免即时确认竞态。非最终节点不得接受服务器发起的 remote-forward channel。
- 敏感值仅允许进入一次性认证或窄化 vault IPC DTO；凭证摘要列表只返回 ID、名称、类型和算法元数据，并允许在 vault 锁定时读取，以保持 profile 引用可解释。读取密码、私钥正文及凭证库写操作仍由后端要求解锁；连接编辑器更改 profile 的凭证引用前由前端先完成解锁交互。前端只有在凭证管理中由用户明确点击“显示”后才可恢复当前选中的单条密码，私钥内容没有返回 IPC。任何敏感值都禁止进入日志和 panic message。
- 整体 clear 删除 `secrets.vault` 和内存派生密钥并解除 profile 引用，同时保持 profile/workspace 实体不变；存储删除失败时必须保留运行时状态并返回稳定错误，不得伪报成功。
- 主密码变更必须在后端验证旧密码，使用新 salt/KDF 重新包装同一个随机 data key 并原子写回；不得把 data key 或逐条凭证明文送入 WebView。凭证库有效期届满只锁定 runtime key，不删除凭证或终止既有 SSH/SFTP 会话。
- 手动或空闲触发的“锁定终端和凭证”必须先完成后端 vault lock 再进入前端锁屏；主密码验证成功后通过既有 vault unlock 同时恢复两者并重新开始空闲计时。前端终端锁只阻断当前应用交互，会话继续运行，状态不得持久化或宣称为 OS 级安全边界。
- 初始化与恢复轮换的每个系统文件选择器之前都必须显示明确的前端确认；用户取消属于正常中止，不映射为错误。恢复重置拆为选择验证旧密钥与保存提交新密钥两个 IPC 阶段：准备 IPC 必须先完整校验恢复文件格式、vault ID、generation 与 AEAD 包装，成功前前端不得显示或收集新主密码；验证成功后前端才显示新密码表单，随后显示“保存新恢复密钥”，用户再次点击后才能打开保存窗口。阶段间当前/替代恢复材料只以 zeroizing 类型暂存在 Rust `CredentialState`，返回、关闭或取消时由清理 IPC 删除，路径与内容不得进入 WebView。恢复文件只在用户选定保存目标后写入，默认文件名为 `qterm-recovery-{Unix 时间戳}.key`。恢复重置使用新主密码重新包装原 data key，并生成下一代恢复文件使旧文件失效；替代恢复文件保存取消或失败时不得修改 vault。旧版 vault 不迁移，只允许经现有破坏性确认流程定向清除 vault 与 credential references。
- Tauri capabilities 使用最小权限；前端不能直接执行任意 shell 或读取任意文件。
- 安全关键行为必须由真实 sshd/SFTP、密码与私钥 fixture 集成测试保护。
