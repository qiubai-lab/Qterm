---
id: QB-20260820-network-forwarding-window
status: archived
archived: 2026-09-02
legacy: true
---
# Network Forwarding Window Strict Plan

Status: implemented and verified on 2026-08-20.

## Background

Qterm 当前 Workspace 只有 Terminal 与 Files Block，SSH manager 只区分交互终端和 SFTP 用途。用户需要一等 Network Block，以远程连接 profile 为边界持久化并运行 Local、Remote 与 SOCKS5 三类 SSH TCP 转发。该功能同时改变 Workspace schema、安全敏感网络监听、profile 引用规则和 SSH channel 生命周期，因此使用 Strict 计划。

## Requirement

实现 `docs/qb-spec/archive/2026/QB-20260820-network-forwarding-window/spec.md`：规则按 profile 全局共享，Network Block 独立持有 SSH session 与运行状态，右侧工具轨和远程终端提供创建入口，规则默认停止并使用安全的 loopback 监听默认值。

## Non-Goals

- 不实现 UDP、SOCKS4、SOCKS5 `BIND`/`UDP ASSOCIATE` 或 SOCKS 认证。
- 不引入跨 Terminal/Files/Network 的全局 SSH connection broker。
- 不实现自动启动、无限自动重连、动态端口 `0`、UDS/X11/Agent forwarding 或 OpenSSH config。
- 不保证服务器非 loopback remote listener 的外部可达性。

## Architecture Impact

- 前端新增 `src/network/`，拥有 Network Block 列表、规则编辑器、警告和 feature-local runtime 状态；Workspace 只拥有 Network leaf、创建/关闭/选择 profile 的结构编排。
- `src/lib/tauri/network.ts` 暴露窄化配置 CRUD、Network session、规则 start/stop 和状态 Channel，不传输隧道字节。
- Rust 新增 network domain、application service、repository port、JSON adapter 与 Tauri commands。domain 表达规则、不变量和稳定错误；application 编排规则 CRUD/profile 引用冲突；infrastructure 才依赖 Tokio/russh。
- SSH manager 增加显式 `Network` purpose 和 Network 控制消息；认证与 host-key 建连流程继续共用，Network 不申请 PTY/shell/SFTP。
- `src-tauri/src/infrastructure/ssh/forwarding.rs` 负责 listener、SOCKS5 握手、SSH channel/TCP 双向流和远程 forwarded channel 接入；不得把 socket/channel 类型暴露给 application 或 commands。
- 组合根从可迁移目录装配 `network-forwards.json` repository，从 app-data 装配 Workspace v5 repository，并在 shutdown 路径停止 Network sessions。

## Domain Model Impact

- Workspace `LayoutNode`/DTO/record 增加 `Network { block_id, profile_id }`，继续要求 Workspace 至少包含一个 Terminal leaf并维持全局 block id 唯一。
- 新增 `ForwardRule` 聚合：稳定 id、profile id、名称和 `Local | Remote | Socks5` 配置；运行状态不属于聚合。
- Local/SOCKS5 的 bind/target 采用明确方向命名；Remote 分开 remote bind 与 local target，避免 UI 字段和 SSH 语义倒置。
- 端口为 `1..=65535`；规则数量、名称/host 长度、控制字符、bind address 与并发连接数量有固定上限。
- 非 loopback 不是无效配置，但产生显式 exposure classification，供 UI 警告；任何秘密字段、session id 或 runtime 字段均无合法 domain 表达。
- profile 删除前由 application 查询 Network repository；仍有引用时返回 `ProfileHasNetworkRules`，不跨文件执行不可靠的静默级联。

## API Impact

- 新增规则 API：load/list、create、update、delete，并使用 `deny_unknown_fields` DTO。
- 新增 Network runtime API：connect block、accept/reject host key、start/stop rule、close block；状态通过有界 Tauri Channel 返回 block/rule 状态和稳定错误码。
- 现有人工认证 owner 扩展为 `network`，沿用 `SessionAuth` 和 configured-auth resolver，不新增秘密 DTO。
- profile delete command 增加 Network rule 引用检查并返回稳定冲突码。
- Workspace IPC schema 从 v4 升级到 v5并新增 `network` variant；精确拒绝 v4/其他版本且不改写文件。

## Database Impact

- 无数据库。
- 可迁移目录新增 `network-forwards.json` schema v1，使用独立 persistence record、4 MiB 上限、严格字段、敏感字段拒绝、单进程写锁和原子写入。
- `workspaces.json` 升级到 schema v5。遵守“开发阶段只接受当前 schema”决策，不迁移 v4。
- `connections.json` schema 不因新增规则字段而升级；profile 删除在 application/command 层增加跨 repository 冲突检查。
- 回滚新版本代码时，旧程序会拒绝 Workspace v5 和未知的独立 Network 文件，但不会改写它们；用户应先备份 app-data/可迁移目录。

## Affected Files

### Frontend contracts and workspace

- `src/workspace/model.ts`、`layout.ts`、`reducer.ts`及相邻测试：Network leaf、纯树变换、schema v5和创建/选择 profile action。
- `src/workspace/LayoutView.tsx`、`WorkspaceShell.tsx`、`WorkspaceProvider.tsx`及相邻测试：Network 渲染、创建入口、认证/host-key 路由和关闭级联；只增加必要的 feature wiring。
- `src/workspace/networkWindow.ts`及测试：右侧与远程终端的纯创建策略。
- `src/network/NetworkPane.tsx`、`NetworkRuleDialog.tsx`、`networkRuntime.ts`及相邻测试：列表、表单、状态、警告和 block-scoped runtime。
- `src/lib/tauri/network.ts`及测试：窄化 IPC/Channel 契约。
- `src/components/Icon.tsx`、`src/app/app.css`、`src/app/appStyles.test.ts`：复用图标词汇、Block/list/dialog 布局、状态和可访问性样式。

### Rust domain, persistence and SSH

- `src-tauri/src/domain/network.rs`、`domain/mod.rs`及测试：规则、不变量、exposure classification 和稳定状态。
- `src-tauri/src/application/network_service.rs`、`application/mod.rs`及测试：CRUD、引用查询和规则用例。
- `src-tauri/src/ports/network_repository.rs`、`ports/mod.rs`：repository port。
- `src-tauri/src/infrastructure/persistence/json_network_repository.rs`、`mod.rs`及测试：schema v1严格原子存储。
- `src-tauri/src/infrastructure/ssh/client.rs`、`forwarding.rs`、`mod.rs`及测试：Network purpose、listener、SOCKS5、direct/remote channels、取消和状态事件。
- `src-tauri/src/commands/network.rs`、`profile.rs`、`workspace.rs`、`error.rs`、`mod.rs`及测试：DTO、profile delete conflict、Workspace v5和错误映射。
- `src-tauri/src/domain/workspace.rs`、`infrastructure/persistence/json_workspace_repository.rs`及测试：Network leaf和schema v5。
- `src-tauri/src/lib.rs`、`Cargo.toml`、`Cargo.lock`：组合根、shutdown 和 Tokio `net` feature。

### Durable documentation

- `docs/qb-spec/context/PRODUCT_SPEC.md`、`ARCHITECTURE_SPEC.md`、`DECISIONS.md`：长期产品流程、模块边界和已采纳决策。
- `docs/qb-spec/DIRECTORY_MAP.md`：实现新增结构后记录 `src/network` 与 Network 后端边界。

## Implementation Tasks

1. 先写 Network domain、Workspace v5、repository strict schema 和 profile reference conflict 的失败测试，再实现纯模型与持久化边界。
2. 新增前端 Network leaf、布局纯变换、右侧/远程终端创建策略和 Workspace v5 contract；保持本地终端动作 disabled。
3. 实现 Network rules IPC 与 `NetworkPane` 静态 CRUD 列表/编辑器，覆盖空、busy、selected、disabled、warning、error 和删除确认状态。
4. 在 SSH manager 中增加 `Network` purpose，抽取但不越界扩大现有认证/host-key建连复用点；实现 block connect/close 与有界状态事件。
5. 先实现 Local forwarding：Tokio listener、每连接 `direct-tcpip`、双向流、半关闭、并发限制、取消和端口释放。
6. 实现 SOCKS5 无认证 `CONNECT` parser/handshake，覆盖 IPv4/IPv6/域名、拒绝矩阵和服务器侧目标解析。
7. 实现 Remote forwarding：request/cancel、`server_channel_open_forwarded_tcpip` 路由、本机 target 连接和服务器策略错误。
8. 接通 Network Block 启停、profile switch、Block/Workspace close、host-key 与人工认证回退；保证其他 Block runtime 隔离。
9. 完成非 loopback 警告、键盘/焦点、最短窗口尺寸、滚动所有权与 reduced-motion 处理，并进行聚焦桌面冒烟。
10. 更新 Directory Map，执行完整前端/Rust验证并记录真实 sshd ignored 测试运行方式与未覆盖环境限制。

## Acceptance To Verification

- A1：`networkWindow.test.ts`、`WorkspaceShell.test.tsx`、`LayoutView.test.tsx` 验证两个入口、profile 继承和本地 disabled。
- A2：Network runtime/component 测试验证 switch 顺序为 stop-old → close-session → persist/select-new，且其他 block mock 未被调用。
- A3：repository/service/React 测试验证 profile 全局配置共享、Block 运行状态隔离和 CRUD/确认流程。
- A4：Local forwarding 单元/集成测试验证 echo、并发、半关闭、取消、端口释放和 `direct-tcpip` 失败。
- A5：真实 sshd remote-forward fixture 验证 request、forwarded channel、local target、cancel、重复 stop 与 server deny。
- A6：SOCKS5 表驱动测试覆盖 method、command、ATYP、长度/EOF、IPv4/IPv6/domain replies；真实链路验证 CONNECT echo。
- A7：domain property/table tests 和 UI 测试验证端口边界、loopback classification、warning 与稳定 bind/policy errors。
- A8：manager/Workspace 生命周期测试验证 Block/Workspace/profile/session/shutdown 清理顺序和幂等性。
- A9：JSON fixtures 验证 schema、unknown/sensitive fields、上限、原子保存、无 runtime 字段和恢复后 stopped。
- A10：profile application/command 测试验证有引用时冲突、无引用时删除成功和文件不被部分改写。
- A11：TS/Rust Workspace v5 round-trip、Network leaf 校验与 v4 reject/no-rewrite fixture。
- A12：IPC payload 断言、现有 Terminal/Files/auth/host-key/vault 全量回归和数据通路代码审查。

## Test Plan

- 测试优先：domain validation、SOCKS5 parser、Workspace schema、profile conflict 和 manager close/cancel 必须在实现前形成失败测试。
- Frontend focused：Network rule reducer/组件、workspace reducer/layout、LayoutView、WorkspaceShell、Tauri adapter。
- Rust focused：network domain/service/repository、workspace domain/command/repository、SSH forwarding helpers、command DTO/error mapping。
- Integration：本地 Tokio echo；本机 OpenSSH `sshd` 分别验证 Local、SOCKS5 和 Remote，remote fixture 显式设置可控 `AllowTcpForwarding`/`GatewayPorts`，不访问外网或用户 `~/.ssh`。
- Full gate：`pnpm check`。
- Rust gate：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- Manual：正常/最短窗口尺寸、长规则名、非 loopback 警告、端口冲突、未知/变化 host key、切换 profile、关闭 Block/Workspace 与端口重新绑定。

## Rollback Plan

- 在发布前保留 `workspaces.json` 与可迁移目录备份；Network schema 写入开始后不承诺旧二进制读取 v5。
- 功能回滚时先停止并移除 Network runtime/commands/UI；保留或单独导出 `network-forwards.json`，不得静默删除用户规则。
- Workspace reader 若回滚到不支持 Network 的版本，应继续拒绝 v5，不将 Network leaf 降级成 Terminal 或 Files，也不覆盖原文件。
- profile delete conflict 是收紧行为；回滚该检查前必须确认不会留下静默孤儿或丢失规则。
- listener/remote forward 没有外部持久化副作用；进程退出或显式 close 应释放本地 socket和 SSH 注册，残留服务器转发由 SSH 连接关闭清理。

## Risks

- `server_channel_open_forwarded_tcpip` 与规则匹配/取消存在并发竞态；使用 block/session generation 和规则 id 检查，迟到 channel 必须拒绝或立即关闭。
- TCP 双向复制的 EOF/half-close 不正确会造成挂起；使用独立方向状态和有界 shutdown timeout，不把简单 task abort 当作完整关闭。
- 非 loopback SOCKS/local listener 可能暴露未认证代理；安全默认、显式警告、可见 bind endpoint 和 Rust 校验缺一不可。
- Remote 可见性受服务器 `GatewayPorts`、防火墙和端口策略影响；UI 只能报告 SSH request 结果，不能宣称公网可达。
- 独立 `network-forwards.json` 与 profile repository 无跨文件事务；采用删除冲突而不是自动级联，启动时对孤儿引用报稳定不可用且不改写原文件。
- 每个 Network Block 一条 SSH 连接会增加资源与认证次数；首期接受隔离收益，未来可独立评估 connection broker。
- 当前 SSH client 文件已经承担多用途控制；实现时将数据泵放入 `forwarding.rs`，只在 `client.rs` 保留连接与路由，避免继续形成万能 adapter。

## Documentation Updates

- 本轮已更新产品流程、架构边界与接受决策。
- 实现完成后更新 `docs/qb-spec/DIRECTORY_MAP.md`，记录实际新增入口和禁止内容。
- 如最终支持范围、安全默认或 schema 策略发生变化，必须先同步 task spec、plan 和相关 context，再继续实现。

## Next Skills

- `checking-architecture-boundaries`：实现时守住 Network config、Workspace leaf、runtime 和 russh adapter 边界。
- `protecting-critical-behavior`：关键规则、解析器、schema 和生命周期测试优先。
- `verifying-before-completion`：汇总 focused/full/real-sshd 证据。
- `updating-directory-map`：实现新增模块后执行。
