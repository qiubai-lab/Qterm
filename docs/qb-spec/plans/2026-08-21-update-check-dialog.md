## Requirement

把关于页内嵌更新状态改造成点击后自动检测的紧凑弹窗，并让 README 的 Homebrew 更新命令在所有状态下保持可见。

## Scope

包含关于页入口、嵌套弹窗状态编排、命令复制、样式和相邻测试；不包含 adapter、自动安装、Tauri 权限、后台检查或发布流程改动。

## Affected Files

- `src/components/dialogs/InfoDialogs.tsx`
- `src/components/dialogs/InfoDialogs.test.tsx`
- `src/components/dialogs/DialogFrame.tsx`
- `src/components/dialogs/DialogFrame.test.tsx`
- `src/components/dialogs/aboutUpdate.css`
- `src/components/dialogs/aboutUpdateStyles.test.ts`
- 本 task spec 与 plan

## Design

`HelpDialog` 只管理更新弹窗是否打开，并在子弹窗存在时阻止父弹窗被关闭。子弹窗挂载后立即调用现有 `checkForUpdate`，以请求序号避免关闭或重试后的过期结果覆盖新状态。固定命令区展示并复制 `brew upgrade --cask qterm`；结果区使用稳定高度承载 checking/latest/available/error，发现更新时调用现有固定 Releases opener。

`DialogFrame` 将“不可关闭”和“最高层阻塞遮罩”解耦：默认继续让不可关闭弹窗使用阻塞遮罩，更新弹窗的父级则显式关闭阻塞层级。这样保留终端锁屏等安全场景，同时让后渲染的嵌套更新窗位于关于页之上。

更新弹窗不渲染 footer：标题栏关闭图标是唯一关闭入口；检测完成后，状态卡右侧渲染重新检测图标，可更新状态同时提供紧凑 Releases 入口。标题栏、状态卡、命令卡及其间距统一压缩，复制失败直接反馈在复制按钮自身，不保留额外说明行。

## Acceptance To Verification

- 打开即检测、重复请求保护与过期结果隔离：`InfoDialogs.test.tsx`。
- 四类结果、重试和固定 Releases 入口：`InfoDialogs.test.tsx`。
- Homebrew 命令始终可见且可复制：`InfoDialogs.test.tsx`。
- 紧凑布局、固定状态区域与 reduced-motion：`aboutUpdateStyles.test.ts` 和生产构建。
- 子窗层级与父窗半透明遮罩：`InfoDialogs.test.tsx`；不可关闭弹窗默认阻塞行为：`DialogFrame.test.tsx`。
- footer 移除、完成态内联操作和说明文本移除：`InfoDialogs.test.tsx`。
- 紧凑标题栏、82px 状态卡、命令卡间距：`aboutUpdateStyles.test.ts`。
- 全局回归：`pnpm check`。

## Test / Verification

1. 先更新组件与样式测试并确认新行为在旧实现上失败。
2. 实现弹窗和样式后运行 `pnpm vitest run src/components/dialogs/InfoDialogs.test.tsx src/components/dialogs/aboutUpdateStyles.test.ts`。
3. 运行目标文件 `git diff --check`。
4. 运行 `pnpm check`；若被工作区无关改动阻塞，记录具体失败并独立运行可用的 lint/build/相关测试。

## Documentation Updates

新增本次 task spec 与 plan。README 命令本身不变，Directory Map 无需更新。

## Verification Result

- 紧凑更新弹窗组件与样式定向测试：2 个文件、9 项测试通过。
- `pnpm check` 通过：ESLint、41 个测试文件 / 277 项测试、TypeScript 与 Vite 生产构建全部通过。
- 目标文件 `git diff --check` 通过。
