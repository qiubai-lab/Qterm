---
id: QB-20260831-git-commit-hover-details
type: feature
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git commit 悬停详情与整卡选中态

## Goal

让提交图表中的 commit item 在鼠标悬停或键盘聚焦时显示类似 VS Code 的紧凑详情气泡，并让当前 commit 使用主题亮黄色选中整张信息卡，而不是只显示左侧黄色细条。

## Change Shape

- Type：`feature`，新增可观察的 commit 详情浮层，并调整现有选中反馈。
- Tier：`standard`，涉及本地/远程 Git 日志元数据、transport DTO、React 浮层定位、可访问状态和主题样式的多文件协作。
- 用户已明确要求实现，change 进入 `active`。

## Constraints And Assumptions

- 遵循 Qterm 紧凑工作台、现有 floating material、主题 token 和 portal 浮层规范，不引入 UI 或定位依赖。
- commit 图表线继续位于信息容器之外；“整项亮黄”指整张 commit 信息卡，不将拓扑线包进黄色容器。
- hover 不触发额外本地或远程 Git 请求；只有已经缓存的文件详情才在气泡中补充文件数量。
- 不假设仓库托管于 GitHub，也不伪造头像、远程链接或增删行统计。

## Requirements

- REQ-001：鼠标悬停 commit item 时显示 portaled commit 详情 tooltip；键盘聚焦同一按钮时也可显示，并通过 `aria-describedby` 关联。
- REQ-002：tooltip 显示作者、精确提交时间、完整标题、非空正文、短哈希、父提交/引用摘要；已有 ready 文件缓存时显示文件数量。
- REQ-003：tooltip 必须保持在视口内，随 resize/祖先滚动重新定位，离开 item、失焦、commit 消失或 Git pane 不可见时关闭；不得与原生 `title` 重复。
- REQ-004：本地与远程 snapshot 均携带 commit body，保持 domain model、command DTO 和 frontend transport type 分离。
- REQ-005：`aria-pressed=true` 的 commit 信息卡使用 `--primary-action` 亮黄填充整个容器，并将标题、元数据、展开图标和 decoration 调整为 `--primary-action-contrast` 可读色；不再只显示左侧黄色 inset stripe。
- REQ-006：hover/focus 动画保持短促，并在 reduced-motion/reduced-transparency 下退化；展开文件、连接线、滚动和 branch decoration 行为保持不变。

## Observable Acceptance

- AC-001（REQ-001、REQ-003）：hover/focus 行为测试确认 tooltip portal 到 `document.body`、拥有 `role=tooltip` 与可访问关联，并在 pointer leave/blur 后关闭；commit button 不再有原生详情 `title`。
- AC-002（REQ-002、REQ-004）：组件测试可见作者、精确时间、标题、正文、哈希与引用；Rust parser 测试确认多行 body 被解析，本地/远程 log format 均包含正文占位符。
- AC-003（REQ-003）：定位 helper 测试覆盖右侧优先、视口内 fallback 与上下边缘夹取；组件测试确认祖先滚动和 resize 可更新位置。
- AC-004（REQ-005）：样式契约确认选中 commit card 使用完整 `var(--primary-action)` 背景和 contrast 前景，不再使用仅左侧 `inset 2px` 指示。
- AC-005（REQ-006）：既有 Git pane、graph、files、scrollbar、动画和 reduced-motion 测试继续通过，`pnpm check` 与相关 Rust 测试通过。

## Behavior Delta

### ADDED

- REQ-001：commit item 新增 hover/focus 详情浮层。
- REQ-002：详情浮层新增可读的 commit 元数据和正文呈现。
- REQ-004：Git snapshot 的 commit 元数据新增 body 字段。

### MODIFIED

- REQ-005：commit 选中态从暗色容器加左侧黄条改为整张信息卡亮黄填充。

## Architecture Boundary Decision

- Git CLI adapter 只负责读取和解析正文；domain `GitCommit` 保存稳定元数据；command DTO 负责 camelCase transport；React 只负责展示和浮层状态。
- 浮层几何计算放入 git feature-local 纯函数，避免在 JSX 中混入不可测试的边界算法，也不抽象成无明确复用方的全局 tooltip 框架。

## Non-Goals

- 不新增 GitHub/GitLab 网络请求、头像服务、远程打开链接、增删行统计或 commit 操作菜单。
- 不改变点击 commit 展开/收起文件的行为。
- 不改变 graph topology rail 的容器归属。

## Quality Check

- REQ-001 至 REQ-006 均有 AC 覆盖；数据能力限制和非目标已明确。
- 关键 alternate state 包括 keyboard focus、viewport fallback、空正文和已缓存文件数，无阻塞歧义。
- transport 扩展不改变 command 名称或输入契约，standard tier 足够，无需 strict review。

## Verification

- AC-001：`GitPane.test.tsx` 验证 hover 与 keyboard focus 均创建 `document.body` portal、`role=tooltip` 和 `aria-describedby`；pointer leave/blur 关闭，commit button 不再携带原生详情 `title`，hover 不触发 commit-files 请求。
- AC-002：组件测试验证作者、ISO 精确时间、完整 subject、多行 body、短 hash、branch reference 和缓存文件数量；Rust parser 测试验证多段正文保真。本地和远程 Git log format 均已加入 `%b`，domain/DTO/TypeScript transport 编译通过。
- AC-003：`gitCommitTooltipPosition.test.ts` 覆盖右侧、下方和顶部夹取；GitPane 测试验证 resize 与祖先 scroll 后按新 anchor 位置重新计算。
- AC-004：`gitStyles.test.ts` 明确要求 selected card 的 border/background 使用 `--primary-action`、主要前景使用 `--primary-action-contrast`，并禁止旧 `inset 2px` 左条契约。
- AC-005：前端聚焦测试 4 个文件、39 项通过；`pnpm check` 通过，共 65 个测试文件、586 项测试，ESLint、TypeScript 和 Vite production build 成功；Rust parser 聚焦测试 7 项通过；`cargo clippy --all-targets --all-features -- -D warnings` 与 `cargo fmt --check` 通过；`git diff --check` 通过。

## Style Conformance

- 使用现有 floating material、floating border/shadow、primary action/contrast、accent 与 raised tokens，没有增加主题局部硬编码或 UI 依赖。
- tooltip portal 避免 section overflow 裁剪；pointer-events 为 none，核心点击展开行为保持可用；reduced motion 取消浮层动画，reduced transparency 回退到 raised surface。
- topology rail 仍在 commit 信息容器之外，亮黄只覆盖完整 commit card，符合本次用户指令与先前 graph ownership 约束。

## Completion

实现和验收完成，change 已归档。新增 helper 位于既有 `src/git` ownership 内，没有目录/模块边界变化；本次是 Git 图表局部交互，不形成需要另行持久化的跨产品 UI 偏好。

## Residual Risk

- 当前自动化环境无法复现用户截图中的同一真实仓库与窗口构成，因此没有新增实机像素截图；viewport、portal、主题和内容状态均由聚焦行为/样式测试覆盖。
- 额外运行完整 Rust 测试时，既有 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning` 在 macOS 上因 `C:/absolute.txt` 的平台绝对路径判断失败；本次 diff 未修改该校验。跳过该既有用例后，244 项通过、4 项环境测试忽略、无其他失败。
