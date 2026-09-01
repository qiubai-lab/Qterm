---
id: QB-20260819-collapsed-connections-and-password-reveal
status: archived
archived: 2026-09-02
legacy: true
---
# 连接列表折叠与已保存密码回显 Strict Plan

Status: Complete (2026-08-19)。

## Background

连接分组当前默认展开且部分操作会主动展开目标组；选中连接使用左侧 inset 强调。密码输入框的“显示”只切换当前 React state，已保存密码因输入为空而无法恢复显示。

## Requirement

默认折叠所有连接分组、移除选中项左侧高亮，并通过用户明确操作安全恢复当前连接的已保存密码。

## Non-Goals

不新增批量密码管理、持久化折叠状态、修改 vault schema 或后端密码读取能力。

## Architecture Impact

- 分组折叠与按需回显编排均保留在 `ConnectionDialog` UI 状态边界。
- 复用现有 `loadPassword(profileId)` 窄 IPC，不新增后端 command 或 adapter 职责。
- 主密码弹窗继续只负责初始化/解锁；解锁后的待执行回显由父弹窗编排。

## Domain Model Impact

无。

## API Impact

无新增或删除 IPC；前端重新使用现有单 profile `credential_vault_load`。

## Database Impact

无 schema 或持久化变化。

## Implementation Tasks

1. 先补默认折叠、手动展开、已解锁回显、锁定解锁后回显和手动密码不加载的失败测试。
2. 初始化所有分组为折叠，移除新建/拖动后的自动展开。
3. 为密码显示按钮增加按需加载、解锁续接、加载中和失败状态。
4. 移除 selected item 左侧 inset 高亮并更新样式契约。
5. 更新长期产品、安全边界决策并执行完整验证。

## Acceptance To Verification

- 分组行为与密码回显：组件行为测试。
- 视觉规则：CSS 契约测试。
- 安全边界：确认无 manager/list/batch reveal API 回归，且切换 profile 清空明文。

## Test Plan

- Focused：`ConnectionDialog.test.tsx`、`appStyles.test.ts`。
- Frontend full：`pnpm check`。
- Rust full：fmt、clippy、test，确保现有窄 vault load 契约无回归。

## Rollback Plan

回滚 ConnectionDialog 的默认折叠和 reveal 编排以及对应样式/测试；无数据迁移需要处理。

## Risks

- 已保存密码进入前端明文：只在明确点击后加载，仅限选中 profile，并在切换/新建/清除时释放。
- 解锁异步期间切换 profile：待处理动作记录 profile id，完成时必须确认当前选择仍匹配。
- 隐藏不等于清空：隐藏后保留当前输入以支持再次显示，离开连接时清空。

## Documentation Updates

更新 Product/Architecture/Decisions 中“只显示手动输入密码”的旧约束，改为允许明确操作下的当前 profile 单条按需回显；目录结构未变化，不更新 Directory Map。

## Completion Evidence

- 默认折叠、手动展开、新建/拖动不自动展开、单条密码按需回显、锁定续接、手动输入不读取和读取失败保持隐藏均有组件回归保护。
- 选中项样式契约确认不再含左侧 inset 高亮。
- 前后端完整质量门全部通过，未新增 vault API 或存储迁移。
