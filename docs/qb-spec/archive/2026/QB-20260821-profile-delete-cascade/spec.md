---
id: QB-20260821-profile-delete-cascade
status: archived
archived: 2026-09-02
legacy: true
---
# Profile Delete Cascade

## Goal

用户确认删除连接后，即使该连接仍被网络转发规则引用，也能可靠完成删除，并清楚知道哪些关联数据会被移除、哪些共享数据会保留。

## Scope

- 删除连接时同步删除所有引用该 profile 的持久化网络转发规则。
- 删除确认文案明确说明关联网络规则会被删除、共享凭证保持不变且操作不可撤销。
- 跨 `connections.json` 与 `network-forwards.json` 的删除编排位于 Rust application 层；网络规则删除失败时恢复已删除的 profile。
- 删除成功后关闭该 profile 的 Network SSH session，并向前端返回被删除的网络规则数量。

## Constraints

- 不从凭证库删除任何 credential；profile 只移除 credential reference。
- 不改变 `connections.json`、`network-forwards.json` 或 `secrets.vault` schema。
- 每个 repository 内继续使用既有锁与原子文件替换；跨文件只能提供尽力回滚，不能声称崩溃级事务。
- React 不逐条编排网络规则删除，Tauri command 不拥有引用完整性规则。

## Non-Goals

- 不清理 Workspace 中所有持久化 profile 引用；现有 Block 在下次选择目标时处理缺失 profile。
- 不删除共享凭证，不新增通用级联删除框架。
- 不修改网络规则本身的 CRUD 或运行时启动语义。

## Acceptance

1. 无网络规则的连接确认后正常删除，返回删除规则数 0。
2. 有一条或多条网络规则的连接确认后，profile 与全部关联规则被删除，其他 profile 和规则保持不变。
3. 网络规则持久化删除失败时，profile 被恢复且前端收到明确错误，不出现静默的半删除结果。
4. 删除确认文案准确说明关联规则会被删除、共享凭证不会删除；右键菜单和编辑器删除按钮使用同一流程。
5. 删除成功后前端刷新连接列表、清空当前编辑对象，并在反馈中显示被清理的规则数量；相关 Network session 被关闭。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1、2、3 | Rust application/repository 测试覆盖无引用、级联、保留无关规则和失败回滚 |
| 4、5 | ConnectionDialog Testing Library 测试覆盖编辑器与右键入口、确认文案、返回结果和刷新状态 |
| 全部 | `pnpm check`；`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` |

## Open Questions

无。删除关联网络规则通过最终确认按钮取得显式授权。

## Recommended Approach

方案一是维持后端阻止删除，只强化错误提示；风险最低，但用户仍需跨界面手工清理，不能解决“正常删除”目标。方案二是在 React 中先逐条删除网络规则再删除连接；改动看似较小，但把引用完整性和失败处理放错层，且容易产生部分删除。推荐方案三：application 层协调两个 repository，profile 删除后批量原子删除关联规则，第二步失败则恢复 profile；command 只转发结果并关闭相关 Network session。

## Next Skills

- `writing-qb-plans`：Strict 计划。
- `checking-architecture-boundaries`：保证跨 repository 规则留在 application 层。
- `protecting-critical-behavior`：先补级联与回滚回归测试。
- `maintaining-project-context`：更新原“禁止级联”的长期决策。
- `verifying-before-completion`：执行前后端质量闸口。

Directory Map: not needed。未新增或移动模块边界。
