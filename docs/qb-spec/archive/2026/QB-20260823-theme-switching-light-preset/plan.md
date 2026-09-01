---
id: QB-20260823-theme-switching-light-preset
status: archived
archived: 2026-09-02
legacy: true
---
> 实施状态（2026-08-23）：Phase 0–5 已落地并通过前后端自动化质量门。后续视觉回归已把文字层级、图标、Block chrome 与 scrollbar 迁入两主题共同语义契约，修复 Light 终端黑边并增加 4.5:1 对比度测试；既有 feature CSS 的其余原始暗色值仍由 `lightOverrides.css` 作为过渡兼容边界，并用逐文件 raw-color budget 禁止新增债务，后续按功能继续迁移而不是扩张该层。

## Background

Qterm 已建立 `document.documentElement[data-theme]`、Dark semantic tokens、xterm theme registry 和 CodeMirror editor tokens，但当前只支持 Dark，部分 feature CSS 仍含直接暗色值。系统设置由 Rust application/repository 持久化，现有 `device/settings.json` schema v2 专门承载 security settings；Workspace 不拥有 application appearance state。

主题切换同时影响持久化、启动首帧、Tauri 原生窗口、缓存的 imperative renderer 和全局视觉可访问性。新增 schema 与 IPC 且需要大范围颜色归并，因此使用 Strict plan。

## Requirement

新增 Light 内置主题和 Dark/Light 设置入口。Dark 保持默认及视觉兼容；选择可即时预览、取消可恢复、保存后持久化，并在启动时同步 WebView、原生窗口、xterm 和 CodeMirror。

## Non-Goals

- 不提供 system/auto/custom/imported theme。
- 不修改 Workspace、SSH、凭据或连接行为。
- 不改变现有 Dark 的设计意图和布局。
- 不把 theme 写入 Workspace document、profile、security settings 或 localStorage。
- 不新增第三方主题、状态管理或可访问性依赖。

## Architecture Impact

- 新建 App-level theme controller/provider，拥有 `persistedTheme`、preview、commit、restore 与 renderer refresh；WorkspaceShell 只消费设置 UI，不持有 theme state。
- `main.tsx` 在 React render 前执行 theme bootstrap；默认 Dark CSS/DOM marker 保留，读取失败不阻塞启动。
- `src/lib/tauri/window.ts` 增加 `setNativeWindowTheme(theme)` 窄 adapter；capability 只增加 set-theme 所需最小权限。
- Settings application snapshot 聚合 security、configuration directory 与独立 appearance repository。appearance 使用 `device/appearance.json` schema v1，不改变 `device/settings.json` v2。
- CSS preset contract 由 Dark/Light 两个 theme 文件实现；feature CSS 只消费 shared 或 feature-semantic token。raw color guard 允许的固定透明/第三方值必须显式注释。

## Domain Model Impact

- 在 settings domain 新增封闭 `AppTheme::{Dark, Light}` 与 `AppearanceSettings`，默认 `Dark`。
- `SecuritySettings` 保持原结构和验证规则；appearance 与 security 不共用 model 或 repository record。
- Theme 是设备外观偏好，不是 Workspace/domain content，不进入 layout model。

## API Impact

- `settings_get` 的返回值新增 `appearance: { theme: "dark" | "light" }`。
- 新增 `settings_update_appearance`，严格输入 `{ theme }`，拒绝未知字段和值。
- 既有 general/security command、DTO 字段和 TypeScript 调用保持兼容。
- `src/lib/tauri/settings.ts` 新增 `AppTheme`、`AppearanceSettings` 与 update bridge。

## Database Impact

- 新增当前配置根 `device/appearance.json` schema v1：仅包含 `schemaVersion` 与 `theme`。
- 缺失文件返回 Dark 默认；损坏或未来 schema 保留原文件并通过 snapshot warning 安全回退 Dark。
- 写入继续使用原子文件替换；不能读时不得覆盖。
- `device/settings.json` schema v2 及现有 security 数据字节不因本任务改写。

## Implementation Tasks

### Phase 0 — Baseline and behavior protection

1. 记录 Dark 关键 tokens、代表性 computed styles、现有 Settings DTO/repository fixtures 与 xterm refresh 行为。
2. 先增加失败测试：缺失 appearance 默认 Dark、preview close rollback、save failure rollback、cached terminal refresh、strict appearance DTO。
3. 盘点全部 CSS 原始颜色并分类为 shared semantic、feature semantic、透明 material 或第三方固定值；建立临时迁移清单和最终 allowlist。

### Phase 1 — Appearance domain and persistence

1. 在 settings domain 增加 `AppTheme` 与 `AppearanceSettings`，实现 Dark 默认和封闭解析。
2. 新增 `AppearanceSettingsRepository` port 与 `JsonAppearanceSettingsRepository`，使用独立 schema v1、严格字段、大小限制和原子写入。
3. 扩展 SettingsService snapshot 聚合 appearance；新增 update appearance 用例，不修改 security update 路径。
4. 在组合根注入 active configuration root 下的 `device/appearance.json` repository。
5. 增加 repository/application tests：missing/default、round-trip、corrupt、future、unknown field、failed save preservation，以及 security file unchanged。

### Phase 2 — IPC and startup theme controller

1. 扩展 Rust snapshot DTO并新增 `settings_update_appearance` command；注册 command，添加 deny-unknown/serialization tests。
2. 扩展 TypeScript settings bridge 与 contract tests。
3. 新建 `src/app/theme/` controller/provider，API 限于 current/persisted theme、preview、commit、restore；不暴露任意 token 写入。
4. 调整启动流程：Dark marker 立即存在；读取 appearance 后在 React render 前应用 theme，失败回退 Dark并继续启动。
5. 在 window adapter 调用 Tauri `setTheme("dark" | "light")`，补最小 capability；native 同步失败不回滚已持久化偏好，但记录可展示的非阻塞失败策略。
6. theme apply 后调用 `refreshTerminalThemes`；CodeMirror 由 CSS variables 自动更新。覆盖已有和随后创建的 renderer。

### Phase 3 — Semantic token completion and Light preset

1. 将 Dark selector 明确为默认/`data-theme="dark"`，保持全部既有 Dark token 计算值。
2. 把 feature CSS 剩余颜色按语义迁移；优先复用 surface/text/border/accent/status/material roles，仅在确有独立含义时增加 feature token。
3. 新增 `themes/light.css`，为 shared、terminal ANSI、editor 和必要 feature tokens提供完整 Light 值。
4. 为 Light 校准透明材质、shadow、selection、disabled、danger、focus 与 scrollbar；避免只做颜色反转。
5. 增加 raw-color guard：theme preset 可定义原始颜色，feature CSS 只允许有说明的固定透明/第三方兼容项。
6. 检查 reduced-transparency 与 increased-contrast 覆盖优先修改 token，避免复制两套组件规则。

### Phase 4 — Settings appearance UI

1. 在 Settings sidebar 增加“外观”分类，不挤入“通用”或“安全”。
2. 使用 `radiogroup`/radio semantics 呈现 Dark、Light 两个紧凑主题卡，提供名称、简短说明和非纯颜色的选中标记；必要时只扩展现有 Icon vocabulary。
3. 选择触发 preview；保存调用 appearance IPC 并 commit；关闭、Escape 或保存失败 restore persisted theme。
4. Settings 其他分类继续使用原保存逻辑；切换分类不丢失未保存 appearance draft。
5. 确保正常/最小窗口只有 settings content scroller，footer 和保存反馈位置稳定。

### Phase 5 — Verification and context

1. 运行 focused frontend/Rust tests，再运行完整质量门。
2. 在 Dark/Light、普通/最小窗口检查 Workspace、Connection、Credential、Files editor/preview、Network、Settings、About，以及 hover/selected/disabled/focus/error/success。
3. 检查 cached/new terminal、CodeMirror、原生 Windows/macOS/Linux chrome；记录无法本机覆盖的平台风险。
4. 检查键盘 theme selection、focus visible、对比度、reduced motion/transparency 和 increased contrast。
5. 更新 Architecture Spec、Directory Map、task spec/plan 状态；记录独立 appearance schema 和 theme owner 决策。

## Acceptance To Verification

- A1 → domain/repository default tests、bootstrap failure test、Dark token baseline。
- A2 → SettingsDialog Testing Library radio/keyboard/selected-state tests。
- A3 → preview/restore/commit/save-failure tests、appearance repository restart round-trip。
- A4 → theme controller + window adapter mocks、terminal registry tests、CodeMirror computed/style contract、手工 cached renderer 检查。
- A5 → Light visual matrix、代表性色彩对比检查、focus/contrast media checks。
- A6 → Dark token snapshot、representative screenshot/computed-style comparison、raw-color guard。
- A7 → repository corrupt/future/unknown/atomic preservation tests，并对 security fixture 做字节级不变断言。
- A8 → Rust DTO tests、TypeScript bridge tests、既有 settings tests 全量回归。

## Test Plan

### Frontend focused

- `pnpm vitest run src/app/theme/*.test.ts src/app/themeStyles.test.ts src/terminal/terminalTheme.test.ts`
- `pnpm vitest run src/components/dialogs/SettingsDialog.test.tsx src/lib/tauri/settings.test.ts`
- `pnpm vitest run src/files/FileBrowserPane.test.tsx src/terminal/TerminalPanel.test.tsx src/workspace/WorkspaceShell.test.tsx`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm check`

### Rust focused

- `cargo test settings --all-targets --all-features`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

### Manual visual matrix

- Dark/Light × 普通窗口/720×520 最小窗口。
- Workspace、Connection、Credential、Files/CodeMirror/Markdown、Network、Settings、About。
- cached terminal 与切换后新建 terminal；选区、ANSI red/green、cursor、scrollbar。
- pointer、keyboard、focus-visible、reduced motion、reduced transparency、increased contrast。
- Windows/macOS/Linux 原生窗口至少记录一项真实验证或明确平台缺口。

## Rollback Plan

- appearance 使用独立文件，无需回滚或迁移 security settings；删除/忽略 `appearance.json` 即回到 Dark 默认。
- 保留 Dark 默认 marker 和 token preset，前端 controller 可回退为固定 Dark而不修改 Workspace 或用户数据。
- IPC 为新增项，可移除 appearance DTO/command而不影响既有 general/security 调用。
- CSS 分阶段迁移必须保持 Dark baseline；若 Light 阶段失败，可回滚 Light preset/UI，同时保留已验证的 Dark semantic token 归并。
- 不通过删除 `settings.json`、Workspace、profile 或 credential 数据回滚主题功能。

## Risks

- 大量 feature raw colors 可能导致 Light 局部仍呈 Dark 或对比不足；必须先完成 token inventory，不能只增加 `light.css`。
- 异步 settings bootstrap 可能造成白/黑闪烁或延迟首屏；Dark 必须作为同步 fallback，并在 React render 前切换已保存 Light。
- preview、save、close 的并发可能把旧结果覆盖新选择；controller 需要 persisted/draft 边界和最新请求保护。
- xterm 实例跨 React 重挂载缓存；只更新新实例会产生混合主题，必须复用 registry 全量刷新。
- Tauri transparent effects 在不同平台对 Light 的材质和标题栏表现不同；native theme adapter 与平台视觉矩阵不可省略。
- 独立 appearance repository 增加 SettingsService 组合复杂度；收益是避免外观变更重置安全设置，不能为了少一个文件重新混入 security record。
- raw-color guard 若一次性过严会阻塞合法透明材质；allowlist 必须小、可审查且带理由。

## Documentation Updates

- 实现后更新 `docs/qb-spec/context/ARCHITECTURE_SPEC.md`：App theme owner、bootstrap、renderer/native adapters、appearance persistence。
- 更新 `docs/qb-spec/DIRECTORY_MAP.md`：`src/app/theme/`、Light preset、appearance port/repository 的实际路径和职责。
- 若最终选择不同持久化位置或 preview 语义，更新本 spec/plan 并在 `DECISIONS.md` 记录长期取舍。
