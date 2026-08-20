# 快速认证弹窗布局整理

## Goal

让快速认证弹窗在密码、私钥和 SSH Agent 之间切换时保持稳定、清晰且易于扫描。

## Scope

- 适度增宽快速认证弹窗，并固定其可用高度。
- 将认证方式选择、当前方式内容、状态反馈、隐私说明和底部操作建立稳定层级。
- Tab 使用连续滑动指示器，认证内容按选择方向进行短距离切换反馈。
- 收敛密码与私钥风险提示的视觉强度，保留必要的安全信息。
- 保持现有三种认证方式、保险库载入、系统私钥选择和提交行为不变。

## Constraints

- 小窗口下不得超出可视区域。
- 保留键盘焦点、焦点陷阱、ARIA 标签和 reduced-motion 支持。
- 不改变认证请求、凭据生命周期、vault 或 Tauri IPC。

## Non-Goals

- 不修改连接管理页面。
- 不改变认证协议、安全策略或后端实现。
- 不新增认证方式或凭据持久化能力。

## Acceptance

1. 弹窗宽度比现有 compact 弹窗更宽，并在常规窗口中保持固定高度。
2. 三个认证方式切换时，弹窗外框、底部隐私说明和操作按钮位置保持稳定。
3. 当前认证方式只展示必要控件，风险说明不再使用高强调黄色警告块。
4. 密码、私钥和 SSH Agent 的原有提交行为及可访问名称保持可用。
5. 窄/矮窗口以及 reduced-motion 场景仍可使用。
6. Tab 指示器连续移动，内容切换方向与 Tab 的相对位置一致，且动画不阻塞连续点击。

## Acceptance To Verification

- 1、2、3、5、6：样式契约测试与聚焦代码检查。
- 2、4、6：`ConnectionAuthDialog` 交互测试切换全部认证方式、方向状态并验证提交。
- 基础完整性：前端 lint、测试、类型检查与生产构建。

## Open Questions

无。

## Recommended Approach

布局采用独立 frame class 和固定内容槽，避免为每个认证分支分别补空白。动画可选择各按钮独立高亮，或使用共享滑动指示器并让内容按方向进入；推荐后者，因为选中状态连续、空间映射明确，快速反向点击也不会锁定输入。

## Next Skills

- `writing-qb-plans`：使用 Standard 计划覆盖组件、共享 DialogFrame API、样式与测试。
- `verifying-before-completion`：运行聚焦测试与 `pnpm check`。
- Project Context：无需更新，认证规则和长期界面边界未变化。
- Architecture / Critical Behavior：无需额外路由，本次不修改认证逻辑。
- Directory Map：无需更新，没有目录或职责边界变化。
