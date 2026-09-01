---
id: QB-20260820-terminal-session-lock
status: archived
archived: 2026-09-02
legacy: true
---
# 终端会话锁 Strict Plan

Status: Complete (2026-08-20)。

## Background

工具轨锁定入口允许用户选择只清除凭证运行时密钥，或同时以不可绕过的区域遮罩暂停终端交互，并通过主密码同时恢复终端和凭证库。锁定边界限定在顶部标题栏下方，Workspace 切换与窗口控制必须持续可用。

## Requirement

实现两种锁定范围、进程内终端锁屏、不可取消的主密码解锁流程，以及失败不伪报成功的安全状态转换。

## Non-Goals

不新增后端接口、持久化 schema、自动终端锁策略、系统锁屏联动或会话暂停能力。

## Architecture Impact

- `WorkspaceShell` 拥有进程内终端锁状态和全局流程编排，不把它写入 WorkspaceProvider/reducer/settings。
- 新的 dialog feature component 拥有选择界面与锁屏密码临时 state；只通过现有 Tauri credential adapter 调用解锁。
- `DialogFrame` 保持默认全局模态行为，同时允许终端锁屏声明为容器内非全局模态层；锁屏不可取消，但键盘焦点可进入锁定边界外的顶部控件。
- Rust credential lifecycle 继续权威拥有凭证锁定、主密码验证、运行时 key 与自动锁定 deadline。

## Domain Model Impact

无。终端锁是前端进程会话状态，不进入 domain、Workspace document 或 credential model。

## API Impact

无公共/Tauri API 变化；复用 `credential_vault_lock` 与 `credential_vault_unlock`。

## Database Impact

无 schema 或文件变化。`terminalLocked` 不序列化。

## Implementation Tasks

1. 先更新 `WorkspaceShell` 与 `DialogFrame` 测试，并新增终端锁组件测试，覆盖正常、失败和不可绕过路径。
2. 扩展 `DialogFrame` 的不可关闭语义，保持既有弹窗默认行为不变。
3. 新增锁定范围选择弹窗和终端锁屏组件；密码提交时先清空前端 state，再调用现有解锁 IPC。
4. 在 `WorkspaceShell` 编排凭证锁定、进程内锁屏、工作区内容 inert、顶部 chrome 保留和解锁后的 vault 状态。
5. 新增锁屏/选择卡片样式、最高层级、reduced motion/transparency 降级及样式契约。
6. 更新长期 Product/Architecture/Decision 约束，执行聚焦与完整验证。

## Acceptance To Verification

- 入口文案、顺序和选择范围：`WorkspaceShell.test.tsx`。
- 锁定成功/失败状态转换、进程内默认状态：`WorkspaceShell.test.tsx`。
- 密码清空、错误保持、成功同时解锁：终端锁组件测试。
- Escape/背景不可取消、焦点约束：`DialogFrame.test.tsx` 和锁屏集成测试。
- 工作区 inert、容器内最高层遮罩、顶部控件可用、透明度/动效降级：组件属性断言、交互测试与 `appStyles.test.ts`。
- 基础完整性：`pnpm check`、`git diff --check`。

## Test Plan

- 先运行终端锁相关三个测试文件，确认新断言在实现前失败、实现后通过。
- 运行 `pnpm check` 覆盖 ESLint、全部 Vitest、TypeScript 与 Vite build。
- 检查 diff 不包含后端、settings/workspace schema 或新增持久化调用。

## Rollback Plan

删除终端锁组件与 `terminalLocked` 编排，恢复工具轨直接锁定凭证库；移除 `DialogFrame` 的可选不可关闭能力和专用样式。没有数据迁移或后端回滚步骤。

## Risks

- 遮罩仅视觉覆盖但焦点仍留在 xterm：工作区内容必须同时使用 `inert`、终端快捷键守卫和容器内最高层遮罩；顶部 chrome 不进入该边界。
- 菜单层级高于普通 dialog：锁屏 scrim 使用独立最高层级。
- 错误状态造成假锁定/假解锁：凭证锁成功后才进入锁屏，主密码解锁成功后才移除。
- 半透明导致终端文字可读：使用深色高不透明度与 blur，reduced transparency 下改为不透明。
- 应用锁屏不是 OS 安全边界：文档和 UI 只承诺暂停当前应用交互，不终止后台会话。

## Documentation Updates

更新 Product Spec 的核心流程、Architecture Spec 的 Workspace UI/Security 边界与 Decisions 中的进程内锁屏决策；无需更新 Directory Map。

## Completion Evidence

- 新增专用锁定范围与终端锁屏组件，`DialogFrame` 默认兼容地支持不可关闭模式。
- WorkspaceShell 只持有进程内锁状态；未新增 reducer action、settings 字段、持久化文件或后端 API。
- Product、Architecture 与 Decisions 已记录应用内锁屏的长期边界。
- `pnpm check` 全量通过；31 个测试文件、181 项测试成功。
