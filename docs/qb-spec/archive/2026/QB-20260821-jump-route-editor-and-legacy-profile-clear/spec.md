---
id: QB-20260821-jump-route-editor-and-legacy-profile-clear
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

连接管理能够在固定底部区域安全处理不兼容的旧连接配置，并通过带实验标识的独立页面直观配置、预览和调整最多 4 个显式 SSH 跃点。

## Scope

- 将连接配置版本不支持提示移动到连接编辑器固定 footer，与保存按钮水平对齐。
- 仅在后端再次确认 `connections.json` 版本不受支持时显示并允许执行“清除旧配置”。
- 清除前打开嵌套确认窗，明确删除范围与不可撤销性；成功后刷新为空连接目录。
- 顶部增加第三个“跳板连接”Tab，并附加“实验”标签。
- 跳板页顶部显示 `本机 → 跃点 1…4 → 当前服务器` 的紧凑数据流预览。
- 默认显示一个值为“直接连接”的跃点选择框；选定有效跃点后可继续添加，最多 4 个。
- 每个实际跃点行提供持久可见的删除图标；删除中间行后自动压紧并重编号。
- 候选继续显示全部连接，不可用项保持可见、不可选择并解释原因。
- profile 改为显式保存有序跃点 ID 列表，执行顺序与页面、预览图一致。

## Constraints

- 最多 4 个显式中间节点，顺序固定为本机到目标的连接顺序。
- 作为跃点使用某 profile 时，只使用该 profile 的端点和认证配置，不递归展开它作为目标时配置的跃点列表。
- 中间节点仍不能使用 manual 或缺失/类型不匹配的凭证。
- WebView 不拼装 SSH endpoint、认证材料或运行时 route；Rust 从目标 profile 解析有序列表。
- 清除命令必须在删除瞬间重新读取并确认错误为 unsupported schema；不得用于损坏、敏感字段或当前可读配置。
- 清除同时删除 `connections.json` 与 `network-forwards.json`；凭证库与 Workspace 保留。确认文案必须明确两个配置文件都会被删除。
- 遵循开发期严格 schema 策略，`connections.json` 升级为 v6，不迁移 v5。

## Non-Goals

- 不导入或执行 OpenSSH `ProxyJump` / `ProxyCommand`。
- 不实现拖拽排序；一期通过删除并重新选择调整顺序。
- 不让跃点继承或递归展开被选 profile 自身的跳板配置。
- 不在清除旧连接配置时删除凭证或 Workspace。
- 不实现跳板连接池、自动重连或运行时共享。

## Acceptance

1. `profileStorageVersionUnsupported` 不再出现在编辑滚动区，而出现在固定 footer 状态槽，与保存按钮水平对齐。
2. 版本不支持时显示危险样式“清除旧配置”；其他错误不显示该按钮，保存不可用。
3. 清除按钮打开顶层嵌套确认窗；后端仅在 `connections.json` 仍为 unsupported schema 时删除它及 `network-forwards.json`，成功后连接、分组和网络规则为空。
4. 顶部具有“连接信息 / 认证方式 / 跳板连接 实验”三个语义化 Tab，键盘方向键、Home/End 和焦点状态正确。
5. 跳板页默认显示 `本机 → 当前服务器`，并保留一个“直接连接”选择框。
6. 选择跃点后，预览立即按选择顺序插入节点；最多展示并保存 4 个跃点。
7. 只有最后一行已选择且未达上限时才能添加下一跃点；删除任意实际跃点后列表压紧并同步预览。
8. 每一行候选显示全部 profile；当前目标、重复节点、manual、缺失凭证等不可选并显示原因，锁定但合法的凭证节点可选且标明连接时解锁。
9. Terminal、Files、Network 使用相同显式 route；逐节点进度、host-key 与错误归属保持准确。
10. schema v6 round trip 保持跃点顺序；删除或修改被引用节点时继续保护依赖完整性。

## Acceptance To Verification

- 1–3：ConnectionDialog 测试覆盖 footer 状态、条件按钮、嵌套确认与成功刷新；Rust repository/command 测试覆盖二次校验、只删除目标文件和竞态拒绝。
- 4–8：Testing Library 覆盖三 Tab 键盘行为、实验标签、默认态、添加/删除/上限、候选原因和预览 ARIA 文本；样式测试覆盖固定 footer、滚动所有权和 reduced motion。
- 9：既有 Terminal/Files/Network IPC 与 Workspace 测试改为有序 route；逐节点事件回归继续通过。
- 10：domain/repository 测试覆盖 v6 顺序、重复、自身、认证资格、反向引用与 v5 拒绝且不改写。

## Open Questions

- 无；用户已确认清除旧配置时同时删除 `connections.json` 与 `network-forwards.json`，保留凭证和 Workspace。

## Recommended Approach

采用“显式 route”模型：`ConnectionProfile.jump_profile_ids: Vec<ProfileId>`，长度 0–4。页面用 `Array<string | null>` 维护草稿行，保存前归一化为无空洞、有序且不重复的 ID 数组。被选 profile 自身的 route 只在它作为目标连接时使用，作为跃点时不递归展开，因此页面、持久化和运行时始终一一对应。

新增 application 级 `clear_unsupported_storage` 用例：先让 profile repository 持锁重新读取版本，只有 `UnsupportedSchemaVersion` 才授权清除；随后删除明确的 `connections.json` 与 `network-forwards.json`。如果 profile 文件已变为可读、损坏、含敏感字段或 I/O 失败则拒绝。React 仅依据稳定错误码展示入口，不能授权删除。

## Next Skills

- `writing-qb-plans`：Strict plan，因为变更 schema、核心 route model、公共 IPC 与破坏性操作。
- `checking-architecture-boundaries`：保持显式 route 规则在 domain、清除策略在 repository/application、UI 只管理草稿与展示。
- `protecting-critical-behavior`：保护配置删除范围、route 顺序与三类会话一致性。
- `maintaining-project-context`：采纳并实现后更新长期产品、架构与 schema 决策。
- `verifying-before-completion`：运行完整前后端质量门及真实双 sshd route 测试。
- Directory Map：预计只扩展既有文件职责，不新增稳定模块；实现后若抽出共享 route editor/flow 组件再更新。
