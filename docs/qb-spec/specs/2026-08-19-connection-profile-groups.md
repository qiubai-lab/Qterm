# 单层连接分组 Task Spec

Status: Complete (2026-08-19)。

## Goal

用户可以用一层分组整理连接，并能在明确的分组上下文中创建或移动连接，同时保证旧连接数据和删除分组时的连接安全。

## Scope

- 创建、重命名和删除连接分组。
- 从分组标题直接在该分组下新建连接。
- 在连接信息中选择“未分组”或任一已有分组，以移动连接。
- 左侧列表按“未分组 + 用户分组”展示连接；分组可折叠。
- 删除非空分组时只删除分组，原连接原子移动到“未分组”。
- profile 存储升级为包含 groups 与 profile `groupId` 的新 schema；旧 schema 自动加载为未分组。

## Constraints

- 分组只有一层，模型中不提供 `parentId` 或子分组接口。
- “未分组”是派生视图，不作为可删除的持久化分组。
- 分组名去除首尾空白后必填、长度受限；名称不区分大小写唯一。
- profile 与 group 保存在同一原子写入文档中，不能产生悬空 `groupId`。
- 密码保险库继续只按 profile id 管理，与分组生命周期解耦。

## Non-Goals

- 不支持多级目录、拖拽排序、跨分组拖拽或自定义分组排序。
- 不按分组批量连接、删除连接或导入导出。
- 不改变 Terminal/Files 的 profile 引用和连接认证流程。

## Acceptance

1. 用户可以创建唯一命名的分组，并在左侧立即看到空分组。
2. 用户可从分组标题新建连接，保存请求携带该分组 id，连接显示在该组下。
3. 用户可在连接编辑器中把连接移动到其他分组或“未分组”。
4. 用户可重命名分组；重复名或无效名称由稳定错误拒绝。
5. 删除非空分组后，组内 profile 完整保留且 `groupId` 变为 null。
6. schema v1/v2 的既有 profile 可无损读取为未分组；下一次写入升级到新版 schema。
7. 存储拒绝重复 group id、悬空 group id、未知 schema 和敏感字段，且不覆盖源文件。
8. UI 不提供创建子分组的入口，IPC/domain/persistence 模型均没有父分组字段。

## Acceptance To Verification

- 1–5、8：`ConnectionDialog.test.tsx` 覆盖分组创建、组内新建、移动、重命名、删除确认与回退展示。
- 4、5：Rust domain/application 测试覆盖名称验证、唯一性和删除回退规则。
- 5–7：JSON repository 测试覆盖原子持久化、v1/v2 迁移、引用完整性和失败不覆盖。
- 8：DTO 序列化测试与代码审查确认没有父分组字段。
- 全部：运行 `pnpm check` 以及 Rust fmt、clippy、test 质量闸口。

## Open Questions

无。用户已确认删除非空分组时将连接移到“未分组”。

## Recommended Approach

方案一是只给 profile 增加自由文本分组名，改动较小但无法保存空分组、重命名会批量改写字符串，也难以保证一致性。方案二是在同一 profile catalog 文档中保存独立 group 实体和可空 `groupId`，由应用服务编排规则、repository 原子维护引用。采用方案二：它能稳定支持空分组、重命名和安全删除，同时模型天然只有一层。

## Next Skills

- `writing-qb-plans`（Strict：domain、IPC 与持久化 schema 变化）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `maintaining-project-context`
- `verifying-before-completion`
- Directory Map: not needed（沿用现有模块和目录职责）

## Verification

- `pnpm check`：通过（24 个测试文件、88 个测试）。
- `cargo fmt --check`：通过。
- `cargo clippy --all-targets --all-features -- -D warnings`：通过。
- `cargo test --all-targets --all-features`：通过（76 passed，1 个依赖本机 OpenSSH 的既有测试按设计 ignored）。
- profile repository 追加验证 schema v1/v2 均按未分组读取，并在写入时升级为 schema v3。
