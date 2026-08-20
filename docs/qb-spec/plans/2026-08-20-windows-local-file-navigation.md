# Windows Local File Navigation Plan

## Requirement

修复 Windows 本地文件窗格的默认目录、盘符根导航和扩展路径展示问题；让盘符沿用普通文件夹列表，并隔离本机与远程目标的异步路径更新。

## Scope

- 实现 `~` 主目录解析、兼容 canonical path 和 Windows 逻辑盘符枚举。
- 增加前端本机位置 DTO、路径展示/父级工具与盘符列表状态，盘符映射为标准目录行。
- 更新右侧文件入口、本机连接切换、文件窗格样式与自动化测试。
- 为文件路径 action 增加目标 profile 身份校验，并在目标切换时重新挂载文件浏览器；本地目标重置为 `~`，远程目标重置为 `.`。
- 不修改 workspace schema，不增加卷标/容量，不改远程路径协议。

## Affected Files

- `src-tauri/Cargo.toml`、`src-tauri/Cargo.lock`
- `src-tauri/src/commands/files.rs`、`src-tauri/src/lib.rs`
- `src/lib/tauri/files.ts` 及测试
- `src/files/path.ts`、`FileBrowserPane.tsx` 及测试
- `src/workspace/fileWindow.ts`、`WorkspaceProvider.tsx`、`LayoutView.tsx`、`reducer.ts` 及测试
- `src/app/app.css`、`appStyles.test.ts`

## Design

- 后端文件系统边界解析 `~`，使用 `dunce` 仅在安全时去除 Windows verbatim disk 前缀。
- `files_list_local_roots` 返回只读路径 DTO；Windows 使用 `GetLogicalDrives`，其他平台返回 `/`。
- 前端 `path.ts` 分离真实路径、展示路径、根目录判断和父级计算。
- `FileBrowserPane` 的虚拟根目录把盘符转换为只读 `FileEntry`，直接复用默认列头与 `FileRow`；双击或 Enter 后调用现有目录列表 IPC，不提供右键修改动作。
- `setFilesPath` action 携带触发请求时的 profile 身份；reducer 只在该身份仍等于当前文件叶节点 profile 时写入路径。
- `FileBrowserPane` 以 profile 身份作为 React key，目标切换时卸载旧实例并使未完成请求失效。
- SFTP 不依赖 shell 的 `~` 展开；远程目标从 `.` 读取，既有 SFTP `canonicalize` 将 listing path 返回为绝对 home，并由浏览器写回 workspace。

## Acceptance To Verification

- 默认主目录：workspace action/provider 单测 + Rust 路径解析单测。
- 盘符浏览：Tauri wrapper 单测 + FileBrowserPane 组件测试 + Windows Rust 测试。
- 路径展示与长路径安全：纯函数单测 + Rust `dunce` canonicalize 测试。
- 目标隔离与远程 home：reducer 拒绝过期本地路径测试 + provider 断言本地为 `~`、远程为 `.` + FileBrowserPane 断言 canonical 绝对 home 写回。
- 无回归：聚焦 Vitest、`pnpm check`、Cargo fmt/clippy/test。

## Test / Verification

1. 先增加 Windows prefix、盘符普通目录行和跨目标旧请求的失败回归测试。
2. 运行聚焦 Vitest：files wrapper、file window、WorkspaceProvider、FileBrowserPane、style contract。
3. 运行聚焦 Rust command tests。
4. 运行 `pnpm check`。
5. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。

## Documentation Updates

- 新增本 task spec 与 plan。
- Directory Map 不需要更新；现有目录和职责边界未变化。
