## Goal

文件浏览与文本编辑都具备完整、主题一致的右键操作，并让“当前活动行”和“明确选中内容”在所有主题中一眼可区分。

## Scope

- 为 CodeMirror 文件预览/编辑增加自定义文本右键菜单。
- 编辑模式提供剪切、复制、粘贴、全选；只读预览提供复制、全选。
- 支持鼠标右键、ContextMenu 键、Shift+F10、方向键、Home、End、Escape。
- 赛博主题使用青色活动行和亮黄色文本选区。
- 深色与浅色主题使用不同色相、足够对比的活动面与选择面。
- 文件列表的 hover/focus 与 selected 状态复用相同的活动/选择语义。

## Constraints

- 复用现有 Tauri 文本剪贴板能力、文件菜单布局和主题 token；不新增依赖或权限。
- 菜单通过 portal 浮于编辑器之上，不改变编辑器尺寸或滚动归属。
- 剪切和粘贴只能在可编辑模式修改文档；剪贴板失败必须提供可访问反馈。
- 保留 CodeMirror 原有键盘编辑、撤销历史和 Cmd/Ctrl+S 行为。

## Non-Goals

- 不替换 CodeMirror。
- 不实现操作系统原生菜单或新增撤销/重做命令。
- 不改变文件读写、保存确认和图片剪贴板语义。

## Acceptance

- 赛博主题当前行明显为青色系，文本选区明显为亮黄色系，二者重叠时仍可辨认。
- 深色与浅色主题的当前行和文本选区使用不同色相并保持小字号可读性。
- 文件列表 hover/focus 使用活动面，selected 使用选择面与选择标记。
- 文本右键菜单在编辑模式可剪切、复制、粘贴、全选，在只读模式不会提供修改动作。
- 菜单支持指针和标准上下文菜单键盘入口，菜单项支持循环方向导航并可用 Escape 关闭。
- 剪贴板失败不改变布局，并通过 status 告知用户。

## Acceptance To Verification

- 主题与样式契约测试验证三套主题 token 及 CodeMirror/文件列表消费关系。
- `CodeEditor.test.tsx` 验证编辑、只读、剪贴板成功/失败和键盘菜单行为。
- 现有 `FileBrowserPane` 测试验证文件浏览菜单与编辑器集成不回归。
- 运行聚焦 Vitest 与 `pnpm check`。

## Open Questions

无；将用户输入中的“粮荒”按上下文解释为“亮黄”。

## Recommended Approach

方案 A（采用）：扩展现有 CodeMirror React 包装器，在同一组件内管理轻量 portal 菜单；新增文件内容的活动/选择语义 token，并让编辑器和文件列表共同消费。改动局部，视觉映射明确，容易回归测试。

方案 B：保留浏览器原生文本菜单。实现成本低，但无法保证 Tauri 各平台行为、主题风格、键盘逻辑和错误反馈一致，不采用。

方案 C：把文本动作放到固定工具栏。可发现性较高，但不能满足右键菜单诉求且会占用内容空间，不采用。

## Next Skills

- `writing-qb-plans`（Standard）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context：不需要，本次不改变长期产品或领域规则。
- Directory Map：不需要，仅修改既有文件 UI 与主题文件。
