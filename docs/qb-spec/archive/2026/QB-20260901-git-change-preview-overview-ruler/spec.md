---
id: QB-20260901-git-change-preview-overview-ruler
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 更改预览差异概览尺

## Goal

在 Git 双栏更改预览右侧提供类似 VS Code 的半透明差异概览尺，让用户快速理解变更分布、当前视口位置并跳转到目标区域。

## Scope

- 在文本差异 MergeView 右侧叠加轻量概览尺，不渲染完整代码 minimap。
- 复用 MergeView 已计算的 chunks 和对齐后的视觉几何，显示新增、删除、修改位置。
- 显示半透明当前视口滑块，支持点击、拖动和键盘快速导航。
- 原生滚动条和概览尺视口滑块沿用文件管理器的 `--scrollbar-thumb`、`--scrollbar-track`、尺寸和悬停配色。

## Non-Goals

- 不渲染代码文字缩略图或语法高亮 minimap。
- 不重新计算 Git diff，不修改 Git 后端。
- 不改变左右独立水平滚动和共享纵向滚动行为。
- 不在二进制、过大文件、加载、空状态或错误状态显示概览尺。

## Requirements

- REQ-001：长文本差异必须在右侧显示所有 diff chunk 的相对位置和当前视口范围。
- REQ-002：概览尺必须支持点击轨道、拖动滑块和键盘导航，并驱动现有唯一纵向滚动容器。
- REQ-003：新增、删除和修改必须使用可区分的 Git 语义标记，密集标记不得产生不可读的亚像素噪点。
- REQ-004：滚动条与概览尺视口滑块必须复用文件管理器的主题 token、5px 圆角滑块和悬停混色方案。
- REQ-005：概览尺不得破坏两侧行对齐、左右独立水平滚动、短文件布局、主题及辅助功能模式。

## Acceptance

- AC-001（REQ-001、REQ-003）：带新增、删除和修改的长样本生成可测量的概览标记，位置按 MergeView 对齐后的视觉高度映射，标记最小高度不低于 3px。
- AC-002（REQ-002）：点击轨道、拖动滑块、方向键、Page Up/Down、Home/End 会更新 `.cm-mergeView.scrollTop`，并暴露 `role="scrollbar"` 与相应 ARIA 值。
- AC-003（REQ-004）：`.cm-mergeView` 原生滚动条和概览视口滑块使用 `--scrollbar-thumb` / `--scrollbar-track`，悬停使用文件管理器同款 `82% thumb + accent` 混色。
- AC-004（REQ-005）：无纵向溢出时隐藏概览尺；高对比度、降低透明度和减少动画模式仍清晰可用。
- AC-005（REQ-005）：现有共享纵向滚动、物理行对齐、独立水平滚动、只读状态和 Git 预览回退测试继续通过。

## Behavior Delta

### ADDED

- REQ-001：长文本 Git 差异预览新增变更分布与当前视口概览。
- REQ-002：用户可从概览尺快速跳转和拖动浏览文件。
- REQ-003：概览尺用语义标记区分新增、删除和修改。
- REQ-004：概览与原生滚动条跟随文件管理器主题方案。

### MODIFIED

- REQ-005：现有右侧滚动区域增加不改变正文布局和滚动所有权的半透明覆盖层。

## Verification Evidence

- 组件/模型测试：标记映射与合并、最小 3px 高度、点击定位公式、键盘导航及短文件隐藏语义通过。
- 样式契约：原生纵/横滚动条与概览尺复用文件管理器 token、5px 尺寸、82% thumb + accent 悬停混色，并覆盖减少动画、降低透明度和高对比度。
- 真实浏览器：长样本生成 2 个新增和 2 个删除标记；点击概览尺滚动至 1150px，拖动至 1881px；Home/End 分别到 0/2306px。
- 真实浏览器：dark/light/cyberpunk 分别解析 `#438b7d`、`#4f9588`、`#168996`；短文件 `scrollHeight=clientHeight=600` 时概览隐藏。
- 真实浏览器：两侧对齐锚点 Y 差为 0，内部 scroller 的 `scrollTop` 均为 0，左侧水平滚动 420px 时右侧保持 0。
- `pnpm check`：78 个测试文件、683 个测试全部通过；lint、typecheck 与生产构建通过。
- `git diff --check`：通过，仅有工作区既有 LF/CRLF 提示。

## Residual Risk

- 未在原生 Tauri 窗口逐个平台截图；已在项目实际 WebView 前端引擎中验证三主题、交互与布局。

