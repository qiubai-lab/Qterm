---
id: QB-20260820-credential-feedback-bubbles
status: archived
archived: 2026-09-02
legacy: true
---
# Credential Feedback Bubbles Implementation Plan

## Background

`CredentialDialog` 当前将所有操作结果写入同一个 `message`，并以绝对定位消息条固定在编辑区底部。该消息条会覆盖详情页底部按钮，且无法表达反馈属于哪个凭证。

## Requirement

把可归属到凭证的反馈改为列表项右侧短时气泡，并为删除、主密码变更等特殊场景提供不遮挡固定操作区的管理级提示。

## Plan Level

Standard。变更集中在一个对话框、样式和前端回归测试，不影响后端或持久化，但涉及异步反馈生命周期、定位和可访问性。

## Architecture Impact

- 反馈编排留在 `CredentialDialog` 展示层，不进入 Tauri bridge 或凭证业务服务。
- 新增局部反馈模型和气泡渲染组件；不建立跨应用全局 toast 基础设施。
- 通过 DOM ref 只读取列表项几何信息，portal 负责逃逸滚动裁切边界。

## Implementation Tasks

1. 用回归测试锁定单项反馈归属、自动消失、管理级特殊提示和旧底部条移除。
2. 将 `message` 替换为带作用域、语气和唯一序号的短时反馈状态，集中管理计时器。
3. 为凭证列表项登记元素引用，实现滚动/缩放后重新定位的右侧 portal 气泡。
4. 将各操作反馈分类：创建、导入、复制、详情读取失败归属凭证项；删除及主密码流程使用管理级提示；锁定事件清除反馈。
5. 重写相关 CSS，确保气泡不占布局、不拦截操作、不会覆盖底部按钮，并支持成功/错误样式。
6. 运行 focused tests 与完整前端质量门禁。

## Acceptance To Verification

- A1/A2/A3：`CredentialDialog.test.tsx` 验证气泡带对应 item 标识、计时后移除，新建/导入继续选中创建项。
- A4/A6：测试删除反馈使用管理级样式，锁定后没有冗余状态气泡。
- A5：组件测试与清理逻辑验证新反馈替换旧反馈，卸载不残留计时器。
- A7：既有 CredentialDialog 测试套件及 `pnpm check` 全部通过。

## Test Plan

- Focused：`pnpm vitest run src/components/dialogs/CredentialDialog.test.tsx src/app/appStyles.test.ts`。
- Full frontend：`pnpm check`。
- 本次不涉及 Rust，省略 Cargo 门禁。

## Rollback Plan

恢复单一 `message` 状态与 `.credential-message` 样式即可回滚；无数据迁移或持久化回滚要求。

## Risks

- portal 定位可能因滚动或窗口变化失准；监听捕获阶段的滚动和 resize 并即时重算。
- 快速连续操作可能出现旧计时器清除新提示；使用反馈唯一序号，仅允许当前反馈计时器清除自身。
- 删除后锚点消失；该场景明确降级为管理级提示。

