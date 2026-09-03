---
id: QB-20260903-editor-language-highlighting
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Editor language highlighting plan

## Requirement

- 实现并验证 spec 中的 REQ-001 至 REQ-005。

## Scope

- 新增共享语言识别/加载 capability，接入现有 CodeMirror 和 MergeView 表面，增加精选官方语言依赖及相邻测试。
- 不改变后端、IPC、diff 数据或 UI 布局，不增加编辑器语义功能。

## Affected Files

- `src/editor/editorLanguage.ts`：语言类型、文件名识别、动态加载、缓存与回退 owner。
- `src/editor/editorLanguage.test.ts`：识别、缓存与失败回退的纯能力测试。
- `src/editor/useEditorLanguage.ts`：React 语言加载生命周期 owner。
- `src/files/CodeEditor.tsx`、`src/files/fileBrowserModel.ts`：复用共享语言能力，保留文件预览类型判断。
- `src/git/GitChangePreview.tsx`、`src/git/GitConflictResolver.tsx`：按路径选择共享语言。
- `src/git/editor/GitChangeComparison.tsx`、`src/git/editor/GitConflictInputComparison.tsx`：向现有 CodeMirror 实例注入异步解析结果。
- 相邻 editor/Git/file tests：保护集成和既有行为。
- `package.json`、`pnpm-lock.yaml`：新增精选 CodeMirror 官方语言包。
- `docs/qb-spec/DIRECTORY_MAP.md`：登记共享 editor capability owner。

## Design

- `src/editor/editorLanguage.ts` 是唯一文件名到语言的规则 owner；展示组件只接收语言 ID，不维护扩展名表。
- 动态 loader 使用显式映射，便于 Vite code splitting 和产品支持范围审计；每种语言缓存同一个 Promise。
- React hook 先返回纯文本 extension，加载成功后重配置或重建既有编辑器；拒绝时保留纯文本，不阻塞内容显示。
- CodeMirror 语言包只提供解析/着色；普通编辑器现有 JSON/YAML lint 行为继续由 `CodeEditor` 局部拥有。
- 保持 `previewKindFor` 对图片/Markdown 预览选择的职责，但文本语言判断委托共享 registry。

## Implementation Tasks

- [x] 先添加语言识别、加载缓存和失败回退测试，覆盖 AC-001、AC-002、AC-004。
- [x] 安装精选 CodeMirror 语言包并实现共享 registry 与 React hook。
- [x] 接入普通文件编辑器、Git diff 和冲突编辑器，删除重复语言分支。
- [x] 增加 Git preview 集成断言并运行既有文件/Git editor 回归。
- [x] 更新 Directory Map，执行源码尺寸和 standard tier 验证，记录证据并自动归档。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `src/editor/editorLanguage.test.ts` 表驱动测试全部扩展名、特殊文件名、大小写与未知回退。 |
| AC-002 | registry 测试注入 loader，断言重复/并发请求只调用一次且成功结果复用。 |
| AC-003 | `GitChangePreview.test.tsx` 及 editor 组件测试断言路径语言和共享 extension 接入。 |
| AC-004 | registry loader 拒绝测试及组件创建测试证明失败和未知类型仍为纯文本。 |
| AC-005 | 既有聚焦测试、`pnpm check:source-size` 和 `pnpm check`。 |

## Test / Verification

1. `pnpm vitest run src/editor/editorLanguage.test.ts`
2. `pnpm vitest run src/files/fileBrowserModel.test.ts src/files/CodeEditor.test.tsx src/git/GitChangePreview.test.tsx src/git/editor/GitChangeComparison.test.tsx src/git/editor/GitConflictInputComparison.test.tsx src/git/GitConflictResolver.test.tsx`
3. `pnpm check:source-size`
4. `pnpm check`

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 的 root/module responsibilities，登记 `src/editor/`。
- 验证通过后归档 spec/plan 和验证证据到 `docs/qb-spec/archive/2026/QB-20260903-editor-language-highlighting/`。

## Dependencies

- 新增精选 `@codemirror/lang-*` 包和 Shell/Dockerfile 所需的官方 legacy modes；均为前端构建时依赖，无运行时网络请求。

## Style Context

- 遵守 `ENGINEERING_STYLE_SPEC.md` 的 capability owner、窄入口、相邻测试和源码尺寸 ratchet；本次不改变视觉样式，UI style context 不适用。

## Trigger Signals

- 架构边界：新增跨 files/git 的共享 editor capability，需要更新 Directory Map，但不改变 transport/domain 边界。
- 关键行为保护：文件名映射、异步缓存与失败回退应在实现前建立聚焦测试。

## Verification Evidence

- 测试先行：registry 测试在实现前因缺少 module 失败，新增 SCSS/Less 用例也先按预期失败，随后实现至通过。
- 聚焦：`pnpm vitest run src/editor/editorLanguage.test.ts src/files/CodeEditor.test.tsx src/git/GitChangePreview.test.tsx src/git/editor/GitChangeComparison.test.tsx src/git/editor/GitConflictInputComparison.test.tsx src/git/GitConflictResolver.test.tsx` 覆盖共享加载和三类编辑表面；追加 SCSS/Less 后的聚焦集合 49 项通过。
- 完整：`pnpm check` 通过，包含源码尺寸、lint、807 项 Vitest、13 项 Node 测试、typecheck 与生产 build。
- 结构：Directory Map 已登记 `src/editor/` owner；新增生产模块分别为 123 行和 28 行，低于默认限制，现有 baseline 未增长。
