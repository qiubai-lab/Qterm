---
id: QB-20260901-p0-large-file-decomposition
type: design
tier: strict
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes:
  - 2026-08-23-large-file-modularization
---

# P0 大文件职责拆解

## Goal

完成当前代码评估中 P0 级大型生产文件的职责拆解，使 SSH 传输与会话、Workspace runtime、凭证以及 SSH Config 导入各自拥有可独立理解、测试和回滚的模块边界，同时保持现有产品行为、IPC、持久化格式和安全不变量不变。

本 change 接续 `2026-08-23-large-file-modularization` 已完成阶段之后的残余范围；旧规格中已完成的样式、主题、Git 前端和初步 SSH 模块化历史保持有效，本 change 不重复实施。

## Scope

- 拆分 `src-tauri/src/infrastructure/ssh/client/transfer.rs` 中的 Terminal clipboard staging、远程文件操作、上传、下载、递归扫描和流式复制职责。
- 拆分 `src-tauri/src/infrastructure/ssh/client/session.rs` 的 purpose-specific 运行循环，并收敛 `client.rs` 中 manager façade、session entry、control 和任务注册职责。
- 拆分 `src/workspace/WorkspaceProvider.tsx` 的持久化和 Terminal、Files、Network、Git runtime 编排，同时保持一个 Context 和一份权威 runtime state。
- 将 `commands/credential.rs` 与 `commands/profile.rs` 中可脱离 Tauri 的用例决策和失败回滚迁入 application；command 继续拥有 DTO、系统对话框、受限文件 I/O、状态注入和错误映射。
- 在模块迁移前后保护取消、清理、route、host-key、文件路径、凭证 secret、rollback、epoch/intent 和 block 隔离行为。
- 根据实际落地结构更新 Directory Map 和必要的架构说明。

## Non-Goals

- 不新增、删除或改变用户可观察功能。
- 不改变 Tauri command 名称、参数、返回 DTO、事件 payload、错误码或 TypeScript IPC 契约。
- 不改变 Workspace、profile、credential、network、known-hosts 或其他持久化 schema。
- 不修改认证、host-key、SSH route、SFTP、上传下载、Terminal staging、转发、凭证恢复或 SSH Config 导入规则。
- 不拆分 credential vault 的密码学 envelope、KDF 或 JSON record。
- 不重写 Workspace 状态管理方案，不引入新状态管理库、全局可变单例或新的运行时依赖。
- 不处理 P1 UI 容器、Git CLI、普通测试文件或样式模块，除非它们因 P0 模块迁移需要最小 import/fixture 调整。
- 不构建 desktop release bundle。

## Assumptions

- 当前公开 façade 和现有自动化测试代表应保持的行为基线。
- 可以调整 private/internal Rust 可见性和 TypeScript 内部 import，但不得扩大第三方类型或 secret 的可见范围。
- 行数用于发现和验收异常，不代替职责、依赖方向和行为验证。

## Constraints

- `SshSessionManager` 继续是 commands/application 使用 SSH session 的唯一基础设施 façade；russh 和 russh-sftp 类型不得离开 infrastructure。
- `WorkspaceProvider` 继续是唯一 Context 和 runtime 状态 owner；控制器只通过显式 getter、updater、dispatch 和 IPC adapter 工作。
- application/domain 不依赖 Tauri、russh、React 或 persistence record；commands 不新增可测试业务规则。
- 私钥正文、密码、data key、recovery material、设备路径和 Git stdin 不得进入 WebView、日志或普通序列化 DTO。
- 所有长任务继续拥有取消、幂等 close、失败清理和有界 I/O；拆分不得改变 task drop、channel close 或 cleanup 顺序。
- 分阶段迁移；每阶段聚焦验证通过后才进入下一阶段。

## Requirements

- REQ-001：所有 P0 拆分保持现有 UI、IPC、持久化、安全与错误行为兼容；只改变内部所有权和依赖结构。
- REQ-002：SSH transfer 按 staging、远程文件操作、上传、下载和共享流式复制形成明确内部模块；入口 façade 不再拥有全部实现细节。
- REQ-003：SSH session 按 Terminal、Files、Network、Git purpose 分派到独立 runner；共享连接、取消和关闭逻辑只有一个权威实现，`SshSessionManager` 公共调用方式不变。
- REQ-004：Workspace persistence 以及 Terminal、Files、Network、Git runtime 编排拥有独立内部控制器；所有 epoch、intent、writer、buffer 和 session ownership 仍由 Provider 的单一状态源约束。
- REQ-005：credential 与 SSH Config import 的可测试决策、pending 生命周期和跨 repository rollback 归 application；commands 只保留 transport/desktop adapter 职责。
- REQ-006：P0 façade 目标不超过 500 行，新生产模块目标不超过 700 行；无法满足时必须记录具体内聚原因，且不得用空转发文件伪造达标。
- REQ-007：关键取消、失败、回滚、secret、路径和竞态行为在迁移前有自动化保护，迁移后测试数量和语义不得退化。
- REQ-008：实际模块职责和禁止依赖被同步到 Directory Map；只有已落地的稳定事实才能进入长期架构 context。

## Behavior Delta

不适用。本 change 是行为保持型内部设计重构；没有 ADDED、MODIFIED 或 REMOVED 的用户可观察行为。

## Acceptance

- AC-001（REQ-001）：现有前端与 Rust 公共契约无需调用方行为迁移，完整质量门通过，相关 schema/version 与 IPC DTO diff 为空或仅有 private import 调整。
- AC-002（REQ-002、REQ-006）：原 `transfer.rs` 成为窄入口或被等价 module façade 取代；staging、file operations、upload、download 和 copy helpers 可分别定位与测试，所有新生产模块不超过 700 行或有审查记录的内聚例外。
- AC-003（REQ-003、REQ-006）：Terminal、Files、Network、Git control loop 有独立 owner，`client.rs` 与 session façade 均不超过 500 行或存在明确例外；purpose capability 与 cleanup 测试通过。
- AC-004（REQ-004、REQ-006）：`WorkspaceProvider.tsx` 不超过 500 行；四类 runtime 的事件、connect/disconnect 和 host-key 动作由独立模块拥有，Provider 仍只公开一个兼容 Context。
- AC-005（REQ-005、REQ-006）：`commands/credential.rs` 与 `commands/profile.rs` 各不超过 500 行；跨凭证/Profile 的选择、commit 和 rollback 可在无 Tauri mock 的 application test 中验证。
- AC-006（REQ-007）：传输取消与临时文件清理、SFTP path safety、purpose capability、route/host-key、凭证草稿/恢复、SSH Config partial failure rollback、Workspace stale event/buffer/writer 隔离均有通过的自动化证据。
- AC-007（REQ-008）：Directory Map 与源代码逐项一致，未把候选或未来模块写成既有事实。

## Traceability

- TASK-001（REQ-007）：盘点并补齐 P0 关键行为基线。
- TASK-002（REQ-002、REQ-003、REQ-006）：拆分 SSH transfer、session 和 manager 内部职责。
- TASK-003（REQ-004、REQ-006）：拆分 Workspace runtime controllers 与 persistence owner。
- TASK-004（REQ-005、REQ-006）：迁移 credential 和 SSH Config import application workflow，收窄 commands。
- TASK-005（REQ-008）：更新结构文档和边界说明。
- VER-001（AC-002、AC-003、AC-006）：运行 SSH/files/transfer/session/network/Git purpose 聚焦测试及 Rust fmt、clippy、全量测试。
- VER-002（AC-004、AC-006）：运行 WorkspaceProvider 聚焦测试、TypeScript、ESLint、Vitest 和前端完整检查。
- VER-003（AC-005、AC-006）：运行 credential/profile/import application 与 command 回归测试，并审查 secret/DTO 边界。
- VER-004（AC-001、AC-007）：检查公开契约、文件规模、Directory Map，并执行最终完整质量门。

所有 REQ 均由至少一个 AC 覆盖；所有 AC 均映射到一个或多个 VER。

## Options

### A. 按职责分阶段迁移（推荐）

先锁定行为，再按 SSH、Workspace、command/application 三个可独立验证阶段迁移。成本较高，但能控制异步清理和安全回归，单阶段可回滚。

### B. 仅按行数机械切文件

短期改动快，但会产生大量转发、跨文件共享状态和循环依赖，无法解决所有权问题，不满足本 change。

### C. 同时重写状态与服务抽象

可能得到更整齐的最终 API，但会把结构迁移与行为重写混在一起，显著放大竞态、secret 和兼容风险，不采用。

## Risks And Rollback

- SSH runner 拆分可能改变 control 接收、cancel select、channel close 和 cleanup 顺序；每次只移动一个 purpose，并用现有 capability/cleanup 测试保护。
- transfer helper 的可见性调整可能弱化路径校验或聚合进度；路径构造和 copy loop 继续保持 private 或 `pub(super)`。
- Workspace controller 可能捕获陈旧闭包或复制 runtime state；禁止 controller 持有第二份 state，保留 epoch/intent/writer 测试。
- credential/profile workflow 迁移可能延长 secret 生命周期或破坏 partial rollback；继续使用 secret wrapper/zeroize，并先建立 application 失败测试。
- 每阶段保留稳定 façade；若验证失败，仅恢复该阶段的 import/owner 迁移，不回退已通过的其他阶段，不修改用户数据。

## Quality

`reviewing-spec-quality` 结果：PASS（2026-09-01）。frontmatter 与 change ID 无冲突；8 个 REQ 均有 AC 覆盖，7 个 AC 均映射到 VER，Behavior Delta 与行为保持范围一致；主路径、失败清理、回滚、安全、兼容和规模 NFR 无阻塞缺口。用户已明确批准 P0 范围并要求开始执行。

## Open Issues

无。实现中如发现现有测试无法证明某项安全或清理不变量，必须先补保护再移动对应逻辑。

## Next Action

已完成并归档。后续如需处理 P1 文件规模或既有 Git Windows 路径断言，应建立独立 change，不扩展本行为保持型 P0 范围。

## Verification Summary

- VER-001：SSH client 定向测试 23 passed、4 ignored；Rust fmt 与 all-target/all-feature Clippy 通过。manager/session/transfer façade 分别为 469/308/58 行，新增生产模块最大 638 行。
- VER-002：WorkspaceProvider 定向测试 26 passed；完整前端 `pnpm check` 为 71 个 test files、632 tests 通过，ESLint、TypeScript 与 Vite build 通过。Provider 为 95 行，四类 controller 独立且共享单一 runtime state hook。
- VER-003：application SSH Config 5 tests、profile 10 tests、credential 9 tests 通过；包含 profile batch 失败后回滚本次新建凭证的无 Tauri 证据。application import coordinator 不依赖 Tauri、russh 或 infrastructure parser 类型。
- VER-004：`commands/credential.rs` 与 `commands/profile.rs` 分别为 299/219 行；`src-tauri/src/lib.rs` 与 `src/lib/tauri/` 无 diff，schema/version 未变；Directory Map 已按实际结构更新。
- 完整 Rust 测试原命令复现基线中的唯一既有失败 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning`（本 change 未修改 `domain/git.rs`）；跳过该断言后 all-target/all-feature 结果为 264 passed、4 ignored、0 failed，main target 0 tests passed。
