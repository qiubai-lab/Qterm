## Requirement

文件窗口增加权限信息列，在支持 Unix 权限的来源显示 `rwx`，其他来源明确显示缺失态。

## Scope

修改文件条目领域模型、两类目录适配、Tauri DTO、前端类型、文件列表和相邻测试；不实现权限编辑或架构重构。

## Affected Files

- `src-tauri/src/domain/files.rs`
- `src-tauri/src/commands/files.rs`
- `src-tauri/src/infrastructure/ssh/client.rs`
- `src/lib/tauri/files.ts`
- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src/app/app.css`
- `src/app/appStyles.test.ts`

## Design

使用可空数值保持模型与展示分离。适配层提取原始模式位；前端格式化九位权限字符。列表采用四列网格，权限列使用等宽字体；容器较窄时表头和行同时隐藏权限列并恢复三列布局。

## Acceptance To Verification

- 权限数据贯通：Rust 模型、DTO 与目录读取测试。
- 权限显示和特殊位：FileBrowserPane 行为测试。
- 缺失态与窄窗口：组件及样式测试。
- 基础完整性：前后端完整检查命令。

## Test / Verification

1. 先新增前端权限显示测试并确认实现前失败。
2. 实现领域字段、适配器提取、DTO 传输及前端展示。
3. 运行前端聚焦测试。
4. 运行 `pnpm check`。
5. 在 `src-tauri` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Documentation Updates

本 task spec 与 plan 已记录；无需更新长期项目上下文或 Directory Map。
