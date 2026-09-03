---
id: QB-20260903-editor-language-highlighting
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Editor language highlighting

## Goal

让 Git 更改预览及共用的文本编辑表面按文件名识别常见编程语言并进行轻量语法解析与着色，同时保留现有差异计算、编辑、冲突处理和纯文本回退行为。

## Approval

- 2026-09-03：用户采纳“CodeMirror 6 官方语言包 + 精选注册表 + 动态加载”方案，并明确要求落盘 spec/plan 后开始修改。

## Scope

- 建立共享的编辑器语言注册表，集中拥有文件名识别、按需加载和加载结果缓存。
- 首批支持 JavaScript/TypeScript/JSX/TSX、HTML、CSS/SCSS/Less、Python、Rust、Go、Java、C/C++、SQL、Shell，并保留 Markdown、JSON、YAML。
- 将普通文件编辑器、Git 更改预览和 Git 冲突编辑表面接入同一个注册表。
- 对特殊文件名提供有界识别；未知类型或语言模块加载失败时继续显示纯文本。
- 为识别规则、加载缓存/失败回退和 Git diff 集成补充自动化保护。

## Non-Goals

- 不提供编译器级类型检查、语义诊断、补全、格式化、符号导航或 AST 级差异。
- 不更换 CodeMirror MergeView，不引入 Monaco、Shiki 或 Tree-sitter。
- 不改变 Git diff、文件读取、SSH、Tauri IPC、二进制判断或后端大小限制。
- 不承诺识别所有语言或所有模板/生成文件。

## Assumptions And Constraints

- 文件名和扩展名是本阶段唯一语言提示；未知或含糊类型选择纯文本而不是内容嗅探。
- 语言支持必须作为异步增强加载，不能阻塞文本或 diff 首次显示。
- 每种语言的加载请求在进程内缓存；失败结果回退纯文本且不得破坏编辑器。
- 遵守 `docs/qb-spec/context/ENGINEERING_STYLE_SPEC.md` 和 `docs/qb-spec/DIRECTORY_MAP.md`；共享规则不得继续复制到各编辑器组件。

## Requirements

- REQ-001：支持范围内的常见文件名必须映射到正确的编辑器语言，包括 JS/TS 方言和大小写无关的常见扩展名。
- REQ-002：语言支持必须通过显式 CodeMirror 语言模块按需加载，并对同一语言复用缓存结果，避免首屏加载全部语言。
- REQ-003：Git 更改预览、文件编辑器和 Git 冲突编辑表面必须共用同一语言识别与加载规则，且不重复维护语言分支。
- REQ-004：未知文件、纯文本文件或语言模块加载失败时必须保持内容可见、可编辑或可比较，并无条件回退为纯文本。
- REQ-005：现有 Git diff 算法、行号、差异标记、只读属性、文件保存以及冲突编辑行为必须保持不变。

## Acceptance Criteria

- AC-001（REQ-001）：`.js/.mjs/.cjs/.jsx/.ts/.mts/.cts/.tsx/.html/.css/.scss/.sass/.less/.py/.rs/.go/.java/.c/.h/.cpp/.hpp/.sql/.sh/.bash/.zsh` 及约定的特殊文件名得到预期语言；未知扩展名得到 `text`。
- AC-002（REQ-002）：语言加载器只在请求时调用，对同一语言的重复请求只执行一次底层动态加载。
- AC-003（REQ-003）：Git change preview 将路径解析出的共享语言传给现有 MergeView，普通文件和冲突编辑器使用同一个加载入口。
- AC-004（REQ-004）：加载器拒绝时解析结果为纯文本扩展，编辑器和差异视图仍成功创建；未知文件不触发语言模块加载。
- AC-005（REQ-005）：既有文件编辑、Git preview、MergeView 和冲突编辑聚焦测试继续通过，源码尺寸门禁、lint、typecheck 与生产构建通过。

## Behavior Delta

### ADDED

- REQ-001：常见编程语言文件按文件名获得语法解析与着色。
- REQ-002：语言模块按需加载并缓存。

### MODIFIED

- REQ-003：原先仅 Markdown、JSON、YAML 的分散语言分支改为三类编辑表面共享一个语言注册表。
- REQ-004：未知类型继续为纯文本，并新增语言模块加载失败时的显式安全回退。

## Options Considered

- 采用：CodeMirror 6 官方语言包、精选文件名注册表和显式动态 import；与现有编辑器契约最贴合，加载范围可控。
- 未采用：`@codemirror/language-data` 全量语言目录；覆盖更广但会扩大离线桌面发行依赖，本阶段支持范围不需要。
- 未采用：Monaco、Shiki、Tree-sitter；均会重复或替换现有 MergeView 能力，超出轻量语法着色目标。

## Quality Check

- REQ-001 至 REQ-005 均有直接 AC；正常识别、缓存、集成、失败回退和兼容性均可自动验证。
- 范围是普通前端多文件功能，不涉及安全、schema、公共 IPC 或核心 domain，standard tier 足够。
- 用户已批准推荐方案；当前无阻塞性歧义。

## Blockers

- 无。

## Verification Evidence

- AC-001：`src/editor/editorLanguage.test.ts` 的 35 项表驱动/加载测试覆盖 JS/TS 方言、HTML、CSS/SCSS/Sass/Less、Python、Rust、Go、Java、C/C++、SQL、Shell、Markdown、JSON、YAML、Dockerfile、Shell dotfile、大小写与未知回退。
- AC-002：registry 测试证明同一语言的并发/重复请求共享同一个 Promise，底层 loader 只调用一次；Vite 生产构建输出独立语言 chunk，运行时无需网络。
- AC-003：文件编辑器、Git preview、冲突结果和冲突输入比较均调用共享 `useEditorLanguage`；Git preview 集成测试以 `.ts` 路径验证两侧 MergeView 都形成 TypeScript `TypeAnnotation` 解析树。
- AC-004：registry 测试证明 loader reject 被缓存为纯文本 extension，`text` 不调用模块 loader；既有编辑器与 diff 创建测试通过。
- AC-005：`pnpm check` 通过，包括源码尺寸零提醒、ESLint、92 个 Vitest 文件/807 项测试、13 项 Node 测试、TypeScript 和 Vite 生产构建；`git diff --check` 通过。
- Architecture：`src/editor/editorLanguage.ts` 单一拥有识别/加载 adapter，React 生命周期由 `useEditorLanguage.ts` 拥有；Files/Git 只消费窄接口，未改变 IPC/domain/persistence。
- Residual risk：本阶段按文件名识别，不进行内容嗅探；未知或含糊文件保持纯文本。Vite 继续报告既有主 chunk 超过 500 kB 的非阻塞 warning，新增语言解析器已拆为按需 chunk。
