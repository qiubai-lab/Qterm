---
id: QB-20260823-windows-native-corner-ownership
status: archived
archived: 2026-09-02
legacy: true
---
# Windows Native Corner Ownership

## Goal

Windows 11 浮动窗口的四个圆角只呈现一条连续的系统轮廓，不再出现 WebView 圆角与 DWM 圆角错位造成的浅色缺口。

## Scope

- Windows 使用 DWM 作为窗口外轮廓、边缘与阴影的唯一绘制者。
- Light 主题保持 WebView 根节点透明，只由应用壳层提供内容底色。
- 仅在 macOS 配置中保留原生窗口效果半径与状态。
- 增加跨平台窗口外壳样式与配置契约。

## Constraints

- 保留无边框标题栏、窗口控制、透明材质与现有布局。
- macOS 继续使用 12px 原生/CSS 圆角配合。
- 不新增 Win32 API 调用或自绘窗口阴影。
- 不覆盖工作区中无关的未提交修改。

## Non-Goals

- 不改变内部终端、文件和网络 Block 的圆角。
- 不重设计窗口顶栏或主题色。
- 不为 Linux 引入新的窗口管理策略。

## Acceptance

- Windows `.app-shell` 不再绘制 CSS 外圆角或 inset 外缘。
- Light 主题的 `body` 与 `#root` 保持透明，`.app-shell` 继续提供画布底色。
- 通用 Tauri 配置显式启用原生 shadow，且不再声明 macOS-only 的 effect radius/state。
- macOS 配置继续保留 `radius: 12` 和活动状态效果。
- 样式测试、类型检查与生产构建通过。

## Acceptance To Verification

- `src/app/appStyles.test.ts` 断言 Windows 外壳、Light 根透明和平台配置所有权。
- 运行聚焦样式测试与 `pnpm check`。
- Windows 原生窗口目视检查四角及普通/最大化/Snap 状态；若当前环境无法自动截图则明确记录为残余验证。

## Open Questions

无。

## Recommended Approach

让 Windows DWM 单独负责顶层窗口裁剪，CSS 只在 macOS/Linux 保留壳层圆角。相比把 CSS 半径猜成 Windows 的数值，此方案不会在 DPI 缩放、抗锯齿或最大化策略变化时再次形成双重蒙版。

## Next Skills

- `writing-qb-plans`
- `verifying-before-completion`
- Project Context: not needed; this follows the existing native-window-effect decision
- Architecture: not needed; no new adapter or boundary
- Critical behavior protection: not needed; adjacent configuration/style contracts cover the regression
- Directory Map: not needed
