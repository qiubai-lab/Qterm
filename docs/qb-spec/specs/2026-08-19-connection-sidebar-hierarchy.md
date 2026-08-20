# 连接侧栏信息层级优化 Task Spec

Status: Complete (2026-08-19)。

## Goal

连接管理侧栏在大量分组和连接下仍保持关键操作可达、信息易扫读，并减少右键菜单中的重复移动路径。

## Scope

- 连接右键菜单移除所有“移动到分组”操作，仅保留编辑与删除。
- “未分组”具备与普通分组一致的折叠能力。
- 新建连接、新建分组按钮固定在侧栏顶部，不随列表滚动。
- 密码管理入口移动到连接管理弹窗标题栏。
- 重构连接项的名称、状态与端点信息层级，但保持紧凑高度和拖动能力。

## Constraints

- 拖动分组和编辑器中的分组选择继续作为移动连接的两条路径。
- 不改变连接、分组或密码保险库后端行为。
- 右键、键盘、拖动和折叠操作保持可访问名称与状态反馈。
- reduced-motion、对比度和现有深色视觉语言继续生效。

## Non-Goals

- 不新增多级分组、排序、搜索、连接状态探测或后端 schema。

## Acceptance

1. 连接右键菜单不再显示任何“移至”选项，编辑和删除仍可用。
2. “未分组”可以展开/折叠，且仍可作为拖动落点。
3. 创建操作不在滚动容器内；长列表滚动时始终可见。
4. 密码管理按钮位于弹窗标题栏，侧栏底部不再占位。
5. 连接项以更清晰的名称、状态点和端点信息呈现，选中态具有明确但克制的视觉重点。

## Acceptance To Verification

- 1–4：`ConnectionDialog.test.tsx` 组件行为与 DOM 结构测试。
- 5：`appStyles.test.ts` 样式契约与组件语义结构测试。
- 全量：`pnpm check`；后端无行为改动，但按仓库门禁运行 Rust fmt/clippy/test。

## Open Questions

无。

## Recommended Approach

采用显式标题栏 action slot 和侧栏固定工具条。相比 CSS sticky 覆盖滚动内容，这种结构能从布局上保证操作固定，并避免叠层与滚动边缘问题；连接项继续保持 30px 密度，用点、字重、等宽端点和左侧选中强调建立层级。

## Verification Evidence

- `pnpm vitest run src/components/dialogs/ConnectionDialog.test.tsx src/app/appStyles.test.ts`：22 项通过。
- 本地浏览器检查：默认焦点位于“新建连接”，创建工具条可见，密码管理仅位于标题栏；纯 Web 模式缺少 Tauri IPC 的提示属于既有预览限制。
- `pnpm check`：ESLint、95 项 Vitest、TypeScript 与 Vite production build 全部通过。
- Rust fmt/clippy/test：76 项通过，1 项依赖本机 OpenSSH 环境的测试按既有标记忽略。
- `git diff --check`：通过。

## Next Skills

- `writing-qb-plans`（Standard：多文件 UI 行为调整）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed
- Directory Map: not needed
