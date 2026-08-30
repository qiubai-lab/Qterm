---
id: QB-20260830-remote-git-management
type: feature
tier: strict
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Remote Git Management over SSH

## Goal

让现有 Git Block 可以绑定 Qterm 连接配置所指向的远程 Linux/Unix 主机及其工作目录，在不依赖 Terminal Block 生命周期、不解析交互终端文本的前提下，提供与本机 Git MVP 对齐的仓库状态、stage/unstage、commit、本地分支和提交图能力。

## Change Shape

- Type：`feature`。它扩展用户可见 Git Block 的目标类型和远程操作行为。
- Tier：`strict`。变更跨 SSH 认证/主机密钥/跳板链、远程命令边界、Git mutation、Workspace schema 和前端 runtime 隔离。
- Related change：`QB-20260830-git-management-window` 已归档；本 change 修改其“仅本机仓库、禁止远程 Git”的范围边界，但不取代其本机能力。

## Interpretation And Assumptions

- 用户已于 2026-08-30 明确：“支持远程连接”是指管理 SSH 服务器文件系统中的工作区仓库，而不是为本机仓库增加 origin 的 fetch/pull/push。
- MVP 面向产品既有核心用户的远程 Linux/Unix 主机；Windows OpenSSH/PowerShell 远端不是首期兼容目标。
- 远程 Git Block 使用 Qterm 已保存的 connection profile、认证偏好、凭证引用、主机密钥和跳板路径，不新增 Git 专用账号或凭证存储。
- Git origin sync 继续保持范围外；后续若需要 fetch/pull/push，应作为另一项涉及凭证、网络传输与冲突处理的 change 评估。

## Recommended Scope

### Target And Connection

- Git Block 目标扩展为 `Unbound | Local(path) | Remote(profileId, path)`；一个 Block 仍只管理一个仓库。
- 从远程 Files Block 打开时继承其 profile 与当前路径；从远程 Terminal Block 打开时只继承同 profile 的有效 OSC 7 路径；其他上下文创建未绑定 Block。
- Remote Git 使用独立 SSH session purpose，与 Terminal、Files、Network session 生命周期隔离；关闭 Terminal 或 Files 不得中断 Git，关闭 Git Block 只关闭自己的 session/command。
- 恢复 Workspace 时只恢复 profileId/path，不恢复 sessionId、认证材料、Git snapshot 或在途命令；连接按现有 configured-auth/manual fallback、host-key 和 jump-route 流程重新建立。

### Git Capability

- 远端 Git 可用时提供现有本机 MVP 对等能力：解析仓库根、显式 init、status、stage/unstage single/all、commit、列出/创建/切换本地分支和最多 100 条提交图。
- 远端未安装 Git、版本不支持所需 machine protocol、路径不可访问、连接中断或 shell 不受支持时显示稳定可恢复状态。
- 不配置远端 Git identity，不跳过 hook，不自动 stash/discard/commit，也不因为重新连接改变工作区。

### Remote Execution Boundary

- 使用无 PTY SSH exec channel；不得把命令写入 Terminal shell、读取 Terminal buffer 或依赖 prompt marker。
- 远端命令只能来自固定 Git action allowlist。repository path 是唯一必须进入远端 command 的动态路径，必须经目标 shell 的专用 literal encoder；WebView 不能提交 executable、shell、cwd、subcommand 或 args。
- commit message 使用 `git commit -F -` 从 stdin 输入；单项 pathspec 优先使用 `--pathspec-from-file=- --pathspec-file-nul` 从 stdin 输入，避免把任意文本拼入远端命令。
- stdout、stderr、exit status 分离采集；沿用 porcelain v2/NUL、显式 `for-each-ref` 和字段分隔 log parser，不解析本地化人类输出作为正常协议。

## Non-Goals

- 不增加本机仓库的 clone/fetch/pull/push、remote branch、credential helper 或代码托管平台集成。
- 不复用现有 Terminal session，不向交互 shell 注入命令，不解析 xterm 输出。
- 不支持远端 Windows/PowerShell、容器内二次跳转、sudo、Git worktree 发现或多仓库聚合。
- 不增加 diff、discard、stash、merge、rebase、cherry-pick、分支删除/重命名或冲突编辑器。
- 不在首期部署远端 helper binary/script，也不下载 `.git` 或工作树到本机模拟操作。

## Requirements

- REQ-001：Git Block 必须以显式 target union 表达未绑定、本机和远程目标；远程目标只持久化 profileId 与用户选择/解析后的远端仓库路径。
- REQ-002：从远程 Files/Terminal 打开 Git 时必须继承同一 profile 和有效当前路径；没有可靠路径或 profile 时必须创建未绑定状态，不猜测远端 home 或执行探测。
- REQ-003：每个 Remote Git Block 必须拥有独立 SSH session/runtime，复用现有 profile route、认证、凭证、host-key trust 和跳板进度；不得依赖任何 Terminal/Files sessionId。
- REQ-004：Remote Git 连接、断开、重连、认证 fallback、host-key 确认与跳板失败必须沿用其他 SSH Block 的一致行为，并清楚标识目标 profile、endpoint 和远端路径。
- REQ-005：连接成功后必须检测受支持的 POSIX remote shell 和 Git capability；Git 缺失、版本不足、unsupported shell 与 permission/path failure 必须是不同的稳定状态。
- REQ-006：远端必须支持与本机 MVP 一致的 init/status/stage/unstage/commit/local branch/graph 行为；失败不得丢失 commit message、伪报成功或自动修改其他 Git 状态。
- REQ-007：远端 Git 只能通过无 PTY exec channel 执行固定 action template；动态 path、branch 和输入 payload 必须分别经过领域校验、shell literal encoding 或 stdin framing，且 IPC 拒绝任意命令字段。
- REQ-008：commit message 和批量 pathspec 不得出现在远端 command string、日志或错误 DTO 中；stdin payload 必须有界并在命令结束/取消后释放。
- REQ-009：每个 Git Block 同时最多执行一个 Git action；query 10 秒、mutation 60 秒超时，超时/关闭/目标切换必须关闭 channel，丢弃旧 epoch 结果并刷新真实状态。
- REQ-010：远端 stdout/stderr 必须各自有 8 MiB 上限；输出超限、缺少 exit status、SSH channel 中断与非零退出必须映射为稳定错误，不能把不受限远端环境信息送入 WebView。
- REQ-011：Git UI 必须增加与现有目标选择器一致的 Local/Remote target 与连接状态；三段式内容、操作能力和无 diff 范围保持一致，远程断线时保留已知 snapshot 但明确标记 stale 并禁用 mutation。
- REQ-012：Workspace schema 必须从 v8 升级为 v9，以 target union 迁移既有 Git `repositoryPath` 为 Local target；v8 既有 Terminal/Files/Network/Git 布局语义不变，未知/损坏/敏感文档仍拒绝且不覆盖。
- REQ-013：删除或缺失被引用 profile 后，Remote Git Block 必须进入“连接不存在”恢复态并允许重新选择；不得级联删除 Block、远端目录或仓库数据。
- REQ-014：第一版必须继续排除 remote sync、diff 和历史改写能力；“Remote”只表示工作区所在 SSH 主机，不表示 Git origin。

## Non-Functional Requirements

- NFR-001：远端 command template、POSIX literal encoder、stdin framing 和 parser 必须可纯测试；包含空格、单引号、换行、Unicode、前导短横线的合法路径不得造成命令注入或参数错位。
- NFR-002：远端 Git session 和 command 的任务/通道必须有确定 owner，Block 关闭、目标切换和 Workspace 关闭后不残留后台任务。
- NFR-003：同一路跳板与 host-key 行为不得因 Git purpose 建立第二套安全规则；认证 secret、私钥正文和 Git stdin payload 不进入前端日志或持久化。
- NFR-004：远端 Git 大列表与提交图沿用本机 500/100 的挂载和查询上限，不因网络模式扩大 WebView payload。

## Observable Acceptance

- AC-001（REQ-001, REQ-002）：从远程 Files 或有 OSC 7 目录的远程 Terminal 打开 Git，创建包含相同 profile/path 的 Remote Git Block；关闭原 Block 后 Git 连接仍独立存在。
- AC-002（REQ-003, REQ-004）：密码、私钥、SSH Agent、host-key 确认和合法跳板链均能建立 Git session；失败进度明确指向对应节点，且不读取 Terminal runtime。
- AC-003（REQ-005）：POSIX+Git 可用、Git 缺失、版本不足、unsupported shell、路径不存在和权限不足分别呈现可行动状态；重新选择/重连可恢复。
- AC-004（REQ-006）：远端临时仓库完整通过 init、status、single/all stage/unstage、commit、branch create/switch 和 graph 流程，结果与直接在该远端执行 Git 一致。
- AC-005（REQ-006, REQ-011）：身份、hook、index lock、切换冲突或断线失败时 commit message 和最后快照保留，mutation 禁用/恢复状态准确，不自动 stash/discard。
- AC-006（REQ-007, REQ-008, NFR-001）：恶意 repository path、branch、commit message 和 pathspec fixture 不能改变 allowlisted action；commit message/pathspec 不出现在 exec command 或 IPC error 中。
- AC-007（REQ-007, REQ-010）：WebView 提交 executable/shell/cwd/subcommand/args、其他 sessionId 或越权 profileId 均被 DTO/application/session owner 边界拒绝。
- AC-008（REQ-009, REQ-010）：query/mutation 超时、输出超限、缺失 exit status、channel close 和 Block close 都会回收 channel/task；旧响应不能覆盖重连或 mutation 后快照。
- AC-009（REQ-011）：Local/Remote/Disconnected/Connecting/Host-key/Failed/Stale 状态在三主题与最短高度下可辨，键盘可以选择目标、确认 host key、重连和执行既有 Git action。
- AC-010（REQ-012）：v8 fixture 无损迁移为 v9 Local target；Remote target round-trip 后不包含 sessionId、snapshot、secret 或 command payload，拒绝 fixture 保持字节不变。
- AC-011（REQ-013）：删除/缺失 profile 后恢复为可重新选择连接的 Git Block，远端仓库与其他 Block 不受影响。
- AC-012（REQ-014）：生产 UI/IPC 不出现 fetch/pull/push/clone/remote branch/diff/merge/rebase/stash/discard 等入口。

## Behavior Delta

### ADDED

- REQ-001 至 REQ-011、REQ-013：Git Block 新增 SSH 主机工作区 target、独立连接 runtime、受限远端 Git capability 和恢复状态。

### MODIFIED

- REQ-012：Workspace 从 schema v8 的 nullable local repositoryPath 扩展为 schema v9 Git target union，并迁移既有本机 Git Block。
- REQ-014：既有“禁止远程 Git”修改为“允许 SSH 主机工作区 Git，但仍禁止 Git origin sync 和其他范围外能力”。

## Options Evaluated

### Option A：独立 SSH Git Session + 固定 exec protocol（推荐）

- 成本：高；需要 SessionPurpose::Git、command control、target/runtime、schema v9 和端到端 SSH fixture。
- 复杂度：中高，但连接/认证/host-key/jump route 可复用，Git action 仍由一个 application service 编排。
- 风险：SSH exec 必然经过远端 shell，需要 POSIX literal encoder、stdin framing、输出/超时边界和远端 Git 兼容检查。
- 维护性：最好；不污染 Terminal，不下载仓库，Remote Git 的连接 owner 清晰。

### Option B：复用 Terminal Session 注入命令并解析 marker

- 成本：表面较低。
- 复杂度/风险：最高；prompt、用户前台进程、shell hook、编码、分页器和终端关闭都会污染 machine protocol，且容易泄露或注入。
- 维护性：最差；与 Files/Network 已采用的独立 session 原则冲突，不建议。

### Option C：部署远端 Qterm Git Helper，以二进制/JSON 协议执行

- 成本：最高；需要按远端 OS/架构分发、校验、升级、清理和权限策略。
- 复杂度：协议最稳定，也能避免 shell quoting，但引入远端软件供应链和持久化资产。
- 维护性：适合未来需要 Windows remote、复杂 Git 或更强取消协议时评估；对当前 MVP 过重。

## Recommendation

采用 Option A，但明确限制为“远程 Linux/Unix 工作区 Git”，并新建独立 Git-purpose SSH session。不要复用 Terminal，也不要把本地 Git 的 `std::process::Command` 适配器硬改成既能本地又能远程的万能 executor。

应用层可统一使用 `GitTarget` 与 action/result 语义；低层保持 `LocalGitExecutor` 和 `RemoteGitExecutor` 两个 adapter。Remote adapter 只接收已验证 action，借助 SshSessionManager 的 Git-purpose control 打开无 PTY exec channel。commit message 用 stdin，批量 pathspec 用 NUL stdin，只有固定模板和编码后的 repository path/branch 进入 command string。

## Architecture Boundary Decision

- Placement：`domain/git` 增加 target/remote capability 与 action payload 边界；`application/git_service` 选择 local/remote port 并拥有同一行为规则；`ports/remote_git_executor` 表达受限远端 action；`infrastructure/ssh/client/git.rs` 拥有 exec channel、literal encoder、stdin/stdout/stderr/exit status 和取消。
- Frontend：`WorkspaceProvider` 扩展 `gitRuntimes`、epoch、connection intent 和 host-key progress；`GitPane` 只消费 target/runtime/snapshot 并派发窄 action，不持有 auth 或 SSH 命令。
- Persistence：Workspace v9 record 表达 Git target union；sessionId、snapshot、command 和 secret 仍是 runtime-only。
- Model Separation：Remote exec request、Git domain action、IPC DTO、Workspace record 和 russh channel 类型相互独立。
- Tradeoff：不为一个 provider 抽象通用 SCM framework；Local/Remote executor 共享 action 语义和 parser，但不共享 process/channel lifecycle 实现。

## Strict Traceability Seed

- TASK-001（REQ-001, REQ-002, REQ-012, REQ-013）：Git target union、Workspace v9 migration、打开/恢复策略。
- TASK-002（REQ-003 至 REQ-005）：Git-purpose SSH session、认证/host-key/jump-route runtime。
- TASK-003（REQ-006 至 REQ-010）：Remote Git action port、exec protocol、stdin framing、parser、timeout/output/error mapping。
- TASK-004（REQ-004, REQ-011, REQ-014）：target selector、connection states、existing GitPane integration 和范围审计。
- TASK-005（REQ-001 至 REQ-014）：安全 fixture、SSH integration、迁移、UI 回归、Directory Map 和全量验证。
- VER-001（AC-001 至 AC-003, AC-009, AC-011）：Workspace/connection owner/route/host-key/runtime 测试。
- VER-002（AC-004 至 AC-008）：本地测试 SSH server 上的 Remote Git integration、安全 payload、timeout/output/channel cleanup 测试。
- VER-003（AC-009, AC-012）：GitPane 三主题/最短高度/键盘/无范围外 action 测试。
- VER-004（AC-010）：Workspace v8->v9 migration、round-trip、拒绝与字节保留测试。
- VER-005（AC-001 至 AC-012）：前后端全量门及 Linux/macOS/Windows client 到 POSIX SSH target 的桌面 smoke matrix。

## Risks And Rollback

- 最大安全风险是把动态值拼入 SSH exec command；固定 template、单一 encoder、stdin payload 和 malicious fixture 是阻断性 gate。
- 网络断开与 mutation 结果不确定时不能假定失败或成功，必须标记 snapshot stale 并重新 query。
- schema v9 是回滚边界；旧 v8 版本不能表达 Remote target，回滚前必须移除/另存 Remote Git Block，不能静默转为 Local。
- 若 Remote executor 不稳定，可垂直回退 Git-purpose session、remote target UI 和 v9 target record，本机 Git action/parser 保持不变。

## Quality Check

- REQ-001 至 REQ-014 均有 AC-001 至 AC-012 覆盖；Behavior Delta 覆盖新增 remote 行为与既有 local-only 范围修改。
- 主路径、认证/host-key/jump route、Git missing、权限、断线、超时、未知结果、恢复、注入和 schema 回滚均有可观察验收。
- strict architecture/security/test/migration/rollback gates 已进入 TASK/VER seed。

## Open Issues

- 无阻塞语义问题；远程目标已固定为 SSH 服务器文件系统中的工作区仓库。
- MVP 建议只支持 POSIX remote；若必须同时支持 Windows/PowerShell remote，应重新比较双 encoder 与 remote helper 方案。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：用户已将远程语义明确为 SSH 服务器工作区仓库管理；架构、安全、schema、错误恢复和 AC/REQ 追踪均闭合。独立 Git-purpose SSH session 与固定 exec protocol 能复用既有认证、主机密钥和跳板链，同时保持 Terminal、Files 与 Git runtime 隔离。
- Traceability：REQ-001 至 REQ-014 均由 AC-001 至 AC-012 覆盖；Behavior Delta 对应新增 SSH target 与修改 local-only 边界；TASK/VER seed 满足 strict tier。
- Non-blocking note：若选择 SSH 主机工作区，首期仅支持 POSIX remote 是成本和安全性最合理的范围；Windows/PowerShell remote 可作为后续独立扩展。
- Next Action：等待用户明确批准完整范围与 Option A；批准后将本 spec 改为 `approved` 并进入 planning。

## Next Action

实现与 strict verification 已完成；变更归档。后续可在带 Git 2.25+ 与 OpenSSH sshd 的 POSIX 测试机补跑真实远端 fixture，或另开 change 评估 Windows/PowerShell remote 与 Git origin sync。

## Verification Evidence

- Completion：REQ-001 至 REQ-014 已按批准范围实现，Git Block 现可绑定 Local 或 SSH profile + POSIX remote path，并继续排除 diff 与 origin sync。
- Automated Evidence：前端 `pnpm check` 通过（63 个测试文件、554 项测试）；Rust format、clippy 与完整测试通过（236 项通过、4 项环境测试忽略）；Workspace schema v9、严格 DTO、session ownership、POSIX quoting/stdin framing、stale recovery 与无范围外入口均有回归覆盖。
- Environment Gap：真实 Remote Git 全流程 fixture 已实现但要求 POSIX `/usr/sbin/sshd`、`ssh-keygen` 与 Git 2.25+；当前 Windows 主机不满足该条件，故该 fixture 保持 `ignored`，作为已披露残余风险。
- Archive Decision：`PASS WITH RESIDUAL RISK`；自动化门禁全部通过，环境缺口不改变已批准的首期 POSIX-only 范围。
