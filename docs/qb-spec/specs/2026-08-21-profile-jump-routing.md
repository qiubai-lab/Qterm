## Goal

用户可以让一个连接配置通过其他 Qterm 连接配置组成的 SSH 路径访问目标，并在配置与连接失败时明确知道每个候选或失败节点的状态与原因。

## Scope

- profile 保存可空的跳板 profile 引用，默认直接连接。
- 跳板引用可以继续组成路径，最多包含 4 个中间节点。
- 连接管理显示全部其他连接；不符合中间节点要求的连接保持可见但不可选，并显示稳定原因。
- Rust 统一计算候选资格、路径、循环与深度；保存时再次校验。
- 中间节点使用各自保存的密码/私钥凭证或 SSH Agent；`manual` 与缺失凭证不能作为中间节点。
- Terminal、Files 与 Network 都通过同一条解析后的 SSH 路径连接。
- 每个节点独立校验主机密钥，并在进度、确认和失败事件中标识节点、角色与阶段。
- 被引用为跳板的 profile 不允许删除，也不允许修改为会破坏现有路径的状态。

## Constraints

- SSH 继续使用纯 Rust `russh`，不调用系统 OpenSSH，不实现 `ProxyCommand`。
- 私钥与密码不进入 WebView、profile 或日志；route 在 Rust 内解析凭证。
- `connections.json` 升级到严格 schema v5；按当前开发策略不迁移 v4。
- 单个会话独立拥有跳板链；本期不共享或池化跳板会话。
- 最大中间节点数为 4。

## Non-Goals

- 不从 SSH Config 自动导入 `ProxyJump`。
- 不支持中间节点每次弹窗手动选择认证。
- 不实现跳板连接池、ControlMaster 或断线自动重连。
- 不改变 Local/Remote/SOCKS5 规则语义；规则运行在最终目标 SSH 会话上。

## Acceptance

1. 连接管理的跳板选择器显示全部 profile，并为自身、循环、超深、手动认证、缺失凭证和失效路径显示不可选原因。
2. 凭证库锁定的合法候选仍可选择，并提示连接时需要解锁。
3. profile 创建、更新、读取与持久化包含可空 `jumpProfileId`；无引用时保持直接连接。
4. 保存拒绝自引用、循环、超过 4 跳、缺失引用和不合格中间节点。
5. 被其他 profile 引用的跳板不能删除；使既有依赖路径失效的修改不能保存。
6. Terminal、Files 和 Network 均以 profile ID 进入 Rust route resolver，不信任 WebView 拼装跳板路径。
7. SSH 依次连接每个节点，通过 `direct-tcpip` channel 和 `connect_stream` 建立下一跳，最终会话继续支持 PTY、SFTP 与 Network forwarding。
8. 连接进度、主机密钥确认、主机密钥变化和失败事件包含准确的节点名称、端点、序号、角色与阶段。
9. 取消或任一节点失败会关闭已建立的上游 handle/channel，不留下活跃会话。
10. SSH Config 导入继续提示但不自动配置 `ProxyJump`。

## Acceptance To Verification

- 1、2：ConnectionDialog Testing Library 测试覆盖全量列表、禁用原因、锁定提示与键盘选择。
- 3、4、5：profile domain/application/repository 测试覆盖 round trip、图校验与引用保护。
- 6、8：command/TypeScript IPC 测试覆盖 profile ID 请求和节点事件映射。
- 7、9：SSH 单元测试覆盖 route 执行顺序与资源释放；双 sshd ignored 集成测试验证真实单跳链路。
- 10：保留并扩展 config import 回归测试。
- 全量：运行 `pnpm check`，以及 Rust fmt、clippy 和全部测试。

## Open Questions

- 无；一期范围已由用户确认。

## Recommended Approach

profile 只保存 `jumpProfileId`。application route resolver 将引用图解析为从最外层跳板到目标的有序 route，并拥有所有跨 profile 规则。SSH infrastructure 首跳使用 `client::connect`，后续通过上一跳 `channel_open_direct_tcpip` 获得 stream，再调用 `client::connect_stream`。候选资格与保存校验共享同一规则结果，React 只展示，不复制图规则。

## Next Skills

- `writing-qb-plans`：Strict plan。
- `checking-architecture-boundaries`：保持 profile 图规则、route 编排、IPC 与 russh adapter 分离。
- `protecting-critical-behavior`：先保护循环、深度、认证资格、引用删除和节点错误。
- `maintaining-project-context`：更新长期产品、架构与决策。
- `verifying-before-completion`：执行完整质量门。
- Directory Map：只有新增稳定 route 模块或改变入口职责时更新。
