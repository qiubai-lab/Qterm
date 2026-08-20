# Windows Local File Navigation Plan

## Requirement

修复 Windows 本地文件窗格的默认目录、盘符根导航和扩展路径展示问题，同时保持真实路径可操作与远程 SFTP 行为不变。

## Scope

- 实现 `~` 主目录解析、兼容 canonical path 和 Windows 逻辑盘符枚举。
- 增加前端本机位置 DTO、路径展示/父级工具与盘符列表状态。
- 更新右侧文件入口、本机连接切换、文件窗格样式与自动化测试。
- 不修改 workspace schema，不增加卷标/容量，不改远程路径协议。

## Affected Files

- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
- `src-tauri/src/commands/files.rs`、`src-tauri/src/lib.rs`
- `src/lib/tauri/files.ts` 及测试
- `src/files/path.ts`、`FileBrowserPane.tsx` 及测试
- `src/workspace/fileWindow.ts`、`WorkspaceProvider.tsx` 及测试
- `src/app/app.css`、`appStyles.test.ts`

## Design

- 后端文件系统边界解析 `~`，使用 `dunce` 仅在安全时去除 Windows verbatim disk 前缀。
- `files_list_local_roots` 返回只读路径 DTO；Windows 使用 `GetLogicalDrives`，其他平台返回 `/`。
- 前端 `path.ts` 分离真实路径、展示路径、根目录判断和父级计算。
- `FileBrowserPane` 的“本机”视图复用紧凑列表视觉语言，但不伪装成可写目录；选择盘符后再调用现有目录列表 IPC。

## Acceptance To Verification

- 默认主目录：workspace action/provider 单测 + Rust 路径解析单测。
- 盘符浏览：Tauri wrapper 单测 + FileBrowserPane 组件测试 + Windows Rust 测试。
- 路径展示与长路径安全：纯函数单测 + Rust `dunce` canonicalize 测试。
- 无回归：聚焦 Vitest、`pnpm check`、Cargo fmt/clippy/test。

## Test / Verification

1. 先增加 Windows prefix、根目录和“本机”交互的失败回归测试。
2. 运行聚焦 Vitest：files wrapper、file window、WorkspaceProvider、FileBrowserPane、style contract。
3. 运行聚焦 Rust command tests。
4. 运行 `pnpm check`。
5. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Documentation Updates

- 新增本 task spec 与 plan。
- Directory Map 不需要更新；现有目录和职责边界未变化。
