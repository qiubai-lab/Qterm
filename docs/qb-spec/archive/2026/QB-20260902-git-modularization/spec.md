---
id: QB-20260902-git-modularization
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 模块化与源码尺寸门禁

## Approval

用户于 2026-09-02 采纳仓库超大单文件审计的推荐方案，并明确要求落地 spec、plan 并开始实施。本规格据此批准并进入实施。

## Goal

在不改变 Git 产品行为和公开契约的前提下，把当前最高风险的本机 Git 聚合文件拆成按能力定位、可独立阅读和验证的内部模块，并建立渐进式源码尺寸门禁，阻止新的超大单文件和既有热点继续增长。

## Change Shape

- Type：`design`，技术驱动来自上下文局部性、变更隔离和可定向验证能力，不新增产品功能。
- Tier：`standard`，首批只调整本机 Git infrastructure 的内部物理边界、测试布局和仓库质量脚本；不改变 domain、port、IPC、schema、安全策略或用户行为。
- 后续 `commands/git`、remote Git、GitPane 与 Workspace 拆分使用独立 change，避免把首批扩大成跨前后端大重构。

## Current Evidence

- `src-tauri/src/infrastructure/git_cli.rs` 约 3,759 个物理行，其中约 1,651 行为内嵌测试；生产代码同时包含进程执行、snapshot、mutation、冲突处理和多类 parser。
- 最近 80 个提交中，该文件累计约 3,858 行增删，是当前“大且高频修改”的最高风险热点之一。
- `pnpm check` 与 Rust 门禁没有源码尺寸或既有热点增长检查，新功能可以持续进入聚合入口而不产生反馈。
- `GitExecutor` 是稳定应用端口；本次应保留单一 trait implementation façade，通过内部能力模块委托，而不是修改上层契约。

## Scope

- 将 `git_cli.rs` 转换为目录模块，以稳定 `SystemGitExecutor` façade 对外实现现有 `GitExecutor`。
- 按 process、snapshot/parsing、changes、conflict、branch/sync、submodule 等内部能力拆分本机 Git 实现。
- 将内嵌 Rust 测试迁移到按行为命名的测试子模块，保持现有断言与真实 Git fixture。
- 增加确定性的源码尺寸检查：新文件使用类型上限；已知超限文件通过显式 baseline 只允许缩小、不允许增长。
- 将尺寸检查接入现有 `pnpm check`，并更新 Directory Map 的稳定模块职责。

## Non-Goals

- 不拆分 `commands/git.rs`、`domain/git.rs`、remote SSH Git、GitPane、WorkspaceShell 或 LayoutView；它们进入后续独立 change。
- 不改变 `GitExecutor` / `RemoteGitExecutor` trait、Tauri command、IPC DTO、错误码或 TypeScript client。
- 不修改 Git 命令参数、timeout、输出上限、pathspec、安全脱敏、Submodule 或冲突语义。
- 不建立新的运行时 abstraction、依赖注入框架、通用 SCM 层或第二套 Git model。
- 不把 domain model 与 IPC DTO 合并以追求表面复用。

## Assumptions And Constraints

- 当前 Git 测试是行为兼容性的事实源；纯模块移动必须保持测试内容和 fixture 语义。
- Rust trait implementation 保留在 façade，能力模块提供 `pub(super)` 函数或内部 helper，避免 trait/public surface 扩张。
- 尺寸门禁必须忽略生成物、资产和锁文件，并允许有理由的显式 baseline；不能要求一次性修完仓库全部历史热点。
- 当前未提交的 `src-tauri/Cargo.toml` 属于用户改动，本 change 不覆盖或还原它。

## Options Evaluated

### Option A：按行数随机切片

实现最快，但会产生无语义的 helper 文件和跨模块私有状态，不能改善 agent 定位和所有权，拒绝采用。

### Option B：稳定 façade + capability modules（采用）

保持 port 和调用方不变，将不同 Git 能力放入语义模块。迁移可逐步验证，适合后续局部功能修改。

### Option C：拆分 Git port 和重建 bounded context

长期可能有价值，但会触及 application/domain/remote adapter 和公共编译契约，超出本批次的行为中性目标。

## Requirements

- REQ-001：`SystemGitExecutor` 必须继续通过相同的 `GitExecutor` port 暴露全部本机 Git 能力，调用方、返回模型和错误语义保持不变。
- REQ-002：本机 Git process、读取/解析、change mutation、conflict、branch/sync 与 Submodule 实现必须拥有可辨识的内部模块边界；聚合入口只负责 façade、共享配置和委托。
- REQ-003：现有 parser、安全失败、真实仓库生命周期、同步、冲突和 Submodule 测试必须按行为迁出生产模块，断言语义不得因拆分而弱化。
- REQ-004：仓库必须对新建 TypeScript、TSX、Rust、CSS 与测试源码执行确定性尺寸上限，并对已知超限文件执行不增长 baseline；检查必须可在本地和 CI 通过同一命令运行。
- REQ-005：源码尺寸门禁失败必须列出具体文件、实际行数、允许行数和修复方向；资产、生成物、lockfile 与 build output 不得产生误报。
- REQ-006：结构索引必须记录新的 `git_cli/` façade 与 capability ownership，不镜像完整文件树或加入短期迁移历史。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]：Rust 编译、Clippy 与全部 Git/Rust 测试通过；`GitState` 和 application service 无需改变 import 或 port 使用方式。
- AC-002 [REQ-002]：`git_cli` 聚合入口不再包含 parser、conflict、branch、Submodule 和长集成测试实现；新增生产模块各自具有单一可描述能力，且没有新的万能 `utils` 模块。
- AC-003 [REQ-003]：原有 `git_cli` 单元与真实 Git fixture 均继续运行；测试按 parser、lifecycle/sync、conflict/Submodule 等行为可被定向执行。
- AC-004 [REQ-004, REQ-005]：尺寸检查在当前 baseline 上通过；人为超出新文件上限或扩大既有超限文件时返回非零状态并报告文件、actual 与 limit。
- AC-005 [REQ-004]：`pnpm check` 包含尺寸门禁，并继续执行既有 lint、frontend tests、TypeScript 与 Vite build。
- AC-006 [REQ-006]：Directory Map 能从入口直接定位本机 Git process、parser、mutation、conflict 与测试职责，并继续声明 infrastructure 不拥有领域规则。

## Behavior Delta

不适用。本 change 只调整内部源码和测试物理边界并新增开发期质量门禁，不改变运行时产品行为、数据、协议或用户交互。

## Architecture Boundary Decision

- Boundary Decision：保留 Infrastructure 对系统 Git 的所有权；只在该 adapter 内按能力拆分，不把 Git 命令或 parser 推入 commands/application/domain。
- Placement：`git_cli/mod.rs` 是稳定 façade；process 与输出边界、snapshot/parser、mutation、conflict、branch/sync、Submodule 分别由内部模块拥有。
- Model Separation：Domain Git model、port trait、process output 和测试 fixture 继续分离；本次不新增跨层 DTO。
- Tradeoff：暂不拆 port trait，也不同时处理 remote adapter，以换取可回滚的小批次和更清晰的行为兼容证据。

## Quality Check

- 目标、范围和非目标明确，首批与后续拆分边界清楚。
- REQ-001 至 REQ-006 均由 AC-001 至 AC-006 覆盖。
- 行为中性、兼容边界和现有用户改动保护已明确，无阻塞性歧义。

## Risks And Recovery

- Rust privacy/module path 调整可能造成编译失败；通过 `pub(super)` 最小可见性和逐模块测试处理。
- 大量纯移动可能隐藏意外文本修改；使用 `git diff --stat`、`git diff --check` 和现有真实 Git fixture验证。
- 尺寸 baseline 可能变成永久例外；规则要求 baseline 只允许持平或下降，后续每次拆分同步降低或删除条目。
- 回滚只需恢复内部文件布局和质量脚本，不涉及用户数据、schema 或仓库工作树 mutation。

## Open Issues

- 无阻塞项。
- 后续候选依次为 `commands/domain/remote Git`、`GitPane`、`WorkspaceShell/LayoutView`，均应按各自风险独立塑形。

## Verification Outcome

- AC-001：`cargo clippy --all-targets --all-features -- -D warnings` 通过；`cargo test --all-targets --all-features` 为 281 通过、0 失败、4 个依赖外部 OpenSSH 环境的测试保持忽略。`SystemGitExecutor` 路径、`GitExecutor` port 与上层 import 未改变。
- AC-002：原 3,759 行聚合文件已改为 façade 与 capability modules；生产模块最大为 `conflict.rs` 633 行，未引入通用 `utils` 模块。
- AC-003：原有 21 个 Git 测试按 parser、process、lifecycle、sync、diff、conflict、Submodule 分组保留；聚焦测试与全量 Rust 测试均通过。
- AC-004：尺寸脚本的 4 个 Node 测试通过，覆盖新超限文件、baseline 增长、收紧提醒和陈旧 baseline；当前仓库检查通过且无 ratchet reminder。
- AC-005：`pnpm check` 通过，包括源码尺寸、ESLint、82 个 Vitest 文件共 733 个测试、13 个 Node 测试、TypeScript 与 Vite production build。
- AC-006：Directory Map 已记录 `git_cli/` façade、各 capability 与测试职责，并保留 infrastructure 边界约束。
- 补充检查：变更涉及的 Rust 文件通过 `rustfmt --edition 2024 --check`，`git diff --check` 通过。全仓 `cargo fmt --check` 受工作区既有 CRLF 与 `rustfmt.toml` Unix 换行策略冲突影响，因此未批量改写无关文件。
- 残余风险：历史超大文件仍由 baseline 管控且不得增长；后续热点按独立 change 逐批拆分。
