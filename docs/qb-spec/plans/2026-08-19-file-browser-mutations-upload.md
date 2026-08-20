# File Browser Mutations and Drop Upload Strict Plan

Status: completed on 2026-08-19. 已交付创建、复制、改名、二次确认删除与原生拖放递归上传。

## Create Entry Extension

1. 在刷新按钮左侧增加创建文件/文件夹的稳定图标按钮和 hover 提示。
2. 扩展现有命名弹窗状态，创建空文件或目录并显示后端校验错误。
3. 新增统一 create IPC，本地 application 使用 `create_new`/`create_dir`，SFTP adapter 使用 `create`/`create_dir`，均拒绝覆盖。
4. 补充前端按钮顺序、弹窗、IPC 和本地/SFTP 回归覆盖，并执行完整质量门禁。

## Background

现有文件窗口只有读取、保存和下载能力；上传仅支持系统选择器选择单个文件，且文件列表没有复制、改名和删除命令。

## Requirement

增加安全的同目录文件复制、条目改名、二次确认删除，以及原生拖入多文件/目录的递归 SFTP 上传。

## Non-Goals

- 不增加剪贴板粘贴、跨目录移动、覆盖合并、本地窗口拖入复制或完整传输队列。

## Architecture Impact

- domain/application 负责安全名称、递归边界和本地 mutation 规则。
- commands/files 暴露 mutation DTO；commands/transfer 保持本地 drop 路径的一次性授权。
- SSH infrastructure 实现远程 mutation 与聚合递归上传，不向 UI 泄漏 SFTP 类型。
- React 文件 feature 只编排菜单、弹窗、遮罩和状态刷新。

## Domain Model Impact

- 增加文件操作类型与安全目标名称规则；不改变持久化模型。

## API Impact

- 新增 copy、rename、delete IPC 和 dropped entries upload IPC；扩展传输请求为多入口递归上传。

## Database Impact

- 无。

## Implementation Tasks

1. 先补 IPC 客户端、文件窗格菜单/弹窗/拖放状态以及路径授权测试。
2. 实现本地复制、改名、递归删除和稳定错误映射。
3. 扩展 SSH 控制面实现远程复制、改名、递归删除。
4. 在 Rust 组合根记录原生 drop 路径授权，扩展聚合递归 SFTP 上传与取消清理。
5. 实现紧凑命名/删除弹窗、右键菜单分组、上传遮罩和底部聚合状态。
6. 更新 OpenSSH 集成场景与规格状态，执行完整质量门禁。

## Acceptance To Verification

- 复制/改名/删除：前端行为测试、local tempdir Rust 测试、ignored OpenSSH 集成。
- 删除确认与可访问性：Testing Library 验证取消、确认、Escape 和按钮语义。
- 拖放遮罩：模拟 Tauri drag event 验证区域命中、路径文案与清理。
- 上传与安全：TransferState 一次性授权、目录扫描边界、聚合传输事件和 ignored OpenSSH 场景。

## Test Plan

- `pnpm test -- src/files/FileBrowserPane.test.tsx src/lib/tauri/files.test.ts src/lib/tauri/transfers.test.ts src/app/appStyles.test.ts`
- `pnpm check`
- `cargo fmt --check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test --all-targets --all-features`

## Rollback Plan

- 注销新增 commands 并移除文件窗格入口；既有读取、保存和下载 API 不变，无数据迁移。

## Risks

- 递归删除不可恢复，必须保持显式确认、链接不跟随和严格边界。
- 多入口上传发生中途失败时可能产生部分目录，必须跟踪本次创建的根并尽力清理。
- 原生 drag 坐标为物理像素，前端命中测试需结合 devicePixelRatio 转换。

## Documentation Updates

- 更新本 spec 与 plan；Directory Map 不需要变化。
