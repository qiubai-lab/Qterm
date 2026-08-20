# Decisions

## 2026-08-18 — 使用 Tauri 2

Status: accepted

选择 Tauri 2 作为桌面壳，优先考虑安装体积、空闲资源和 Rust 后端的可控性。接受 Rust 学习和跨平台 WebView 验证成本。

## 2026-08-18 — 第一阶段不解析 OpenSSH config

Status: accepted

应用自行管理 host、port、username 等连接配置，不承诺 `~/.ssh/config`、ProxyJump、ProxyCommand 或 Match 语义。这样可以避免重新实现 OpenSSH 配置兼容层。

## 2026-08-18 — 使用 russh 与 russh-sftp

Status: accepted

SSH 和文件传输采用纯 Rust、Tokio 原生异步实现，不依赖系统 OpenSSH、libssh 或 libssh2。该决策支持内置跨平台运行、稳定传输进度和统一生命周期管理。

## 2026-08-18 — 第一阶段只支持标准 OpenSSH Agent

Status: superseded

原计划正式支持 Unix `SSH_AUTH_SOCK` 和 Windows OpenSSH Agent named pipe。该决定已由“第一阶段使用密码和私钥文件认证”替代。

## 2026-08-18 — 私钥永不进入应用

Status: superseded

该决定依赖 Agent 认证，已由新的 Rust-only 私钥边界替代。

## 2026-08-18 — 使用应用自有 host-key 信任库

Status: accepted

第一阶段不修改用户的 `~/.ssh/known_hosts`。未知主机密钥需要明确确认并写入应用信任库；已信任主机密钥变化必须阻断。

## 2026-08-18 — 高频数据使用 Tauri Channel

Status: accepted

终端输出和传输进度使用有序、高吞吐的 Tauri IPC Channel，而不是全局 JSON event。内部队列必须有界并支持取消。

## 2026-08-18 — 第一阶段使用密码和私钥文件认证

Status: superseded by “连接时支持密码、私钥文件与 SSH Agent”

当前只实现密码认证和用户手动选择的私钥文件认证。支持未加密和带口令私钥。SSH Agent 保留为未来认证 adapter，不进入当前实现和验收。

## 2026-08-19 — 连接时支持密码、私钥文件与 SSH Agent

Status: superseded by “手动认证只提供一次性密码、凭证引用与 SSH Agent”

终端下拉框选择远程 profile 后统一打开认证弹窗，允许密码、系统选择器确认的私钥文件或 SSH Agent。profile 可保存三种默认偏好；Unix 使用 `SSH_AUTH_SOCK`，Windows 优先 OpenSSH Agent named pipe 并兼容 Pageant。应用只请求 Agent 签名，不读取、导出或管理 Agent 身份。

## 2026-08-18 — 不扫描私钥目录

Status: superseded by “用户主动、受限地发现 `.ssh` 私钥”

不扫描 `~/.ssh` 或其他目录。私钥只能由用户通过系统文件选择器明确选择，应用可以保存所选路径，但不复制密钥正文。

## 2026-08-19 — 用户主动、受限地发现 `.ssh` 私钥

Status: superseded by “密码与私钥进入可复用的 portable credential library”

连接管理提供显式扫描操作，只检查当前用户 `.ssh` 第一层的有界 regular files，不递归、不跟随符号链接、忽略公钥与配置文件。Rust 只向前端返回路径和可用性元数据，私钥正文不越过后端边界。

## 2026-08-18 — 凭据不持久化

Status: superseded by “密码可选择存入主密码加密的可迁移保险库”

允许 profile 保存私钥路径；密码和私钥口令只存在于当前连接的临时 UI state 和 Rust secret wrapper，提交后清空 UI，认证结束、失败、取消或断开后清理 Rust 持有值。

## 2026-08-19 — 密码可选择存入主密码加密的可迁移保险库

Status: superseded by “密码与私钥进入可复用的 portable credential library”

密码默认仍为一次性；用户明确勾选保存时，以 Argon2id 从至少 12 字符的主密码派生密钥，并用 AES-256-GCM 独立加密到 `credential-vault.json`。profiles/workspaces 不包含凭据。标题栏只显示保险库是否初始化；用户明确点击当前连接表单的“显示”后，可通过窄化的单 profile load 恢复该连接密码，锁定状态必须先解锁，切换连接即清除前端明文。产品不提供凭据列表、批量回显或 manager token。用户可经二次确认整体清除保险库，操作同时删除 KDF 校验材料、全部加密密码和内存派生密钥，但保留 profile/workspace。私钥口令仍永不持久化。

## 2026-08-18 — 私钥正文限定在 Rust Core

Status: accepted

Rust Core 仅在用户发起连接时按需读取和解析所选私钥。私钥正文不得进入前端、日志、telemetry 或应用配置，且不得复制到应用数据目录。可控字节缓冲和口令使用 zeroize；第三方库内部副本无法完全保证即时清零，需在安全模型中记录残余风险。

## 2026-08-18 — Unix 私钥权限先警告不阻断

Status: accepted

如果私钥文件向 group/other 开放权限，返回稳定安全警告但仍允许继续。POSIX mode 无法完整表达 ACL 与跨平台安全状态，第一阶段不据此自动拒绝；UI 必须清晰展示警告。Windows 不套用 Unix mode 判断。

## 2026-08-18 — RSA 认证禁止 SHA-1 降级

Status: accepted

RSA 私钥认证优先协商 RSA-SHA2-512/256。服务器明确只支持旧 `ssh-rsa` SHA-1 时返回 unsupported-key，不自动降级；服务器未发布算法扩展时先尝试 RSA-SHA2-512。

## 2026-08-18 — 暂停启用 RSA 私钥

Status: accepted

`russh 0.62.x` 的 RSA feature 固定依赖受 RUSTSEC-2023-0071 影响且暂无修复的 `rsa 0.10.0-rc.18`。当前构建关闭 RSA feature，RSA 私钥返回 unsupported-key；待上游升级到已修复依赖后再恢复，并继续遵守“不降级 SHA-1”决策。

## 2026-08-18 — 主机密钥变化永不自动接受

Status: accepted

应用自有 known-hosts 只允许首次未知密钥经用户明确接受后写入。已信任端点出现不同密钥时立即失败并展示旧/新 SHA-256 指纹；当前会话不得覆盖记录或继续提交凭据。

## 2026-08-18 — SSH 连接采用有界等待

Status: accepted

TCP/SSH 连接等待 15 秒，未知主机密钥确认等待 60 秒。用户关闭会话会取消连接或确认等待；关闭操作幂等，已结束会话只保留最近 256 个 ID 用于重复关闭判定，避免会话表无限增长。

## 2026-08-18 — SFTP 使用临时文件且默认拒绝覆盖

Status: accepted

上传和下载先写带 `.terminal-demo.part` 后缀的临时文件，完成后 rename，失败或取消时清理。上传目标已存在时直接失败，不做静默覆盖；下载的目标覆盖意图由系统保存对话框承担。MVP UI 同时只管理一个活动传输。

## 2026-08-18 — 本机 OpenSSH 作为 MVP 真实链路门禁

Status: accepted

开发阶段不强制 Docker。集成测试启动高端口临时 `sshd`，生成临时 host/client Ed25519 密钥与授权文件，验证 host-key、认证、PTY 和 SFTP；不读取或修改 `~/.ssh`。该测试因依赖本机 OpenSSH 默认标记 ignored，CI 可在具备依赖的 runner 上显式启用。

## 2026-08-18 — 采用 Wave 式 Workspace、Tab 与 Block 层级

Status: superseded by “顶部 Tab 直接代表 Workspace”

界面采用独立 Workspace Switcher、Workspace 内顶部 Tab Bar，以及 Tab 内多 Terminal Block 的三级模型。终端画布是主视图；连接、SFTP、设置和帮助收束到右侧窄工具轨并按需弹出。切换 Workspace 或 Tab 不终止活动 SSH 会话。

## 2026-08-18 — 顶部 Tab 直接代表 Workspace

Status: accepted

导航与持久化层级扁平化为 `Workspace → Terminal Block layout`。顶部每个标签直接创建、切换、重命名、排序和关闭 Workspace；不再提供 Workspace 下拉框或内部终端 Tab。切换 Workspace 只改变可见性，活动 SSH session 和 xterm buffer 继续保留。持久化升级为 schema v2，v1 的每个 Tab 迁移为一个 Workspace。

## 2026-08-18 — 布局先使用二叉 split tree

Status: accepted

使用可序列化二叉树表达 horizontal/vertical split、比例和 Terminal Block leaf，并实现显式分割、resize、最大化、关闭以及 Block 边缘/中心 drop-zone 重排；暂不复制 Wave 面向多 Widget 的通用 n-tree。

## 2026-08-19 — Files Block 独立拥有连接目标与 SFTP 会话

Status: accepted

文件窗口不再引用来源 Terminal Block。持久化模型只保存自身 `profileId/path`，运行时按文件 Block id 持有本机来源或独立远程 session；终端文件夹按钮和右侧文件传输入口只提供初始化上下文。SSH manager 以显式 `Terminal | Files` purpose 区分能力，Files 会话认证后不申请 PTY/shell，并拒绝终端 write/resize。该选择增加一次独立 SSH 认证和连接成本，但避免终端关闭、切换目标或 PTY 生命周期破坏文件浏览，也使文件窗口可以自由切换不同 SFTP 主机。

## 2026-08-19 — 配置认证优先自动连接，失败后人工回退

Status: superseded by “手动认证只提供一次性密码、凭证引用与 SSH Agent”

Terminal 与 Files 选择远程 profile 后先按保存的认证偏好直接尝试：SSH Agent 无秘密启动，私钥路径由后端按 profile id 重新授权，密码仅在 vault 已解锁且存在对应凭据时加载。配置凭据不可用或异步 session 失败时才打开认证弹窗。Files leaf 初次继承远程 profile 时自动启动独立 SFTP；失败回调按 owner/block/attempt 消费一次，避免重复弹窗。

## 2026-08-18 — 窗口装饰按桌面平台配置

Status: superseded by “全平台统一使用应用内无边框标题栏”

Windows 使用无原生 decorations 的窗口，由应用顶部 Workspace 栏提供拖动、最小化、最大化/还原和关闭；macOS 继续使用原生 decorations 与 Overlay title bar，保留交通灯；Linux 继续使用原生窗口装饰。平台差异通过 Tauri platform-specific config 表达，窗口命令集中在前端 Tauri adapter，不散落到 Workspace 状态或领域层。

## 2026-08-18 — 全平台统一使用应用内无边框标题栏

Status: accepted

Windows、macOS 和 Linux 的通用 Tauri 配置均关闭原生 decorations，统一由应用顶部栏提供窗口拖动。标题栏左侧固定显示终端图标与 `Qterm` 品牌，中间为 Workspace navigation，右侧固定显示关闭、最小化、最大化/还原按钮。窗口能力集中在前端 Tauri adapter；Shell 只判断指针是否命中非交互标题栏区域，不让平台分支进入 Workspace 状态、领域模型或持久化。

## 2026-08-19 — 连接分组保持单层且删除时连接回到未分组

Status: accepted

连接分组使用独立实体保存空分组和稳定重命名，profile 仅持有可空 `groupId`，模型和 IPC 均不提供 `parentId`。分组与 profile 保存在同一个 schema v3 catalog 中，由 repository 原子维护引用；删除分组只清空组内 profile 的 `groupId`，不删除连接、凭据或 Workspace 引用。“未分组”由空引用派生，不持久化为特殊 group。

## 2026-08-19 — 密码与私钥进入可复用的 portable credential library

Status: accepted

连接 profile 只保存可空 `credentialId`，多个连接可共享同一密码或私钥凭证。默认可迁移目录 `~/.qterm` 保存 `connections.json` 与 `secrets.vault`；known-hosts 和 Workspace 留在设备本地。主密码经 Argon2id 派生 KEK，KEK 只包装随机 data key，密码、私钥正文与可选私钥口令使用 data key 和 AES-256-GCM 逐条认证加密。应用每次启动保持锁定；名称、类型和算法摘要在锁定状态仍可读取并解释连接引用，但选择其他凭证、解密材料和执行写操作前必须解锁，SSH Agent 不需要解锁。私钥导入、连接解析及 OpenSSH 公钥派生均在 Rust 完成；公钥可经只接收 credential ID 的窄化 IPC 返回并复制，私钥正文与口令不进入 WebView。删除凭证先解除所有 profile 引用再删除密文，连接本身保留。

## 2026-08-19 — 手动认证只提供一次性密码、凭证引用与 SSH Agent

Status: accepted

profile 增加 `manual` 连接策略。该策略每次连接都先打开认证弹窗，允许输入一次性密码、临时选择已有密码/私钥凭证或使用 SSH Agent；选择结果不写回 profile 或 vault。连接 transport 不再接受设备私钥路径，私钥只能由凭证管理显式导入并通过 `storedCredential` 在 Rust 内解析。只有用户主动选择凭证路径时才请求解锁 vault。

## 2026-08-19 — 开发阶段配置只接受当前 schema

Status: accepted

`connections.json` v4、`secrets.vault` v3 与 `workspaces.json` v4 的 reader 只接受精确当前版本。运行时不复制旧 app-data 文件，也不读取或迁移旧 profile、vault、workspace records。旧版 vault 只在用户进入凭证管理并完成现有破坏性确认后清除，同时解除 credential references；未来版本或其他不兼容文件仍返回稳定版本错误并保持原始字节不变。

## 2026-08-20 — 凭证库使用用户保管且可轮换的恢复密钥

Status: accepted

`secrets.vault` v3 为同一个随机 data key 保存两条独立包装：主密码经 Argon2id 派生的 KEK 包装用于日常解锁，初始化时生成的 256-bit recovery key 包装用于忘记主密码后的重置。初始化与轮换的每个系统文件窗口前都显示应用内确认；恢复时先选择旧密钥，由 Rust 完成格式、vault ID、generation 与 AEAD 有效性校验，成功后才显示新主密码输入，再返回应用显示“保存新恢复密钥”，再次确认后才打开保存窗口。两个 IPC 阶段之间的当前/替代恢复材料只暂存在 Rust 内存，返回、关闭或取消会清除；取消文件选择属于正常中止，不显示为错误。恢复文件默认命名为 `qterm-recovery-{Unix 时间戳}.key`，包含独立 schema、purpose、随机 vault ID、generation 和 recovery key，不包含主密码、data key 或凭证明文，只由 Rust 后端读写。成功恢复使用新主密码重包原 data key、生成下一代恢复文件并使旧文件失效，不逐条重加密凭证。v2 vault 不迁移，可经明确确认清除后重新初始化。

## 2026-08-19 — Windows 首期使用设备本地安全设置管理凭证锁定

Status: accepted

系统设置以 app-data `settings.json` 独立保存设备级安全策略，不进入 Workspace 或 `~/.qterm`。Windows 锁屏自动锁定默认开启；凭证解锁会话默认 3600 秒后到期，截止时间从最近一次成功解锁或主密码变更开始，普通键鼠活动不续期。Windows 使用原生 WTS session-lock 通知，不以 window blur 近似；系统解锁不自动解锁 vault。手动、系统和超时锁定统一清除 zeroized runtime data key 与前端 reveal 状态，但不删除凭证或终止既有 SSH/SFTP 会话。主密码变更只用新 Argon2id KEK 重新包装原 data key，不逐条重加密凭证。

## 2026-08-20 — 可配置连接与凭证迁移目录

Status: accepted

只有 `connections.json` 与 `secrets.vault` 跟随可配置的迁移目录，默认目录为 `~/.qterm`；应用 known-hosts、Workspace 与设备安全设置继续使用系统 app-data，不受该配置影响。固定系统 app-config 只保存 schema-versioned 的 `storage-location.json`，使组合根能在载入连接与凭证前确定迁移目录。用户可输入绝对路径或通过系统目录选择器修改；空值、`~` 与 `~/.qterm` 均恢复默认。保存时初始化目标目录，但不复制、移动、覆盖或删除旧数据，路径在重启后生效，用户必须按界面提示手动迁移 `connections.json` 与 `secrets.vault`。损坏或不兼容的定位文件不被覆盖，启动回退到默认迁移目录并向设置 UI 暴露警告。

## 2026-08-20 — 终端锁采用进程内遮罩并与凭证同时解锁

Status: accepted

右侧工具轨的锁定入口先让用户选择只锁定凭证库，或同时锁定终端界面与凭证。后者在 vault lock 成功后由 WorkspaceShell 设置不可持久化的进程内锁屏状态；锁屏只覆盖 `workspace-stage`，其底层工作区内容使用 inert 和辅助技术隐藏阻断交互，顶部 `app-chrome` 的 Workspace 切换/新建与窗口最小化、最大化、关闭保持可用。SSH/SFTP/local PTY 与后台输出继续运行。锁屏不可由 Escape 或背景点击退出，用户输入主密码后复用既有 vault unlock，同时恢复终端和凭证库。该能力只提供应用内隐私与误操作防护，不替代操作系统会话锁，应用重启后默认退出锁屏。
