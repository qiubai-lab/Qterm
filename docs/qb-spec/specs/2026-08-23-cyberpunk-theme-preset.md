## Goal

> 实施状态：已完成顶部 Workspace 色彩层级修正（2026-08-23），并通过完整前端质量门。

新增一套适合长时间终端工作的赛博朋克预设主题，以深色工作台、增强亮黄品牌重点、青色交互状态、琥珀警告和红色错误建立稳定视觉语言，同时保持现有 Dark 与 Light 外观不变。

## Scope

- 增加封闭的 `cyberpunk` 预设，并支持设置页即时预览、保存、取消恢复和启动加载。
- 新主题实现完整 surface、material、text、border、status、workspace、terminal、editor 语义令牌。
- 把主要操作与一般状态 accent 分离：主要按钮及主题识别使用亮黄，连接、启用和焦点继续使用青色。
- 顶部当前工作区采用同一青色状态体系：青色轮廓/图标、青色轻量 surface 与高对比主题主文字；不再混入亮黄，避免与内部活动窗口争夺重点。
- 内部活动窗口保留主题化强调色渐变标题：Cyberpunk 使用黄色渐变，Dark/Light 使用各自 accent 的对应渐变；活动窗口边框与标题形成同一视觉层。
- 设置导航、主题卡、连接选择、列表、页签和分段控件的选中态统一使用亮黄边界、标记与黄色轻量 surface；未选中功能图标继续使用青色。
- 移除顶部 chrome、右侧 utility rail 与工作区画布中无状态意义的黄色渐变，浮层边框和滚动反馈回归青色，避免装饰与选择竞争视觉重点。
- 设置页增加带黄/黑/青视觉缩略图的“赛博霓虹”主题卡。
- 原生窗口把 `cyberpunk` 映射为 Dark，WebView 仍保留独立的 `data-theme="cyberpunk"`。
- 补齐 xterm 16 色 ANSI 令牌映射，并为三个内置预设提供完整色板。
- 更新主题契约、持久化、IPC 和相关行为测试。

## Constraints

- Dark 仍是缺省主题；Dark/Light 只同步活动标题渐变、selection surface 和 Workspace active text 等共享状态契约，其他基础 surface 与布局保持不变。
- 不复制游戏 Logo、字体、HUD 图形或动画；只采用通用的黄、青、红、冷黑色彩语言。
- 亮黄不表达警告；警告使用独立琥珀色，危险继续使用红色。
- 红色仅增加在关闭 hover/pressed、失败、删除和不可逆确认等明确危险语义，不用于普通导航、选中或装饰。
- 正文与终端前景保持中性高对比文字，不使用霓虹色作为普通正文。
- 状态不能只依赖颜色，继续复用既有图标、标签、边框和 ARIA 状态。
- 不引入自定义主题、系统自动主题、第三方样式库或新的状态管理依赖。

## Non-Goals

- 不新增亮色赛博朋克变体或用户自定义调色板。
- 不增加故障抖动、色差重影、扫描线、闪烁或大面积发光。
- 不改变 Workspace、Terminal、Files、Network 或管理器的布局与业务交互。
- 不迁移本任务无关的遗留 raw color compatibility 债务。

## Acceptance

- A1：设置页提供第三个“赛博霓虹”预设，并支持与 Dark/Light 相同的预览、恢复、保存和启动行为。
- A2：`appearance.json` schema v1 可以往返保存 `cyberpunk`，仍拒绝 system、自定义字段和未知值，缺失或失败仍回退 Dark。
- A3：新主题在应用根、原生窗口、存活 xterm 和 CodeMirror 中同步生效；原生窗口明确映射为 Dark。
- A4：新主题完整实现共享主题契约，普通、弱化和终端/编辑器文字满足至少 4.5:1 对比度。
- A5：Cyberpunk 的顶部当前 Workspace 为青色 surface/轮廓/图标配高对比主文字，不出现亮黄；活动内部窗口为亮黄边框与黄色渐变标题；设置、连接选择、列表、页签和分段控件使用黄色轻量选中 surface 与亮黄标记，未选中图标保持青色；琥珀色用于警告。
- A8：工作区关闭与内部窗口关闭仅在 hover/pressed 时使用红色危险反馈；连接失败、错误通知、删除及不可逆确认继续使用红色，普通关闭按钮 rest 状态保持中性。
- A6：xterm 使用完整 16 色 ANSI 色板，三个预设均不依赖库默认值补齐缺失色。
- A7：Dark/Light 现有主题测试、设置行为和后端设置安全规则不回归。

## Acceptance To Verification

- A1/A3：`SettingsDialog.test.tsx`、`AppThemeProvider.test.tsx` 和 window adapter 测试覆盖选择、恢复及 native Dark 映射。
- A2：Rust domain、command DTO 与 JSON appearance repository 测试覆盖新枚举往返及未知值拒绝。
- A4/A5：`themeStyles.test.ts` 检查第三预设令牌完整性、对比度、亮黄/青/琥珀职责和共享 CSS 消费关系。
- A6：`terminalTheme.test.ts` 检查完整 ANSI token registry。
- A7：聚焦前后端测试后运行 `pnpm check`、Rust fmt/clippy/test。

## Open Questions

无阻塞问题。内置 ID 使用 `cyberpunk`，界面名称使用“赛博霓虹”，避免表示官方授权。

## Recommended Approach

顶部 Workspace 评估了两种修正：整体改为亮黄能保持品牌感，但会和活动 Block 的黄边/黄渐变竞争；推荐保留青色容器和图标、让 `--workspace-tab-active-text` 映射 `--text-strong`。这种单色状态体系减少黄青冲突，同时通过 surface、边框、图标和移动 selection surface 继续清晰表达当前 Workspace。亮黄继续专用于内容级选择、主要动作和活动 Block。

## Next Skills

- `writing-qb-plans`：Standard，多文件前后端预设扩展与测试。
- `maintaining-project-context`：更新长期主题集合、native mapping 和色彩角色决策。
- `verifying-before-completion`：执行聚焦及完整前后端质量门。
- `updating-directory-map`：记录第三主题文件和 preset contract 扩展。
- Architecture：沿用既有 App theme owner、repository 和 adapter 边界，不需要额外架构审查。
- Tests：现有主题与 appearance repository 测试可直接扩展，不需要独立 TDD 路由。
