---
id: QB-20260819-file-permission-column
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让用户在文件列表中直接识别 SFTP 与 Unix 本地文件的权限，同时避免在不支持 Unix 权限语义的平台展示误导信息。

## Scope

- 目录条目增加可空的 Unix 权限位。
- SFTP 与 Unix 本地目录提取权限；Windows 本地使用缺失态。
- 文件列表新增“权限”列，显示九位 `rwx` 文本，支持 setuid、setgid 和 sticky 位。
- 权限不可用时显示 `—`；窄文件窗口隐藏该列。

## Constraints

- 原始权限位由基础设施提取，领域模型保存可空数值，DTO 只传输，前端负责格式化。
- 不把 Windows ACL 转换为 Unix 权限。
- 不新增依赖，不改变现有排序字段和文件操作行为。

## Non-Goals

- 不编辑权限，不实现 chmod 或 Windows ACL 查看器。
- 权限列本期不参与排序。

## Acceptance

- SFTP 返回的权限位可到达前端且不把缺失权限误显示为 `---------`。
- Unix 本地目录返回权限位，Windows 本地返回缺失态。
- 常规权限和特殊执行位格式化正确。
- 权限列与现有表头、文件行对齐，窄窗口隐藏且不产生错列。

## Acceptance To Verification

- Rust 单元测试验证领域/DTO映射和当前平台本地权限提取。
- 前端组件测试验证权限、特殊位和缺失态显示。
- 样式测试验证四列布局和窄窗口降级规则。
- `pnpm check` 与 Rust fmt/clippy/test 验证整体完整性。

## Open Questions

无。

## Recommended Approach

在 `FileEntry` 中增加 `permission_mode: Option<u32>`。SFTP 保留服务端返回的权限字段，Unix 本地读取 `PermissionsExt::mode()`，其他平台返回 `None`；前端将低十二位格式化为九位权限字符串。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed
