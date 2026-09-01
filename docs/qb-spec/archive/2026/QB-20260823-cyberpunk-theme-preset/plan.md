---
id: QB-20260823-cyberpunk-theme-preset
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

> 实施状态：已完成顶部 Workspace 色彩层级修正（2026-08-23），并通过完整前端质量门。

新增“赛博霓虹”内置主题，并进一步统一为亮黄选中 surface/标记、主题化活动窗口标题渐变、青色未选中功能状态，以及克制的红色危险反馈。

## Scope

包含前后端主题枚举、appearance schema v1 值域、主题控制器/native 映射、设置预览、新 preset CSS、完整 xterm ANSI 映射、亮黄结构强化、契约测试和长期文档。非目标为自定义主题、动画特效、布局改造以及 Dark/Light 重设计。

## Affected Files

- `src-tauri/src/domain/settings.rs`
- `src-tauri/src/commands/settings.rs`
- `src-tauri/src/infrastructure/persistence/json_appearance_settings_repository.rs`
- `src/lib/tauri/settings.ts`
- `src/lib/tauri/window.ts`
- `src/app/theme/AppThemeProvider.tsx`
- `src/components/dialogs/SettingsDialog.tsx`
- `src/app/app.css`
- `src/app/styles/themes/{dark,light,cyberpunk}.css`
- `src/components/button.css`
- `src/components/dialogs/settingsDialog.css`
- `src/components/dialogs/infoDialogs.css`
- `src/app/styles/shell.css`
- `src/workspace/workspace.css`
- `src/files/fileBrowser.css`
- 相关前端/Rust 测试
- `docs/qb-spec/context/{ARCHITECTURE_SPEC,DECISIONS}.md`
- `docs/qb-spec/DIRECTORY_MAP.md`
- 本 spec 与 plan

## Design

`AppTheme` 保持封闭枚举并增加 `cyberpunk`。DOM 使用该值选择完整 CSS preset；native adapter 将它降级映射为 Tauri `dark`。共享主题 contract 增加 `--signature`、`--signature-contrast`、`--primary-action`、`--primary-action-contrast`：Dark/Light 将其映射到既有 accent，从而保持视觉兼容，Cyberpunk 将其映射到亮黄。普通 active/connected/focus 仍消费青色 `--accent/--focus`。Workspace 通过既有专用 token 获得黄色选中重点，加载 spinner 和主题卡消费 `--signature`。xterm adapter 扩展为完整 ANSI token 表。

二次校准保留 `--selection-surface`，并把顶部 Workspace 从内容级黄色 selection 中独立出来：三套 preset 的 `--workspace-tab-active-text` 映射 `--text-strong`，Workspace 图标消费各主题 `--accent`。Cyberpunk 因此形成青色容器/图标配高对比主文字；活动 Block、Settings 和内容选择继续保留亮黄职责。

## Implementation Steps

1. 将三套 preset 的 Workspace active text 统一映射高对比主题文字。
2. 让当前 Workspace 图标恢复消费主题 accent，保持容器与图标同色系。
3. 更新主题职责文档与样式契约测试，确保 Cyberpunk 顶部 Workspace 不再消费 signature/selection marker。
4. 运行聚焦 Vitest 与 `pnpm check`；本轮无目录或业务边界变化，不需要 Directory Map 或 Rust 质量门。

## Acceptance To Verification

- A1/A3 → Settings、AppThemeProvider 与 window adapter 前端测试。
- A2 → Rust command/repository/domain 测试。
- A4/A5/A8 → theme contract 的令牌、对比度、标题渐变、选中态 consumer 与 danger hover 断言。
- A6 → terminal theme adapter 完整 palette 测试。
- A7 → `pnpm check` 与 Rust fmt/clippy/test。

## Test / Verification

1. `pnpm vitest run src/app/theme/AppThemeProvider.test.tsx src/lib/tauri/window.test.ts src/components/dialogs/SettingsDialog.test.tsx src/app/themeStyles.test.ts src/terminal/terminalTheme.test.ts --maxWorkers=1`
2. `pnpm check`
3. 在 `src-tauri/` 运行 `cargo fmt --check`
4. 在 `src-tauri/` 运行 `cargo clippy --all-targets --all-features -- -D warnings`
5. 在 `src-tauri/` 运行 `cargo test --all-targets --all-features`
6. 手工检查设置预览、主要按钮、当前工作区、连接状态、警告标签、终端 ANSI、编辑器和 reduced-transparency。

## Documentation Updates

更新 Architecture Spec 和 Decisions，把内置主题集合扩展为 Dark/Light/Cyberpunk，并记录 signature/action 与 functional accent 分离及 native Dark 映射；更新 Directory Map 的 theme preset 文件集合。

Plan Level：Standard。
