## Goal

> 实施状态：已完成（2026-08-23）。共享材质层级、Light 透明逻辑、浮层菜单与无障碍实色回退均已落地并通过完整前端验证。

让 Light 与 Dark 共用同一套可维护的半透明材质层级，使原生 Mica/Acrylic/Blur 能穿透应用根层，同时保持终端、文件与网络内容的稳定可读性。

## Scope

- 为 shell、chrome、utility rail、workspace、workbench panel 与 floating surface 建立跨主题材质变量。
- 让既有结构选择器消费材质变量，Dark 视觉逻辑保持一致，Light 使用更高不透明度的浅色参数。
- 删除 Light compatibility 中阻断原生材质或覆盖浮层模糊的实色规则。
- 保留内容层的高不透明度与现有边界、选中、hover、focus 语义。
- 保留并验证 reduced-transparency 与 increased-contrast 的实色降级。
- 确认现有主题控制器继续同步 DOM、Tauri 原生窗口与 imperative renderer。

## Constraints

- 不改变主题持久化、预览、保存或回滚行为。
- 不修改 Workspace、Terminal、Files、Network 或 Settings 的布局和交互。
- 不让终端文字直接落在低不透明度或不可预测的桌面背景上。
- 不新增依赖，不复制 Light 专属组件规则。
- Windows、macOS 使用现有原生材质能力；Linux 保持可读的 CSS 合成回退。

## Non-Goals

- 不新增第三种主题、用户自定义透明度或系统自动主题。
- 不为所有卡片和控件增加玻璃、阴影或模糊。
- 不修改 Tauri appearance schema、IPC 或目录结构。
- 不重新设计 Dark 主题。

## Acceptance

- A1：Light 的应用根层不再以不透明 `--canvas` 遮挡原生窗口材质。
- A2：Dark/Light 的 shell、chrome、rail、workspace 与 floating surface 使用同名材质契约，仅 preset 参数不同。
- A3：Light chrome、rail 与 workspace 可看到克制的背景透出，terminal/file/network 内容仍保持高可读性。
- A4：Light dialog/menu 不再因纯白覆盖而使 `backdrop-filter` 失效。
- A5：主题切换继续同步 Tauri 原生窗口 theme，不出现 CSS Light 与 native Dark 并存。
- A6：reduced-transparency 与 increased-contrast 下全部关键材质回退为实色并保持边界。
- A7：Dark 关键层级、交互状态与现有自动化检查不回归。

## Acceptance To Verification

- A1/A2/A4：主题与 app style 契约测试断言材质变量完整、选择器消费变量、Light override 不再写实色 shell/dialog。
- A3：代表性 Light/Dark computed style 与本地桌面窗口视觉检查；文本对比测试继续通过。
- A5：既有 `AppThemeProvider` native adapter 测试与主题切换测试。
- A6：样式测试断言 reduced-transparency/increased-contrast 实色覆盖。
- A7：聚焦样式测试、完整 Vitest、lint、typecheck 与生产构建。

## Open Questions

无阻塞问题。Light 使用比 Dark 更高的不透明度，以减少桌面背景对小字号文本的干扰。

## Recommended Approach

采用共享材质角色加双 preset 参数。相比继续在 `lightOverrides.css` 增加补丁，该方案让未来主题只需实现材质契约；相比让所有内容完全透明，该方案把系统材质限制在 shell/chrome/rail/workspace/floating 层，内容块仍由高不透明 workbench panel 承担可读性。

## Next Skills

- `writing-qb-plans`：Standard，多文件主题契约与回归测试。
- `checking-architecture-boundaries`：材质值归 theme preset，结构选择器只消费变量；不进入 feature state。
- `protecting-critical-behavior`：先补主题材质与无障碍降级契约测试。
- `verifying-before-completion`：执行聚焦及完整前端质量门和本地视觉检查。
- Project Context：不需要，本次延续既有主题所有权与原生材质决策。
- Directory Map：不需要，无目录、模块或入口职责变化。
