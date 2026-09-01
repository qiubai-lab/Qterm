---
id: QB-20260820-network-forwarding-window
status: archived
archived: 2026-09-02
legacy: true
---
# Network Forwarding Window

## Goal

用户可以在 Workspace 内创建独立的 Network Block，按远程连接 profile 管理并运行本地端口转发、远程端口转发和 SOCKS5 动态转发，而不依赖 Terminal Block 的生命周期。

## Scope

- Workspace 布局新增可持久化的 `network` 叶子，保存稳定 `blockId` 与可空 `profileId`。
- 右侧工具轨每次点击都在活动 Block 旁创建新的 Network Block；远程 Terminal Block 标题栏可以创建继承当前 profile 的 Network Block；本地 Terminal Block 的对应动作保持可见但禁用。
- Network Block 右上角复用现有连接选择交互，但不提供本机目标；切换 profile 会停止并关闭该 Block 的旧 Network SSH session 与活动转发。
- Network Block 以带适度间距的紧凑列表展示当前 profile 全局共享的转发规则；每项使用 PC/服务器图标及“本地/远程”标签明确监听端和目标端，支持创建、编辑、删除、启动和停止。
- 支持三类 TCP 转发：
  - Local：本机监听地址/端口经 SSH 连接到服务器视角的目标地址/端口，语义等价于 `ssh -L`。
  - Remote：服务器监听地址/端口经 SSH 连接到本机视角的目标地址/端口，语义等价于 `ssh -R`。
  - SOCKS5：本机 SOCKS5 listener 按每个 `CONNECT` 请求经 SSH 打开目标 TCP channel，语义等价于 `ssh -D`。
- SOCKS5 首期支持无认证的 `CONNECT`，目标可为 IPv4、IPv6 或域名；不支持 `BIND`、`UDP ASSOCIATE` 和用户名密码认证。
- 新增独立、可版本化的 `network-forwards.json`，位于与 `connections.json`、`secrets.vault` 相同的可迁移目录。规则按 `profileId` 绑定并可被多个 Network Block 查看，但活动状态按 Network Block 隔离。
- 规则只保存配置，不保存 SSH session、listener、动态运行状态、认证材料或活动连接；应用启动和 Workspace 恢复后规则默认停止。
- Network Block 使用独立 SSH session；同一个 Block 内的多条活动规则共享该 session，不复用来源 Terminal 或 Files session。
- profile 删除存在绑定规则时返回稳定冲突，不静默删除规则；用户必须先在 Network Block 中显式删除相关规则。
- Workspace 文档升级到 schema v5；遵守当前开发阶段策略，只读取精确 v5，不运行时迁移或改写 v4 文件。

## Constraints

- 本地和 SOCKS5 listener 默认只绑定 `127.0.0.1`；远程 listener 默认请求服务器绑定 `127.0.0.1`。
- `0.0.0.0`、`::` 或其他非 loopback listener 必须显示暴露警告，但用户确认后允许保存和启动。
- 端口首期限定为 `1..=65535`，不支持用 `0` 请求动态分配端口。
- 所有地址、端口、名称、规则数量、并发连接数量和 IPC 字段均由 Rust domain/command 再验证。
- TCP 字节只在 Rust socket 与 SSH channel 之间流动，不经过 WebView/Tauri JSON event；前端只接收有界状态事件和稳定错误码。
- 每条 listener、转发请求与子连接必须有取消路径、超时、半关闭处理和幂等 close；关闭 Network Block、Workspace、切换 profile 或退出应用时必须级联停止。
- host-key、认证偏好、vault 解锁和人工认证回退沿用 Terminal/Files 的安全规则；Network 不增加新的凭据存储形式。
- `russh`、Tokio socket 和 SSH channel 类型只能存在于 infrastructure；domain、application 和 IPC DTO 不泄漏第三方类型。
- 服务器拒绝 `AllowTcpForwarding`、`GatewayPorts`、目标限制或端口占用时，必须映射为规则级可解释错误，不伪报为通用认证失败。

## Non-Goals

- UDP 转发、SOCKS4、SOCKS5 `BIND`/`UDP ASSOCIATE`、SOCKS 用户名密码认证。
- Unix domain socket 转发、X11/Agent forwarding、ProxyJump、ProxyCommand 或 OpenSSH config 解析。
- 全局按 profile 复用 Terminal/Files/Network SSH transport 的 connection broker。
- 应用启动或 Workspace 恢复时自动启动规则，以及断线后的无限自动重连。
- 远程非 loopback 监听一定可从外网访问；最终可见范围仍受服务器 `sshd` 与防火墙控制。
- 将远程已有 SOCKS 服务的固定端口误建模为动态转发；该场景使用 Local 规则即可。

## Acceptance

1. 右侧工具轨能在活动 Block 旁创建未选择连接的 Network Block；远程终端能创建继承当前 profile 的 Network Block；本地终端不能创建。
2. Network Block 可在右上角选择远程 profile，切换目标时旧 Block session 和全部活动规则被停止，其他 Terminal/Files/Network Block 不受影响。
3. 当前 profile 的规则以列表展示并可创建、编辑、删除；Local 显示“本地监听 → 远程目标”，Remote 显示“远程监听 → 本地目标”，SOCKS5 显示“本地监听 → 远程网络动态目标”，且对应端点带 PC/服务器图标；启动中和运行中的图标、文字及箭头显示连续的左到右逐字符高光，背景保持静止，reduced-motion 下退化为静态运行色；相同 profile 的其他 Network Block 能看到持久化配置，但运行状态按 Block 独立。
4. Local 规则能将本机 TCP listener 的双向字节经 `direct-tcpip` 转发到服务器视角目标，并能可靠停止和释放端口。
5. Remote 规则能请求服务器 listener、接受 `forwarded-tcpip` channel、连接本机目标，并在停止时取消远程 forward。
6. SOCKS5 规则能完成无认证协商，接受 IPv4、IPv6 和域名 `CONNECT`，拒绝不支持的方法/命令/畸形报文，且域名由服务器侧目标连接解析。
7. 默认 listener 仅绑定 loopback；选择非 loopback 时 UI 明确警告，Rust 仍执行完整校验，端口冲突和服务器策略拒绝以规则级错误显示。
8. 关闭 Network Block/Workspace、切换 profile、断开 SSH 或退出应用时，listener、remote forward、子 channel 和 session 都有界关闭；重复停止不报伪错误。
9. `network-forwards.json` 只保存非敏感规则并严格拒绝未知字段、超限内容和敏感字段；应用恢复后规则全部为停止状态。
10. 删除仍被规则引用的 profile 会被阻止并说明处理方式；删除规则后 profile 可正常删除。
11. Workspace schema v5 可以保存和恢复 Network leaf；非 v5 文件保持原始字节且返回稳定的不兼容版本错误。
12. Network 数据字节不经过 WebView，现有 Terminal、Files、认证、host-key 和凭证行为无回归。

## Acceptance To Verification

- 1、2：`networkWindow` 纯 action、Workspace reducer/LayoutView/WorkspaceShell 组件测试，以及 block/profile 关闭编排测试。
- 3、9、10：Network domain/application/repository 单元测试、Tauri DTO strict-deserialization 测试和 React 列表行为测试。
- 4：Tokio loopback echo fixture 与真实 sshd `direct-tcpip` ignored 集成测试；验证双向传输、并发、端口释放与取消。
- 5：启用 remote forwarding 的真实 sshd fixture；验证 forwarded channel、本机目标连接、cancel 和服务器拒绝路径。
- 6：SOCKS5 parser/handshake 表驱动单元测试与经 SSH 访问 echo fixture 的集成测试。
- 7：domain 地址/端口校验测试、非 loopback warning 组件测试、listener bind/服务器拒绝错误映射测试。
- 8：manager 生命周期、重复 stop、profile switch、Block/Workspace close 和应用 shutdown 测试。
- 11：TypeScript contract、Rust workspace command/domain/repository v5 round-trip 与 v4 拒绝且不改写 fixture。
- 12：断言转发 IPC 只携带配置与状态；运行现有前端及 Rust 全量回归。
- 全部：`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`，以及可用环境中的聚焦桌面冒烟检查。

## Open Questions

- 无阻塞问题。首期固定采用全局 profile 规则、Block 独立运行时、手动启动、端口范围 `1..=65535` 和精确当前 schema 策略。

## Recommended Approach

采用一等 `NetworkNode`、独立 `network-forwards.json`、显式 `Network` SSH purpose 和 Block-scoped Network session。持久化 repository 只拥有规则与 profile 引用，应用层负责 profile 删除冲突与用例编排，SSH infrastructure 负责 listener、SOCKS5、`direct-tcpip`/`tcpip-forward` 和双向流式复制。这样复用现有认证与 host-key 安全链路，同时避免 Terminal 生命周期、WebView 高频数据和持久化模型控制网络运行时。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- `updating-directory-map`（实现新增 `src/network` 与 network domain/application/port/command 后执行）
