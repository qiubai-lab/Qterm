## Background

当前 profile 不表达连接路径，Terminal/Files 由 WebView 提交目标地址，Network 仅额外校验 profile 端点；SSH runtime 直接创建单个 TCP SSH 会话。新能力涉及 profile schema、认证链、host-key 状态机、公共 IPC 与核心 SSH 生命周期，因此使用 Strict plan。

## Requirement

实现可解释、可验证、最多 4 个中间节点的 Qterm profile 跳板路由，并让配置选择与运行时错误精确指向具体节点。

## Non-Goals

- 不执行系统 OpenSSH、`ProxyCommand` 或自动导入 `ProxyJump`。
- 不支持中间节点 manual auth。
- 不池化或共享跳板 session。
- 不迁移旧 `connections.json` schema。

## Architecture Impact

- Domain profile 增加可空跳板引用与稳定校验错误语义。
- Application 增加 profile catalog 图校验、候选资格和 session route resolver；删除/更新用例维护反向引用完整性。
- Command 从 profile ID 和目标认证选择构造 route，不接受 WebView 提交的 hop 列表。
- Infrastructure SSH 接收有序 route，仅此层持有 russh handle/channel/stream。
- Session event 增加 route node/stage 元数据，前端按结构化字段展示。

## Domain Model Impact

- `ConnectionProfile.jump_profile_id: Option<ProfileId>`。
- 最大中间节点数固定为 4。
- 中间节点资格：SSH Agent，或带匹配 credential reference 的 Password/PrivateKey。
- `manual`、缺失引用、缺失凭证、自引用、循环和超深均为稳定失败。

## API Impact

- profile DTO/Input 增加 `jumpProfileId`。
- 增加 jump candidate 查询 DTO/command。
- session/files/network connect 统一增加 `profileId`，地址由 Rust profile catalog解析；target auth 仍以受控 DTO 传入。
- session events 增加节点与阶段字段；保持稳定错误 code。

## Database Impact

- `connections.json` 从 v4 升级到 v5，profile record 增加可空 `jumpProfileId`。
- v5 reader 校验引用存在、无循环、深度和中间认证资格。
- 按当前开发策略不读取或迁移 v4，版本不匹配时不改写原文件。

## Implementation Tasks

1. 先添加 domain/application/repository 失败测试，锁定图规则、候选原因、反向引用和 v5 round trip。
2. 扩展 profile model、repository port/service、DTO 和错误码，实现统一 catalog validator 与候选查询。
3. 将 terminal/files/network connect command 收敛到 profile route resolver，并在 Rust 内解析每跳认证材料。
4. 将 SSH request 从单节点改为 route；实现首跳 TCP、后续 direct-tcpip + connect_stream、逐跳 host-key/auth、取消与资源清理。
5. 扩展 session 状态/事件/错误 DTO，标识 node index、role、name、endpoint 和 stage。
6. 在 ConnectionDialog 连接信息页增加 feature-local jump picker，展示全部 profile、禁用原因、route preview 和 vault-lock 提示。
7. 更新 WorkspaceProvider 与 tauri TypeScript 客户端，确保三类 block 使用 profile ID 且正确呈现节点消息。
8. 同步 qb-spec context；若新增稳定 route 文件则更新 Directory Map。

## Acceptance To Verification

- A1/A2：前端组件测试验证全部候选、不可选原因、可选锁定候选、键盘与 ARIA 状态。
- A3/A4/A5：Rust profile domain/application/persistence 测试验证构造、v5 round trip、循环/深度/失效/认证资格和删除/更新保护。
- A6：TypeScript IPC mock 与 Rust command builder 测试验证三类连接只提交 profile ID + target auth。
- A7：SSH route executor 测试验证 direct channel 顺序；ignored 双 sshd 集成测试验证 PTY/SFTP/forwarding 的最终 handle。
- A8：domain/session、command DTO 与 WorkspaceProvider 测试验证节点级 progress/host-key/failure。
- A9：SSH runtime 测试验证中途失败和取消后的 handle/channel 清理。
- A10：config import 测试继续验证 ProxyJump 仅产生警告。

## Test Plan

- Rust focused：profile、profile service、JSON repository、session state、SSH client/route、profile/session commands。
- Frontend focused：profiles IPC、ConnectionDialog、WorkspaceProvider、WorkspaceShell。
- Frontend gate：`pnpm check`。
- Rust gate：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 环境允许时运行 ignored 双 sshd 跳板集成测试；无法运行时明确残余风险与复验命令。

## Rollback Plan

- 代码可整体回退 profile v5、route resolver、SSH route 与 UI picker。
- schema v5 写入后旧二进制会拒绝读取；回滚前保留 v5 文件，不能用旧版本覆盖。
- 不自动改写 v4，因此实现失败不会破坏旧文件字节。

## Risks

- 多个 russh handle 的生命周期与取消可能泄漏任务或延迟关闭。
- 多节点 host-key 确认需要调整当前单端点状态机。
- vault 在 route 解析与异步连接之间锁定可能造成确定性失败；错误必须指明节点并允许重新解锁重试。
- 原生 select 无法可靠解释禁用项，需要自定义 listbox 并保护键盘/读屏行为。
- 双 sshd 集成环境在开发机或 CI 可能不可用。

## Documentation Updates

- 更新现有 PRODUCT_SPEC、ARCHITECTURE_SPEC 与 DECISIONS；领域及验收细节保留在本任务 spec 中。
- route 职责落入现有 profile domain、session command 与 SSH client，因此更新 DIRECTORY_MAP 的既有文件职责。
