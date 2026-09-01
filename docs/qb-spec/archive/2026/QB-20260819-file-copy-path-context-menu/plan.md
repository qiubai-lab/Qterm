---
id: QB-20260819-file-copy-path-context-menu
status: archived
archived: 2026-09-02
legacy: true
---
## Requirement

文件右键菜单支持复制文件/文件夹路径，并修复底部菜单被固定高度提前限制的问题。

## Scope

修改文件浏览组件、前端测试、Tauri 插件注册和最小能力声明；不改文件服务接口。

## Affected Files

- `src/files/FileBrowserPane.tsx`
- `src/files/FileBrowserPane.test.tsx`
- `src-tauri/src/lib.rs`
- `src-tauri/capabilities/default.json`
- `package.json` / `pnpm-lock.yaml`
- `src-tauri/Cargo.toml` / `src-tauri/Cargo.lock`

## Design

右键时记录原始视口锚点，菜单挂载后测量宽高，再根据可用空间决定向下或向上展开并夹紧坐标。复制动作调用官方插件，只写入文本，并复用现有状态栏反馈。

## Acceptance To Verification

- 路径复制：组件测试 mock 官方插件并验证精确路径。
- 底部定位：组件测试 mock 菜单尺寸与视口，验证最终坐标。
- 权限最小化：配置检查只包含 `allow-write-text`。
- 整体完整性：前后端标准检查命令。

## Test / Verification

1. 先新增复制与底部定位失败测试。
2. 安装并注册插件、配置最小权限。
3. 实现复制动作和运行时测量定位。
4. 运行前端聚焦测试及 `pnpm check`。
5. 运行 Rust fmt、clippy 和测试。

## Documentation Updates

已新增本 task spec 与 plan；无需更新长期项目上下文或 Directory Map。
