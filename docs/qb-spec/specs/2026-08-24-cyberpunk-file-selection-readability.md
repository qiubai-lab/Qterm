## Goal

赛博主题的文件浏览与编辑交互统一采用层级清晰的亮黄色方案，同时让文件列表的选中元数据保持清晰可读。

## Scope

- 文件浏览行 hover/focus 使用轻量亮黄 active surface 与亮黄侧边标记。
- 选中行使用暗色轻量黄色 surface 与活动内部窗口同源的亮黄细框。
- 选中行的文件名及三列元数据使用与活动窗口 host 信息同源的赛博红色。
- 文件图标与选择标记继续使用亮黄，保留非纯色文字的选择提示。
- 文件编辑器当前行、活动行号、编辑光标使用 Files 同源亮黄 active marker；文本选区使用中等强度亮黄背景和独立的柔和赛博红文字。
- 文本存在非空选区时，由选区 surface 优先承载内容背景，当前行 surface 暂停显示；活动行号与编辑光标仍保留当前行定位反馈，避免两层半透明黄色在光标行叠加。

## Constraints

- 通过文件列表语义 token 和共享 feature CSS 实现，不增加 Cyberpunk 专属 feature selector。
- 不改变 Dark、Light、CodeMirror 多选行为或普通编辑器文字。
- 保持现有紧凑行高、网格列宽、键盘焦点与滚动归属。

## Non-Goals

- 不重新设计全局 selection、danger 或内部窗口样式。
- 不把 Files 的亮黄色 active marker 扩散到全局 focus、连接状态或其他工作台模块。
- 不改变文件列表结构、选择逻辑和文件操作。

## Acceptance

- Cyberpunk 选中行不再使用遮蔽元数据的大面积高亮黄填充。
- Cyberpunk 选中行具有与活动内部窗口相同来源的亮黄一像素内框和轻量黄色底。
- 文件名、链接标签、大小、权限和时间均使用与活动 host 信息同源的红色并清晰可辨；图标及选择点保持亮黄。
- 文件行 hover/focus、编辑器当前行、活动行号与编辑光标使用亮黄色系；文本选区以更强黄色 surface 和红色文字与 active 状态区分。
- Cyberpunk 编辑器选区保留黄底红字，但黄色面积不再与红字争抢亮度；红字达到正文级对比度。Dark 与 Light 视觉映射不变。
- 光标所在行进入文本选区时，选中区域不得因 current-line surface 叠加而产生局部色差。

## Acceptance To Verification

- `themeStyles.test.ts` 验证 Cyberpunk Files active/selection surface、marker 与主/次文字 token 的映射，并确认编辑器选区使用独立的中强度黄色 surface、柔和红色 foreground，合成后对比度不低于 4.5:1。
- `appStyles.test.ts` 验证文件行 hover/focus、编辑器当前行/行号/光标消费 active token，以及选中行细框和所有文本列消费 selection token。
- `CodeEditor.test.tsx` 验证非空选区驱动编辑器 selection 状态类，`appStyles.test.ts` 验证该状态下暂停 current-line surface。
- 聚焦 Vitest、`pnpm check` 与 `git diff --check` 验证样式契约和基础完整性。

## Open Questions

无。截图只作为视觉问题证据，不包含额外指令。

## Recommended Approach

方案 A（采用）：沿用 `--file-selection-*` 与 Files 专用 `--file-active-marker`。文件列表 selected 继续使用活动 host 同源红色；编辑器选区把大面积黄色降为中强度透明 surface，并将小面积文字提升为稍柔和、较高明度的独立赛博红，合成对比度至少 4.5:1。这样保留黄底红字，同时避免两个高饱和色处于相近亮度产生色彩振动。

方案 B：在 `:root[data-theme="cyberpunk"] .file-row` 上直接覆盖。代码较少，但把主题判断泄漏到 feature 样式，并容易遗漏元数据列，不采用。

方案 C：继续提高全局 `--danger` 的亮度或饱和度。文字面积虽更醒目，但会放大黄红对撞并影响错误、删除和 host 强调，不采用。

## Next Skills

- `writing-qb-plans`（Standard：主题、feature CSS、测试与长期主题契约为多文件改动）
- `maintaining-project-context`（同步 Cyberpunk 文件列表这一长期视觉例外）
- `protecting-critical-behavior`（先补样式契约回归测试）
- `verifying-before-completion`
- Directory Map：不需要；没有目录、模块边界或入口变化。
