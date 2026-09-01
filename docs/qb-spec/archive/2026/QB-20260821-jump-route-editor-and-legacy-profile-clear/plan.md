---
id: QB-20260821-jump-route-editor-and-legacy-profile-clear
status: archived
archived: 2026-09-02
legacy: true
---
## Background

当前连接管理把版本错误放在可滚动编辑区，且没有安全的旧配置清除入口。跳板配置只有单个 `jumpProfileId`，通过其他 profile 的引用链递归得到有效路径，无法自然表达用户在当前连接内显式新增、删除和排序最多 4 个跃点。

## Requirement

提供固定 footer 的不兼容配置处理入口，以及带实验标识、数据流预览和最多 4 行显式跃点编辑的第三个连接配置 Tab。

## Non-Goals

- 不迁移 v5，不执行 OpenSSH config 代理语义。
- 不实现拖拽排序、连接池或自动重连。
- 不清除 vault 或 Workspace；用户已确认同步清除 network rules 文件。

## Architecture Impact

- profile domain 从递归单引用图改为目标自有的显式有序 route，候选与保存校验共享规则。
- repository/application 增加窄化的 unsupported-schema 清除用例，并编排 profile 与 network 两个明确存储；Tauri command 只映射 DTO 与稳定错误。
- SSH command 仍从目标 profile ID 解析 route，infrastructure 继续只接收已解析节点并拥有 russh handle。
- ConnectionDialog 继续作为 feature owner；数据流视觉可复用 Network 的样式语言，但不直接复用 Network 业务组件。

## Domain Model Impact

- `jump_profile_id: Option<ProfileId>` 改为 `jump_profile_ids: Vec<ProfileId>`，长度 0–4，保持顺序。
- 禁止目标自身、重复节点、缺失 profile、manual 和缺失凭证。
- 选中 profile 自身的 route 不递归展开；它作为节点时只贡献端点和认证。
- 反向引用检查遍历所有数组元素；被引用节点不可删除或改为不合格认证。

## API Impact

- profile/Input/DTO 从 `jumpProfileId` 改为 `jumpProfileIds: string[]`。
- jump candidate 查询增加当前草稿中已选 ID，使重复项可见但不可选并解释所在跃点。
- route requirements 和 session builder 按显式数组返回/解析路径。
- 新增 `profile_clear_unsupported_storage`，无路径或 force 参数，同时清除连接与网络规则存储并返回结果。

## Database Impact

- `connections.json` 升级为 schema v6，profile record 保存 `jumpProfileIds` 数组。
- v6 reader 严格拒绝旧 `jumpProfileId`、未知字段、超过 4 项、重复及失效引用。
- v5 保持原字节并返回版本不支持；用户只能通过新确认流程主动清除。

## Implementation Tasks

1. 先增加 domain/repository 失败测试，定义显式顺序、上限、重复、认证资格、反向引用和 v6 round trip。
2. 改造 profile domain、service、repository、DTO 与 TypeScript contract，删除递归展开语义。
3. 增加 `clear_unsupported_storage` port/application/command，持锁二次校验后删除明确的 `connections.json` 与 `network-forwards.json`。
4. 更新 Terminal/Files/Network route builder 和节点元数据，保证显式顺序贯穿 SSH runtime。
5. 将 ConnectionDialog Tab 状态扩展为三项，并补齐 roving focus、方向键、Home/End 与三段 indicator。
6. 实现 feature-local `JumpRoutePanel`/`JumpRouteFlow`：默认直接连接、1–4 行草稿、添加条件、删除压紧、候选 listbox 和可访问路径描述。
7. 将版本错误移入 footer 的预分配状态槽，添加条件危险按钮及嵌套确认窗；成功后刷新 profile/group。
8. 更新长期 qb-spec context；仅在抽出新稳定文件时更新 Directory Map。

## Acceptance To Verification

- A1–A3：前端 footer/确认测试 + Rust 清除命令/repository 竞态与删除范围测试。
- A4–A8：ConnectionDialog 行为、键盘、ARIA、实验 tag、流程图和样式契约测试。
- A9：三类 IPC、WorkspaceProvider 和 SSH route 测试。
- A10：profile domain/repository v6、引用保护和旧 schema 不改写测试。

## Test Plan

- Rust focused：profile domain/service/repository/commands/session/SSH client。
- Frontend focused：profiles IPC、ConnectionDialog、WorkspaceShell/Provider、appStyles。
- 真实集成：双 sshd 显式 1 跳；在测试 fixture 支持时补 2 跳顺序验证。
- 完整门禁：`pnpm check`；`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Rollback Plan

- 功能代码可整体回退到 v5 单引用模型；已写入 v6 的配置会被旧版本拒绝，回退前不得用旧程序覆盖。
- 清除两个旧配置文件不可回滚，因此确认文案必须明确；command 不提供路径和强制删除参数。

## Risks

- 从递归引用改为显式 route 会改变先前同一 profile 作为目标和作为跳点时的语义，必须用测试锁定。
- 6 个流程节点在窄编辑器中可能拥挤，需要固定最小节点宽度、端点截断，并以 aria-label 提供完整文本。
- footer 同时容纳状态、清除、删除与保存操作时可能拥挤；版本错误态不会存在已加载 selection，可将清除放在左侧状态组、保存固定右侧。
- 双文件删除跨两个 repository，第二步失败时不得伪报全部成功；应优先采用明确路径的协调清除，并返回稳定的部分失败错误供用户处理。

## Documentation Updates

- 采纳实现后更新 PRODUCT_SPEC、ARCHITECTURE_SPEC、DECISIONS 与本任务 spec 状态。
- 若新增稳定的 JumpRoutePanel 文件，更新 DIRECTORY_MAP。
