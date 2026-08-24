## Requirement

为文件文本预览/编辑补齐右键菜单，并提高编辑器活动行、文本选区及文件列表选择状态的跨主题对比。

## Scope

- CodeEditor 文本菜单、剪贴板动作、键盘操作和错误反馈。
- dark/light/cyberpunk 文件活动与选择色彩。
- CodeMirror 与文件列表状态样式。
- 邻近行为与样式契约测试。

不包含原生系统菜单、撤销/重做菜单项、依赖或权限变化。

## Affected Files

- `src/files/CodeEditor.tsx`
- `src/files/CodeEditor.test.tsx`
- `src/files/fileBrowser.css`
- `src/app/styles/themes/dark.css`
- `src/app/styles/themes/light.css`
- `src/app/styles/themes/cyberpunk.css`
- `src/app/appStyles.test.ts`
- `src/app/themeStyles.test.ts`

## Design

- 新增 `--file-active-surface`、`--file-selection-surface`、`--file-selection-marker` 三个文件内容语义 token；既有 editor token 对其做别名，避免浏览器样式依赖 editor 命名。
- 赛博主题映射为青色活动面、亮黄色选择面/标记；深色使用薄荷活动面和蓝色选择面；浅色使用淡青活动面和高对比蓝色选择面。
- CodeEditor 菜单复用 `.file-context-menu` 的浮层语言，通过 portal 渲染并保持编辑器内容为唯一滚动区。
- 多选区复制用换行拼接，剪切/粘贴对每个 CodeMirror selection range 执行同一语义。

## Acceptance To Verification

- 三主题颜色和消费关系：`themeStyles.test.ts`、`appStyles.test.ts`。
- 编辑/只读菜单、剪贴板和键盘行为：新增 `CodeEditor.test.tsx`。
- 文件菜单与预览集成：`FileBrowserPane.test.tsx`。
- 完整性：`pnpm check` 与 `git diff --check`。

## Test / Verification

- `pnpm vitest run src/files/CodeEditor.test.tsx src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts src/app/themeStyles.test.ts`
- `pnpm check`
- `git diff --check`

## Documentation Updates

新增本任务 spec 与 Standard plan；无需更新 Project Context 或 Directory Map。
