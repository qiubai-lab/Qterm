---
id: QB-20260821-update-check-dialog
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让用户从“关于 Qterm”中以独立、稳定的小窗完成版本检测，并在任何检测结果下都能看到 README 约定的 Homebrew 更新命令。

## Scope

- 将关于页的更新区域收敛为“检测更新”入口。
- 点击入口后打开紧凑嵌套弹窗并立即检测 GitHub Latest Release。
- 弹窗覆盖检测中、已是最新、发现更新和检测失败状态。
- 弹窗始终展示 `brew upgrade --cask qterm`，并提供复制命令操作。
- 发现新版本时继续提供固定 Qterm Releases 页面入口；失败后允许重新检测。

## Constraints

- 复用现有 `checkForUpdate` 与 `openLatestReleasePage`，不改变远程响应和安全边界。
- 复用 `DialogFrame` 的嵌套弹窗、焦点恢复和 Escape 行为。
- Homebrew 命令必须与 README 保持一致，不从远程内容读取。
- 状态变化不能改变弹窗的主要几何结构。

## Non-Goals

- 不自动下载、安装、重启或执行 Homebrew 命令。
- 不增加后台更新检测、检测缓存或自动检查频率。
- 不修改 GitHub release adapter、Tauri 权限或发布流程。

## Acceptance

- 关于页点击“检测更新”后立即打开一个紧凑弹窗并开始检测。
- 检测中禁止重复请求；失败和完成后可以重新检测。
- 最新、可更新和失败状态均有明确的文字与语义反馈。
- 弹窗在所有状态下始终显示 `brew upgrade --cask qterm`，且可以复制。
- 发现更新时可打开代码内固定的 Releases 页面。
- 关闭更新弹窗后关于页保持打开并恢复正常交互。
- 更新弹窗必须绘制在关于页遮罩之上；打开子窗时不得把原有半透明背景切换成纯黑阻塞背景。
- 更新弹窗不设置底部操作栏，只保留标题栏右上角关闭图标。
- 检测完成后，重新检测以图标按钮显示在版本状态卡右侧；发现新版本时 Releases 入口也位于状态卡内。
- 版本状态卡、命令卡和标题栏使用更紧凑的高度，且不显示“此窗口不会自动执行命令”文本。

## Acceptance To Verification

- `InfoDialogs.test.tsx` 验证打开即检测、状态转换、重复请求保护、重试、固定 Releases 入口、命令常驻和复制。
- `aboutUpdateStyles.test.ts` 验证紧凑弹窗、稳定状态区域与命令布局。
- `InfoDialogs.test.tsx` 与 `DialogFrame.test.tsx` 验证父窗不可关闭但不使用最高层阻塞遮罩，锁屏类弹窗仍保留阻塞层级。
- `InfoDialogs.test.tsx` 验证底部关闭按钮移除、状态内联操作、命令提示移除；`aboutUpdateStyles.test.ts` 验证压缩后的高度契约。
- 运行相关测试及 `pnpm check` 验证回归、类型、Lint 和构建。

## Open Questions

无阻塞问题。

## Recommended Approach

推荐使用嵌套紧凑 `DialogFrame`：关于页只保留稳定入口，更新弹窗独立持有检测状态，并将 Homebrew 命令作为固定帮助区。相比在关于页内原地展开状态，此方案避免网络结果改变父窗口布局，也更符合一次性决策的小窗模式。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed，本次不改变长期产品或架构边界。
- Directory Map: not needed，本次不移动模块或入口。
