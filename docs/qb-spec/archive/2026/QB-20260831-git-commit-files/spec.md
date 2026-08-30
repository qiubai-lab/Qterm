---
id: QB-20260831-git-commit-files
type: feature
tier: standard
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Git 图表提交文件列表

## Goal

让本地及 SSH 工作区仓库的 Git 图表能够按需展开某个提交包含的文件，补齐 VS Code 风格的提交内容层级，同时保持首次快照轻量。

## Scope

- 本地与 SSH Git 执行链提供按仓库和提交 OID 查询文件状态的能力。
- 支持新增、修改、删除、重命名和复制状态；重命名/复制保留原路径。
- 图表提交行负责展开、收起、加载、错误重试、空结果和已加载缓存。
- 文件列表只展示路径与状态，不读取文件内容，不提供 diff。

## Non-Goals

- 不增加文件内容对比、提交改写或历史文件打开功能。
- 不把最近所有提交的文件列表预加载到 `GitSnapshot`。
- 不改变现有工作区更改、分支、提交和图表快照语义。

## Requirements

- REQ-001: 系统必须通过独立的按需查询返回指定提交相对第一父提交（根提交相对空树）的文件状态，本地和 SSH 仓库行为一致。
- REQ-002: 查询必须验证仓库路径与完整十六进制提交 OID，并正确解析普通、重命名和复制记录。
- REQ-003: 图表提交行必须可展开/收起，并展示稳定的加载、文件、空结果和可重试错误状态。
- REQ-004: 已成功读取的结果必须按仓库与 OID 缓存，重复展开不得再次执行 Git 命令；不同仓库不得共享缓存。
- REQ-005: 文件列表必须使用主题化紧凑层级显示文件名、目录、状态和原路径，但不得暴露文件内容或 diff 操作。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]: 本地与 SSH 查询对新增/修改/删除返回路径和状态，对重命名/复制同时返回新旧路径；非法 OID 在执行 Git 前被拒绝。
- AC-002 [REQ-003, REQ-004]: 点击提交后只首次触发查询，加载完成后显示文件；收起再展开复用缓存，切换仓库使用独立缓存键。
- AC-003 [REQ-003]: 查询失败显示错误与重试入口，重试成功可恢复；无文件时显示明确空状态。
- AC-004 [REQ-005]: 展开区显示文件图标、文件名、目录、状态及重命名来源，并且没有 diff/比较操作。
- AC-005 [REQ-001, REQ-004]: 原有 Git 快照及本地/远程变更操作保持通过现有回归测试。

## Behavior Delta

### ADDED

- REQ-001: Git 图表可按需读取本地或 SSH 仓库的提交文件列表。
- REQ-002: 提交 OID 与文件状态输出具有独立校验和解析规则。
- REQ-003: 提交行支持展开、收起、加载、错误恢复和空状态。
- REQ-004: 不可变提交文件结果按仓库与 OID 缓存。
- REQ-005: 图表新增只读文件状态层级，不提供 diff。

## Approval

- 2026-08-31: 用户明确要求“补全并完善该部分内容的显示”，批准在已说明的懒加载方案上继续实现。

## Quality Check

- 目标、非目标、失败恢复和性能边界明确；每条 requirement 均有可观察 acceptance 覆盖，无阻塞歧义。

## Verification Evidence

- AC-001：领域 OID 校验、NUL 状态解析、重命名来源、真实本地根提交和 SSH session ownership/control 回归测试通过。
- AC-002：`GitPane.test.tsx` 验证首次按需读取、折叠后复用缓存，以及相同 OID 在不同仓库使用独立查询。
- AC-003：`GitPane.test.tsx` 验证失败提示、原位重试成功和无文件空状态。
- AC-004：Testing Library 验证文件名、目录、状态、重命名来源及无 diff 操作；`gitStyles.test.ts` 验证主题色和图表层级。
- AC-005：`pnpm check` 通过（64 个测试文件、576 项测试）；补充聚焦前端测试通过（2 个文件、28 项测试）；Rust fmt、Clippy 和全量测试通过（238 项通过、4 项环境测试忽略）。
- `git diff --check` 通过；现有 Vite 大 chunk 提示和 Windows linker 信息均非本次失败。

## Completion

- Result：`PASS`。REQ-001 至 REQ-005 已完成，提交文件只在展开时读取并同时支持本地与 SSH 工作区仓库。
- Residual Risk：真实 POSIX SSH Git fixture 仍依赖带 `/usr/sbin/sshd` 与 Git 2.25+ 的测试机，因此沿用既有 `ignored` 环境测试；本次新增的远程 control 与 parser 已由自动化覆盖。
- Directory Map：未新增或移动模块，既有 Git/SSH 分层未变化，无需更新。
