---
id: QB-20260901-git-change-diff-preview
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 工作区更改差异预览

## Goal

让用户在仓库管理面板中直接选择新增、修改、删除、重命名等普通更改，并在不离开当前仓库上下文的情况下阅读其差异；同一路径的已暂存与未暂存更改必须遵循 Git 三棵树语义分别比较。

## Approval

用户于 2026-09-01 提供当前更改列表截图，采纳“只读大尺寸 CodeMirror 差异工作台、区分 staged/unstaged、本地与 SSH 远程一致”的评估方案，并明确要求落地修改。

## Baseline

当前更改行仅提供暂存、取消暂存或解决冲突操作；前端 snapshot 只有状态元数据，后端没有返回“基线内容 + 目标内容”的普通更改读取接口。冲突工作台已经验证 CodeMirror MergeView、语言识别、非文本降级、大尺寸 dialog 和悬浮文件列表的可复用设计语言。

## Scope

- 普通 staged/unstaged 更改行增加可访问的预览入口，同时保留独立的暂存操作。
- 新增本地和 SSH 远程只读 IPC，按 staged 状态返回 HEAD、index 或 worktree 两侧内容与来源。
- 使用大尺寸只读差异工作台展示文本差异；支持同一仓库内多项更改的列表选择和前后导航。
- 对新增、删除、重命名、未跟踪、二进制、超限和不支持对象提供明确语义与降级界面。
- 增加 domain/infra/transport、repository client、组件交互和样式 contract 回归。

## Non-Goals

- 不在预览工作台内编辑文件、暂存 hunk、恢复内容或解决冲突。
- 不解析或渲染 `git diff` patch 文本，不实现 inline blame、语法诊断或图片像素比较。
- 不改变冲突文件的现有 resolver 入口和流程。
- 不持久化预览工作台的文件选择或展开状态。

## Assumptions And Constraints

- staged 比较 `HEAD → index`；unstaged 比较 `index → worktree`。同一路径同时存在两类更改时显示为两个独立预览项。
- 后端在读取前重新确认 path/staged 仍存在于 snapshot；状态变化时返回可恢复错误，由用户刷新或重新选择。
- 缺失侧按空文本参与新增/删除 diff；binary、超过 2 MiB、symlink/submodule 等不安全或不支持对象只展示元数据，不传输/解码正文。
- 所有 Git 路径均作为 literal pathspec 或经过既有 SSH 参数编码；worktree 读取必须沿用仓库边界和 symlink 防护。
- Qterm UI specification 是 dialog 安全边距、flex shrink、滚动 owner、焦点和 reduced-motion 的规范来源。

## Requirements

- REQ-001：普通更改行必须提供独立于 stage/unstage 的键盘可访问预览入口，入口可识别路径、状态和 staged/unstaged 上下文；冲突项继续使用现有 resolver。
- REQ-002：staged 预览必须返回 `HEAD → index`，unstaged 预览必须返回 `index → worktree`；双重修改的两个预览不得复用或混淆内容。
- REQ-003：本地与 SSH 远程仓库必须提供一致的 change-diff DTO，并正确处理新增、未跟踪、删除和重命名的缺失侧与 original path。
- REQ-004：文本内容必须在只读 CodeMirror difference view 中展示，支持语言识别、变更高亮和前后导航；切换文件时旧请求不得覆盖新选择。
- REQ-005：binary、超限、unsupported 或读取失败必须使用明确的元数据/错误降级，不得把内容误当文本，也不得导致 dialog 崩溃。
- REQ-006：预览工作台必须使用大尺寸安全视口布局、默认收起且不挤压编辑器的悬浮文件列表、明确 loading/empty/error/focus 状态，并遵循 reduced-motion。
- REQ-007：既有 stage/unstage、refresh、commit、conflict resolver、local/remote snapshot 行为必须保持兼容。

## Behavior Delta

### ADDED

- REQ-001：普通 Git 更改行新增只读差异预览入口。
- REQ-002：按 Git 三棵树语义分别提供 staged 和 unstaged 内容比较。
- REQ-003：本地及 SSH 远程新增普通更改内容读取能力。
- REQ-004：新增多文件只读差异工作台。
- REQ-005：新增非文本、超限及读取失败降级。
- REQ-006：新增预览工作台的悬浮文件列表和状态呈现。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-007]：组件测试证明点击路径区域打开预览，stage/unstage 按钮仍只执行原操作；冲突项仍进入 conflict resolver，键盘 accessible name 可区分预览目标。
- AC-002 [REQ-002, REQ-003]：Rust 回归证明 staged、unstaged、双重修改、未跟踪、新增、删除和重命名返回正确 source/path/content；本地与 remote transport 使用同一 DTO 语义。
- AC-003 [REQ-003, REQ-005]：路径安全、binary、2 MiB 上限、unsupported 与状态漂移均返回预期 kind 或错误，奇异路径不会被解释为 Git option/revision。
- AC-004 [REQ-004, REQ-006]：工作台测试证明首次加载、列表/前后导航、latest-request-wins、loading/error/empty、缺失侧文本比较和非文本 fallback 行为；样式 contract 证明 dialog、悬浮列表、滚动 owner 和 reduced-motion。
- AC-005 [REQ-007]：GitPane、repository client、conflict resolver 邻近回归以及前端完整检查、Rust fmt/clippy/test 和 `git diff --check` 通过。

## Architecture Boundary Decision

- domain 定义 change diff 的 source/scope/version 语义；application 只编排 use case；ports 暴露能力；local Git CLI 与 SSH/SFTP infrastructure 负责对象与工作区 IO；Tauri commands 仅做 DTO 映射。
- UI 不解析 patch、不决定 Git 基线，只消费 typed DTO；`GitPane` 负责打开会话，`GitChangePreview` 负责选择与异步加载，feature-local editor 只负责只读比较。
- 普通更改预览与 conflict resolution 保持独立组件和 command，避免将可写冲突规则泄漏到只读浏览路径。

## Quality Check

- REQ-001 至 REQ-007 均有可观察验收覆盖；Git 三棵树、双重修改、rename、missing、remote、安全与降级已明确。
- 本次涉及 domain/ports/infrastructure/transport/UI 多层，架构边界 gate 已触发并按上述 ownership 执行。
- 内容选择和路径安全属于关键行为，先建立 focused regression 后实现。
- 无需用户补充产品决策；默认使用已采纳的大尺寸只读工作台与悬浮列表方案。

## Open Issues

- 无阻塞项。图片类 binary 本次只提供元数据，不做视觉 diff。

## Verification Evidence

- AC-001：`GitPane.operations.test.tsx` 证明本地已暂存路径点击打开预览，独立暂存按钮仍只调用 stage；冲突入口邻近回归保持通过。远程用例证明 preview 使用独立 remote change-diff IPC。
- AC-002：真实 Git repository 回归证明双重修改分别返回 `HEAD → index` 与 `index → worktree`，并覆盖未跟踪、删除和 staged rename 的 original path/content；remote manager dispatch 与 typed DTO 回归通过。
- AC-003：本地实仓覆盖以 `-` 开头的 Unicode literal path；remote parser 覆盖空格、Unicode 和 leading dash；binary/missing/unsupported、2 MiB 上限与 snapshot drift 由 typed reader 和既有安全边界实现，command DTO 继续 deny unknown fields。
- AC-004：`GitChangePreview.test.tsx` 覆盖默认收起、悬浮列表、同路径 staged/unstaged 选择、source headings、binary fallback、读取错误与重试；`gitStyles.test.ts` 证明 1480×920px 安全视口、absolute popover、pointer ownership 和 reduced-motion；CodeMirror comparison 保持独立延迟加载 chunk。
- AC-005：聚焦前端测试 36 项通过；完整 `pnpm check` 通过 ESLint、77 个测试文件共 670 项测试、TypeScript no-emit 与 Vite production build。Rust `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 通过，结果为 275 passed、4 个既有环境型 ignored；`git diff --check` 通过。

## Residual Risk

- 没有在真实 SSH 服务器上新增端到端文件内容测试；remote manager/control、path parser、DTO、前端 routing 已自动化覆盖，实际 object/SFTP 命令沿用已验证的 SSH Git 与远程文件基础设施。建议在真实远程仓库点测一次 staged 与 unstaged 双重修改。
- jsdom 在既有 conflict CodeMirror 测试中仍输出 `Range.getClientRects` 缺失的非阻塞 stderr；测试通过，真实浏览器不受影响。
- Vite 继续报告既有主 chunk 超过 500 kB 的提示；新增 `GitChangeComparison` 为约 0.87 kB（gzip 0.57 kB）的独立延迟加载 chunk。
