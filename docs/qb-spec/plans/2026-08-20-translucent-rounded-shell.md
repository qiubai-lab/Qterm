## Requirement

修复透明窗口只有深色覆盖、没有原生磨砂，以及 CSS 外轮廓圆角出现锯齿的问题。

## Scope

- 配置 Tauri 原生窗口效果、跨平台回退顺序和 macOS 原生圆角半径。
- 将应用壳层、顶栏、工具栏和工作区的深色覆盖降低为轻量色调。
- 移除窗口外缘的 CSS 深色边框与外阴影，保留终端高对比实色内容层。
- 更新配置与样式回归测试。

非目标：不改变业务逻辑、布局、终端主题、窗口控制或 Linux 的原生材质能力。

## Affected Files

- `src/app/app.css`
- `src/app/appStyles.test.ts`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`
- 本 spec 与 plan

## Design

使用 Tauri `windowEffects`，按 `hudWindow`、`mica`、`acrylic`、`blur` 排列，使各平台选择首个兼容效果；窗口原生主题固定为 Dark，macOS 原生效果半径与 CSS 外壳统一为 12px。WebView 根节点保持透明，整屏 CSS 材质改为低 alpha 色调，终端正文继续不透明。减少透明度和高对比度偏好仍使用实色覆盖。

## Acceptance To Verification

- 原生磨砂与圆角：解析配置并断言 `transparent`、`windowEffects.effects`、`state`、`radius`。
- 无深色叠层：样式断言外壳透明，工作区与 chrome 仅使用低 alpha 色调且不再承担桌面模糊。
- 终端可读性：保留 `.terminal-surface` 近黑背景断言。
- 无障碍：断言 reduced-transparency 与 increased-contrast 的实色覆盖。
- 集成与视觉：运行 `pnpm check`、`pnpm tauri build`，在正式 macOS App Bundle 中对桌面背景截图检查。

## Test / Verification

1. `pnpm vitest run src/app/appStyles.test.ts`
2. `pnpm check`
3. `pnpm tauri build`
4. 在正式 `.app` 中检查外缘抗锯齿、桌面模糊、双分栏和文字对比。

## Documentation Updates

更新同主题 spec 和本 plan；无需项目长期上下文或 Directory Map。

Plan Level：Standard。涉及窗口配置、跨平台原生效果、CSS 与自动化保护，但不涉及安全、公共 API 或领域模型。
