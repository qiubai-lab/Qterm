---
id: QB-20260901-git-picker-directory-metadata
type: feature
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git picker directory metadata

## Goal

让远程 Git 仓库目录选择器在保持紧凑浏览效率的同时，展示与文件管理 Block 一致的目录图标状态色、权限和时间元数据。

## Scope

- 适度增加 picker 宽度，为名称、权限和时间列提供稳定空间。
- 基础文件夹图标及 hover/selected 状态使用文件管理 Block 的同源 token。
- 将底层目录项已有的 `permissionMode` 与 `modifiedAt` 透传到 Git picker DTO 并展示。
- 元数据缺失时稳定显示 `—`，不改变行选择、打开、虚拟列表或错误回退逻辑。

## Non-goals

- 不把修改时间误标为跨平台不可用的创建时间。
- 不新增 SFTP stat 请求，不改变文件领域模型或 Git 业务规则。
- 不增加大小、排序、上传、删除或其他文件管理能力。

## Requirements

- REQ-001：picker 必须适度增宽，并以名称、权限、修改时间三列呈现目录列表，长名称仍可截断且只有目录区滚动。
- REQ-002：文件夹图标在 rest、hover、selected 状态必须与文件管理 Block 使用相同的基础和状态 token。
- REQ-003：Git 目录 IPC 必须投影底层 `FileEntry` 已有的 `modifiedAt` 与 `permissionMode`，不新增读取或领域规则。
- REQ-004：权限必须使用文件管理 Block 的符号格式；修改时间使用本地化显示；字段缺失显示 `—`。
- REQ-005：现有单击选择、双击/Enter 打开、导航、刷新、错误回退和虚拟列表行为保持不变。

## Acceptance

- AC-001 [REQ-001, REQ-005]：样式契约证明弹窗增宽、三列对齐、长名称截断、单一滚动 owner 和窄视口可用。
- AC-002 [REQ-002]：rest 图标使用 `--accent`，hover 使用 `--file-active-marker`，selected 使用 `--file-selection-marker`，selected-over-hover 保持成立。
- AC-003 [REQ-003]：Rust DTO 序列化与 TypeScript 契约包含 `modifiedAt`、`permissionMode`，值来自既有 `FileEntry`。
- AC-004 [REQ-004]：组件测试覆盖权限、修改时间与缺失字段展示。
- AC-005 [REQ-005]：现有 picker 聚焦回归和相关完整检查通过。

## Behavior Delta

### ADDED

- REQ-001：目录列表增加权限与修改时间列，并增加可用宽度。
- REQ-003：Git 目录 IPC 响应增加只读元数据字段。
- REQ-004：目录元数据获得稳定格式和缺失值展示。

### MODIFIED

- REQ-002：文件夹基础图标从 active marker 改为文件管理 Block 的基础 accent 语义。

## Assumptions

- 用户所说“创建时间”按当前 SFTP 可真实提供且文件管理 Block 已采用的“修改时间”落实。
- 当前请求构成对上述范围和语义修正的明确批准。

## Quality Check

目标、非目标、字段语义、需求与验收闭合；没有阻塞实现的歧义。

## Architecture Boundary Evidence

- `FileEntry` 保持 domain 文件模型；Git command DTO 只筛选目录并投影 nullable 元数据。
- TypeScript 保持独立 Git IPC interface；权限和时间格式化留在 presentation。
- 没有新增 application/domain/infrastructure 规则或依赖反转。

## Verification Evidence

- AC-001、AC-002、AC-004、AC-005：picker 与样式聚焦测试 35 项通过。
- AC-003：`cargo test commands::git::tests --lib`，6 项通过；新增 DTO 投影测试通过。
- AC-001 至 AC-005：`pnpm check` 通过，包括 ESLint、79 个测试文件共 701 项测试、TypeScript 与 Vite 生产构建。
- Rust：目标 `git.rs` 的 rustfmt 检查通过；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- Rust 全量测试共 269 项通过、4 项忽略、4 项失败；失败是未改动的 settings 路径环境断言和真实 Git CRLF 内容断言。本次 command 聚焦集与 Clippy 均通过。
- `git diff --check` 对受影响文件通过，仅有仓库换行转换提示。

## Completion

- 2026-09-01：实现、验证并按标准流程归档。
- 没有模块职责或目录结构变化，无需更新 Directory Map。
- 本次复用既有文件管理视觉规则，不形成新的长期风格偏好。

## Residual Risk

- SFTP 不提供跨平台一致的创建时间，本界面诚实展示现有 `modifiedAt` 为“修改时间”。
- 仓库 Rust 全量检查仍受既有 CRLF/环境相关失败影响；最小复验命令为 `cargo test commands::git::tests --lib`。
