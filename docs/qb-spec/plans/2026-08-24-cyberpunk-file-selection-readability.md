## Requirement

让 Cyberpunk 的文件浏览与编辑 active/selection 状态统一使用亮黄色层级，并修复文件列表选中行黄色填充压低元数据可读性的问题。

## Scope

包含 Cyberpunk Files active/selection token、文件行与 CodeMirror active/selection 样式、样式契约测试与长期主题说明；不包含列表行为、布局或 Dark/Light 改造。

## Affected Files

- `src/app/styles/themes/cyberpunk.css`
- `src/files/fileBrowser.css`
- `src/app/themeStyles.test.ts`
- `src/app/appStyles.test.ts`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`

## Design

- 将 Cyberpunk `--file-selection-surface` 映射为既有轻量黄色 selection surface，`--file-selection-marker` 映射为活动 Block 边框黄，主/次 foreground 都映射为 host 强调同源的 danger red。
- 增加 Files 专用 `--file-active-marker`：Dark/Light 保留 accent，Cyberpunk 映射活动 Block 边框黄；Cyberpunk `--file-active-surface` 改为低于 selected/text selection 强度的黄色 surface。
- 文件行 hover/focus 的侧边标记与图标、CodeMirror 当前行行号与编辑光标共同消费 active marker；键盘 focus outline 继续使用全局 focus 色。
- 文件列表 selected 规则使用一像素完整内框，文件名与元数据分别消费主/次 foreground；Dark/Light 映射继续保持原有主次层级，图标与选择点继续消费 marker。
- Cyberpunk 的 `--editor-selection` 从高强度亮黄降为中强度透明黄，`--editor-selection-foreground` 使用独立的柔和高明度赛博红；两者在 editor background 上合成后的文字对比度至少为 4.5:1。Dark/Light 继续使用普通 editor foreground。
- CodeMirror 通过 state-derived `cm-has-selection` editor attribute 暴露非空选区；该状态下暂停内容区 current-line surface，保留 active-line gutter 与光标反馈，消除选区和当前行的透明层叠色差。

## Acceptance To Verification

- 黄色 active/selection surface、活动窗口同源 marker、host 同源 foreground：`themeStyles.test.ts`。
- 文件行 hover/focus、CodeMirror 当前行/行号/光标、一像素 selected 内框及所有文本列消费关系：`appStyles.test.ts`。
- Dark/Light 不受影响，Cyberpunk 编辑器选区保持协调的黄底红字且具备正文级对比度：主题 token、颜色合成对比度断言和既有样式契约测试。
- 非空选区优先于当前行 surface：`CodeEditor.test.tsx` 的状态属性行为测试与 `appStyles.test.ts` 的样式契约断言。
- 基础完整性：`pnpm check`、`git diff --check`。

## Test / Verification

- 先更新契约断言并运行 `pnpm vitest run src/app/themeStyles.test.ts src/app/appStyles.test.ts`，确认旧实现失败。
- 实现后重跑同一聚焦测试。
- 运行 `pnpm check`。
- 运行 `git diff --check` 并检查仅触及计划内文件及本任务文档。

## Documentation Updates

新增本任务 spec 与 Standard plan；更新 Architecture Spec 和主题决策中 Cyberpunk 文件列表的局部视觉规则。Directory Map 不需要更新。
