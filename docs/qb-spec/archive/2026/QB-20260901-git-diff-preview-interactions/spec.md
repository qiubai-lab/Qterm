---
id: QB-20260901-git-diff-preview-interactions
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 差异预览显示与触发扩展

## Goal

修复普通更改预览空白和文件行内容重叠，并让用户从工作区更改或提交图表展开文件的整行主区域进入同一套只读差异工作台。

## Approval

用户于 2026-09-01 提供空白预览与变更行重叠截图，明确要求评估并落地：修复显示、优化整项触发、支持图表 commit 展开文件预览。

## Baseline And Diagnosis

- 普通预览存在 `loading=false / detail=null` 的无呈现状态；loader 直接依赖父级函数引用，缺少稳定 ref 与 explicit empty guard。
- `.git-change-row button` 的高优先级共享尺寸把 preview trigger 压缩为 24px，造成文件名和状态重叠。
- 提交图表只读取 `GitCommitFile` 元数据，没有第一父提交/空树与当前提交 blob 内容接口。

## Scope

- 修复预览加载状态机，任何时刻明确呈现 loading、ready、error 或 empty，不允许空白。
- 普通 change item 的主区域整行可点击/键盘触发；stage/unstage 保持独立尾部按钮且不冒泡误触。
- commit 展开文件行改为整行按钮，打开只读 diff；基线为第一父提交，root commit 基线为空树，rename 使用 original path。
- 本地与 SSH 远程提供一致的 commit file diff DTO；复用现有文本、missing、binary、unsupported 降级。
- 保持 conflict resolver、commit 展开/收起、右键菜单和仓库操作兼容。

## Non-Goals

- 不支持任意两个 commit 比较、combined merge diff、hunk staging 或编辑提交历史。
- 不在前端解析 patch；不增加图片视觉比较。

## Requirements

- REQ-001：普通更改预览在成功、加载、失败和意外空响应下都必须有可观察内容；有效响应必须显示 source headings 与 CodeMirror/fallback。
- REQ-002：普通 change item 的图标、路径和状态必须保持不重叠、可截断；点击其完整主区域或键盘激活打开预览，尾部 stage/unstage 只执行原操作。
- REQ-003：commit 展开文件的完整行必须可点击和键盘激活，并打开当前文件的提交差异；commit row 展开、右键菜单与 retry 不回归。
- REQ-004：commit diff 必须按第一父提交/空树到当前提交读取 typed blob；新增、删除、rename、binary、超限与 literal path 语义正确。
- REQ-005：本地和 SSH 远程 commit diff transport 必须一致，路径和 oid 继续经过既有 validation，UI 不决定 Git 基线。
- REQ-006：同一预览工作台必须支持普通更改与 commit 两种上下文，保持默认收起悬浮文件列表、导航、latest-request-wins、错误重试和安全视口布局。

## Behavior Delta

### ADDED

- REQ-003：提交图表展开文件新增整行差异预览。
- REQ-004：新增第一父提交/空树到当前提交的文件内容比较。
- REQ-005：新增本地与远程 commit file diff IPC。

### MODIFIED

- REQ-001：普通差异预览从可能空白改为完整状态呈现。
- REQ-002：变更文件从局部压缩按钮改为不重叠的整行主触发区域。
- REQ-006：预览工作台由工作区专用扩展为工作区/提交共享呈现。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-006]：组件回归覆盖 ready、loading、error/retry、null/empty fallback、函数引用变化与 latest-request-wins，预览不出现无内容状态。
- AC-002 [REQ-002]：GitPane 与 CSS contract 证明主触发按钮占满除尾部 action 外的宽度，长文件名截断且状态不重叠；点击主区域打开预览，点击 action 不打开。
- AC-003 [REQ-003, REQ-006]：图表测试证明 commit 文件整行可访问并打开对应预览，文件列表导航保持在同一 commit，展开/重试/右键邻近行为通过。
- AC-004 [REQ-004, REQ-005]：Rust 实仓与 remote dispatch/parser 测试覆盖普通提交、root、新增、删除、rename、literal path 和 typed non-text fallback。
- AC-005 [REQ-006]：前端完整检查、Rust fmt/clippy/test 与 `git diff --check` 通过。

## Architecture Boundary Decision

- domain/ports 新增 immutable commit file diff model/use case；Git CLI 与 SSH infrastructure 负责 parent/tree/blob IO；commands 仅映射 DTO。
- 预览组件只把两类 typed response 规范化为呈现模型，不计算 commit parent 或读取路径。
- change row 与 commit file row 各自保留语义按钮；不引入通用 clickable div 或 patch parser。

## Quality Check

- 六条 requirement 均有验收覆盖；root/merge first-parent、rename、empty/error、事件边界和本地/远程已明确。
- architecture 与 critical behavior gate 均触发；先增加 regression protection，再修改跨层实现。
- 无阻塞性产品歧义；“commit 展开文件”按现有 `--first-parent` 文件列表语义比较第一父提交。

## Open Issues

- 无。

## Verification Evidence

- AC-001：`GitChangePreview.test.tsx` 覆盖 ready、binary fallback、错误重试、null response、loader 引用变化与 commit 导航；相关前端聚焦测试 51/51 通过。
- AC-002：`GitPane.operations.test.tsx` 验证主预览与 stage action 隔离；`gitStyles.test.ts` 固化两列布局和主按钮全宽契约。
- AC-003：`GitPane.graph.test.tsx` 验证展开提交文件整行按钮、本地 commit diff 弹窗与既有展开缓存行为。
- AC-004：真实 Git 仓库测试验证 root/first-parent、新增、删除、重命名、修改、literal path 与 binary typed fallback；SSH manager dispatch、closed IPC input 与本地/远程前端路由均通过。
- AC-005：`pnpm check` 通过（77 files / 675 tests、ESLint、TypeScript、Vite build）；`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 通过（277 passed / 4 ignored）；`git diff --check` 通过。

## Completion

- 2026-09-01：实现、验证并归档。未新增目录边界；未识别出需要持久化的新 UI 或工程风格偏好。
- 残余风险：未在真实 SSH 服务上运行标记为 ignored 的集成测试；远程路径由 manager dispatch、client 单元测试、类型契约与前端路由覆盖。
