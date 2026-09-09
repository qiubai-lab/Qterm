---
id: QB-20260909-file-content-search
type: feature
tier: standard
status: archived
created: 2026-09-09
updated: 2026-09-09
supersedes: []
---

# 文件预览与编辑搜索

## Goal

在文件预览和编辑界面提供一致的当前文件搜索体验，让用户无需离开 Qterm 即可定位普通文本、代码和 Markdown 渲染内容。

## Scope

- 文本/代码预览、文本/代码编辑、Markdown 渲染预览支持当前文件搜索。
- 提供工具栏入口、`Ctrl/Cmd+F`、增量匹配、匹配计数、上一个、下一个和关闭操作。
- `Enter` 定位下一个，`Shift+Enter` 定位上一个，`Escape` 关闭并恢复内容焦点。
- 同一文件切换预览/编辑时保留查询；离开文件后清空搜索会话。
- 匹配普通文本时不区分大小写，并支持中文与跨 Markdown 内联节点的可见文本。

## Non-Goals

- 图片内容识别或图片搜索。
- 替换、正则、大小写开关、全词匹配和跨文件搜索。
- 后端、SFTP 协议或文件读取上限变更。

## Requirements

- REQ-001: 非图片文件的预览工具栏必须提供可发现的搜索入口，并在内容区域获得焦点时接管 `Ctrl/Cmd+F`，不得显示 CodeMirror 自带的第二套搜索面板。
- REQ-002: 搜索条必须显示查询、当前匹配序号/总数，并支持上一个、下一个、关闭、`Enter`、`Shift+Enter` 与 `Escape`。
- REQ-003: 普通文本和代码模式必须高亮全部匹配并将当前匹配滚动到视野内；编辑模式中的未保存内容必须立即成为搜索来源，搜索不得修改文档或 dirty 状态。
- REQ-004: Markdown 预览必须只搜索渲染后的可见文本，支持跨内联元素匹配，不得搜索 Qterm 其他界面、链接地址或 Markdown 标记。
- REQ-005: 同一文件切换预览/编辑时保留查询并重新计算结果；关闭文件预览时清空会话。空查询或无结果不得残留高亮。
- REQ-006: 搜索 UI 和匹配高亮必须使用现有主题语义色、紧凑控件与可见键盘焦点，并在窄文件窗格中保持可用；单次最多装饰 5,000 项，超过时以 `+` 明示结果被截断，避免极密集匹配阻塞界面。

## Behavior Delta

### ADDED

- REQ-001, REQ-002: 文件预览工具栏新增当前文件搜索入口和完整键盘导航。
- REQ-003: CodeMirror 预览/编辑新增全部匹配与当前匹配高亮。
- REQ-004: Markdown 渲染预览新增限定在自身 DOM 的可见文本搜索。

### MODIFIED

- REQ-005: 文件预览/编辑模式切换现在会保留并重新应用当前查询。

## Acceptance

| ID | 对应需求 | 可观察结果 |
| --- | --- | --- |
| AC-001 | REQ-001, REQ-002 | 文本文件可通过工具栏或 `Ctrl/Cmd+F` 打开唯一搜索条；输入、计数、循环前后导航及关闭快捷键可用。 |
| AC-002 | REQ-003, REQ-005 | 代码/文本预览与编辑高亮全部匹配和当前项；编辑内容变化、模式切换、空查询及关闭均正确刷新或清理，且不触发保存状态变化。 |
| AC-003 | REQ-004, REQ-005 | Markdown 按渲染可见文本匹配，包括跨内联节点和中文；结果不越出预览容器，关闭后恢复原 DOM。 |
| AC-004 | REQ-006 | 搜索条、无结果、普通匹配、当前匹配、焦点与窄窗格样式均使用既有 token，并满足 source-size ratchet。 |
| AC-005 | REQ-001–REQ-006 | 文件搜索聚焦测试、lint、类型检查、构建和仓库 `pnpm check` 通过。 |

## Implementation Steps

- [x] 建立纯文本匹配模型与会话 hook，并先覆盖循环导航和重置边界。
- [x] 为 CodeMirror 增加受控 decorations/selection adapter，拦截其默认搜索面板。
- [x] 为 Markdown 建立容器内文本节点索引与安全高亮 adapter，覆盖跨内联节点清理。
- [x] 新增紧凑搜索条和文件预览组合组件，将 baselined `FileBrowserPane` 缩为组合入口。
- [x] 补齐主题样式、响应式样式、相邻行为测试和 Directory Map 所有权说明。

## Verification Mapping

| Acceptance | Check |
| --- | --- |
| AC-001 | File preview surface interaction tests；确认 `Ctrl/Cmd+F` 不产生 `.cm-panels`。 |
| AC-002 | Code editor search adapter/model tests。 |
| AC-003 | Markdown preview search tests，覆盖跨节点、中文和清理。 |
| AC-004 | CSS assertions 与 `pnpm check:source-size`。 |
| AC-005 | `pnpm check`。 |

## Verification Evidence

- AC-001–AC-003：文件搜索相关 7 个聚焦测试文件共 30 项通过；包含 `Ctrl+F` 唯一搜索面板、循环导航、编辑器 decoration、Markdown 跨内联节点/中文文本来源与关闭清理。
- AC-001–AC-004：包含 `FileBrowserPane` 和既有右键菜单保护在内的 9 个文件域测试文件共 84 项通过；主题样式断言、lint、TypeScript 与 source-size 检查通过。
- AC-004：`FileBrowserPane.tsx` 从 738 行基线降到 730 行并同步收紧 baseline；source-size 检查为 0 reminder。搜索装饰上限 5,000 项并以 `+` 明示截断。
- AC-005：`pnpm check` 通过：142 个前端测试文件 / 986 项测试、17 项 Node 脚本测试、ESLint、TypeScript 和 Vite production build 全部成功。Vite 仅保留既有的大 chunk 提示。
- 聚焦浏览器 smoke check 能启动 Qterm browser-only 壳层；文件读取依赖 Tauri IPC，因此目标文件预览面的视觉结果由组件行为测试和 CSS contract 覆盖，未将 browser-only 壳层冒充真实文件预览人工验收。

## Architecture Decision

搜索匹配规则由 Files-owned 纯模型负责；`useFileSearchSession` 是唯一搜索会话 owner；CodeMirror 与 Markdown 各自只实现内容表面的 adapter；`FilePreviewDocument` 负责搜索条和文档展示组合；`FileBrowserPane` 继续拥有文件读取、保存与离开确认。无 IPC、持久化和后端契约变化。

## Approval

用户在 2026-09-09 明确要求按前一轮评估方案开始落地，覆盖本规格范围。
