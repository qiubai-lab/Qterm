## Background

当前选择器已解决 Block 裁剪并提供搜索和分组，但一级浮层仍直接展开全部连接。用户希望默认只显示最近 6 条，并通过分组二级菜单访问其余连接，且最近记录跨重启保留。

## Requirement

实现全局、持久化、最多 6 条的最近连接目录，以及视口安全、鼠标与键盘均可操作的分组二级菜单。

## Non-Goals

- 不修改 profile/group/credential/auth 数据结构。
- 不引入独立历史仓储、统计数据或历史管理 UI。
- 不重构 WorkspaceProvider 之外的会话编排。

## Architecture Impact

- `WorkspaceDocument` 从 v5 升级到 v6，新增 `recentProfileIds`。
- reducer 拥有最近记录的去重、排序和上限规则。
- WorkspaceProvider 在显式远程目标选择时记录使用，不在自动恢复连接时重排历史。
- TerminalTargetPicker 只负责将 ID 映射为可见 profile 和呈现层级。

## Domain Model Impact

Rust `WorkspaceDocument` 新增最多 6 个、唯一且格式合法的 profile ID。该数据是工作区级 UI 状态，不包含秘密。

## API Impact

Tauri workspace DTO schemaVersion 升至 6，并透传 `recentProfileIds`；现有命令名称不变。

## Database Impact

无数据库变更。JSON 仓储读取 v5 时在内存中迁移为空最近列表，后续保存为 v6；v1-v4 与未知未来版本仍拒绝且不覆盖源文件。

## Implementation Tasks

1. 先补 reducer、Rust domain/DTO/repository 和 picker 的失败测试。
2. 实现 WorkspaceDocument v6、v5 迁移和最近记录规则。
3. 从三类目标选择路径记录远程 profile，并将最近 ID 传给选择器。
4. 重构选择器默认内容为最近连接与分组入口，增加 portal 二级菜单、边缘翻转和键盘层级导航。
5. 更新紧凑样式、滚动契约及减少透明度/动画降级。

## Acceptance To Verification

- 最近排序/去重/上限/忽略 null：`reducer.test.ts`。
- v5 迁移与 v6 往返/校验：Rust workspace domain、command、repository tests。
- 最近列表与分组二级菜单：`TerminalTargetPicker.test.tsx`。
- 三类 Block 共享入口：`LayoutView.test.tsx` 与 Provider 相关测试。
- 定位和滚动契约：`appStyles.test.ts`。

## Test Plan

- `pnpm vitest run src/workspace/reducer.test.ts src/workspace/TerminalTargetPicker.test.tsx src/workspace/LayoutView.test.tsx src/app/appStyles.test.ts`
- `cargo test workspace --all-features`（`src-tauri/`）
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

代码回滚时保留仓库迁移兼容读取逻辑，或在回滚前先清除新字段并写回 v5；不得让旧版本直接把 v6 文件视为损坏并覆盖。当前实现不主动覆盖无法识别的未来版本。

## Risks

- 二级菜单 hover 间隙可能闪退：使用短延迟并让主/子菜单共同维持激活状态。
- 视口边缘溢出：从分组按钮实时测量，左右翻转并钳制 top/maxHeight。
- 自动恢复连接污染最近顺序：只在显式 `select*Target` 路径记录。
- schema 兼容失败：先以 v5 fixture 验证迁移，再升级保存版本。

## Documentation Updates

更新本 task spec/plan；无需长期 Project Context 或 Directory Map。
