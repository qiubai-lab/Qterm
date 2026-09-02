---
id: QB-20260902-git-modularization
type: design
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git 模块化与源码尺寸门禁执行计划

## Requirement

实现 `QB-20260902-git-modularization` 的 REQ-001 至 REQ-006；需求、兼容边界和验收以对应 spec 为事实源。

## Scope

- 首批仅重组本机 `SystemGitExecutor`、其测试和仓库尺寸门禁。
- 不修改 Git domain、application port、Tauri command、remote adapter 或前端行为。

## Affected Files

- `src-tauri/src/infrastructure/git_cli.rs` → `src-tauri/src/infrastructure/git_cli/`
- `src-tauri/src/infrastructure/mod.rs`
- `src-tauri/src/domain/settings.rs`（仅修正验证发现的跨平台 test fixture）
- `scripts/check-source-size.mjs`
- `scripts/source-size-baseline.json`
- `scripts/check-source-size.node-test.mjs`
- `package.json`
- `docs/qb-spec/DIRECTORY_MAP.md`
- 本 spec 与 plan

## Design

- 使用 `git_cli/mod.rs` 保持 `crate::infrastructure::git_cli::SystemGitExecutor` 路径稳定，并保留唯一 `GitExecutor` trait implementation。
- capability 模块使用最小的 `pub(super)` API；共享 process runner 和固定 timeout/output limit 归 process 模块所有。
- parser 和 mutation 模块只依赖 domain model 与 façade 提供的窄执行能力，不向上层暴露 process 类型。
- 测试从生产文件迁移到 `git_cli/tests/`，以行为分组；真实 Git fixture helper 保持 test-only。
- 尺寸脚本扫描受控源码根和扩展名。新文件使用类型上限；baseline 中的历史热点使用记录上限，actual 下降后提示收紧 baseline，actual 增长则失败。

## Implementation Tasks

- [x] 增加尺寸检查脚本、baseline 和脚本自身的 Node 测试，并接入 `pnpm check`。
- [x] 把 `git_cli` 转为目录模块，先迁出全部内嵌测试并确认测试发现不变。
- [x] 提取 process/output/error-redaction 能力，保持 timeout、环境和输出限制不变。
- [x] 提取 snapshot/parser、change/diff、conflict、branch/sync、Submodule 能力，让 façade 只保留委托。
- [x] 按行为拆分 parser、真实生命周期、同步、冲突与 Submodule 测试。
- [x] 运行格式化和聚焦 Rust 测试，修复 privacy/import 问题。
- [x] 修正完整 Rust 门禁发现的 Windows 绝对路径 test fixture，不改变 settings 生产行为。
- [x] 更新 Directory Map，只记录稳定入口与职责。
- [x] 运行 standard 完成门禁并记录证据。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | `cargo test --all-targets --all-features`、`cargo clippy --all-targets --all-features -- -D warnings`，并检查 application/command import 未变化 |
| AC-002 | 源码结构检查、单文件尺寸检查和 `rg` 确认 façade 不包含长实现/测试 |
| AC-003 | 定向 `cargo test infrastructure::git_cli::tests` 与完整 Rust tests |
| AC-004 | `node --test scripts/check-source-size.node-test.mjs`，运行实际尺寸检查，并由 fixture 验证增长/新文件失败消息 |
| AC-005 | `pnpm check` |
| AC-006 | 检查 `docs/qb-spec/DIRECTORY_MAP.md` 的入口和目录职责 |

## Test / Verification

按成本从低到高执行：

1. `node --test scripts/check-source-size.node-test.mjs`
2. `pnpm check:source-size`
3. `cargo fmt --check`
4. 聚焦 `cargo test infrastructure::git_cli::tests`
5. `cargo clippy --all-targets --all-features -- -D warnings`
6. `cargo test --all-targets --all-features`
7. `pnpm check`
8. `git diff --check`

## Documentation Updates

- 更新 `docs/qb-spec/DIRECTORY_MAP.md` 中 `git_cli` 的入口与能力目录职责。
- 不更新长期产品或 UI style context；本 change 不产生产品行为或视觉偏好。

## Trigger Signals

- Architecture：已触发；保持 Infrastructure 内部 capability 拆分和现有依赖方向。
- Critical behavior：已触发；Git 命令、安全失败和真实仓库 fixture 必须保持自动化覆盖。
- Directory Map：结构完成后必须更新。
