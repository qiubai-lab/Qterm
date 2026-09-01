---
id: QB-20260819-file-browser-download-preview-edit
status: archived
archived: 2026-09-02
legacy: true
---
# File Browser Download, Preview, and Edit Strict Plan

Status: completed on 2026-08-19. 已修复 SFTP 临时文件创建、关闭确认、权限继承与原子替换。

## Background

现有文件窗口只提供只读目录列表；传输模块支持单文件 SFTP 下载，但没有与文件列表整合，也没有目录递归、文件读取或安全覆盖保存能力。

## Requirement

在原文件窗格内交付右键下载、路径直达、类型化预览和文本编辑，并保持本地文件系统与远程 SFTP 行为一致且安全。

## Non-Goals

- 不实现多标签 IDE、非 UTF-8 转码、目标覆盖/目录合并和符号链接递归。

## Architecture Impact

- `commands/files` 只处理 IPC DTO、原生路径选择和错误映射。
- `application/file_service` 拥有预览限制、版本冲突、文本保存和本地递归下载规则。
- SSH infrastructure 扩展读取、写入和目录下载控制，不向上泄漏 `russh-sftp` 类型。
- React `files` feature 拥有浏览/预览瞬时状态；workspace 只继续持久化当前目录。

## Domain Model Impact

- `FileEntry` 从目录布尔值扩展稳定文件类型和修订信息。
- 增加文件内容元数据、修订值和下载进度领域语义。

## API Impact

- 扩展 files IPC：读取文本/二进制、写入文本、选择下载目标、下载条目、取消操作。
- 兼容保留现有目录列表与 transfer API；不修改 Workspace schema。

## Database Impact

- 无数据库或持久化 schema 变化。

## Implementation Tasks

1. 先补领域限制、版本冲突、路径/预览 UI 状态和 IPC 客户端测试。
2. 实现本地文件应用服务与远程 SFTP read/write/download 控制。
3. 加入一次性保存目标授权和递归下载进度/取消。
4. 安装 CodeMirror、Markdown/YAML 依赖，实现路径输入、上下文菜单和同窗格预览编辑。
5. 运行聚焦测试，修复后执行完整前端与 Rust 质量命令。
6. 更新 Directory Map 与本计划状态。

## UX Optimization Tasks

1. 将文件单击行为改为只读预览，并让文件夹继续使用双击打开。
2. 将右键“预览或编辑”拆成“预览”和“编辑（实验）”，图片仅保留预览。
3. 删除 Markdown 预览中的源码切换；实验编辑使用独立工具栏、保存行为和离开确认。
4. 让路径输入复用路径显示槽位，并用固定三列导航布局将刷新按钮锚定到最右侧。
5. 补充行为与样式契约测试，执行聚焦测试和完整质量命令。

## Interaction Polish Tasks

1. 复用工作区标签的透明输入和焦点下划线，消除全局输入焦点样式造成的路径错位。
2. 在路径输入失焦、进入/滚动文件列表、目录加载或其他操作时取消路径编辑。
3. 文件第一次点击仅选中，第二次点击同一文件才预览；键盘 Enter 和右键预览继续提供直接入口。
4. 将下载面板收敛为常驻单行底部状态栏，空闲显示目录统计，传输中显示原位进度条，结束后恢复统计与精简结果。
5. 为上述回归补 Testing Library 和 CSS 契约测试，随后执行聚焦测试、真实页面检查和 `pnpm check`。

## Preview Edit Shortcut

1. 在预览工具栏右侧增加稳定的编辑按钮位置。
2. 文本类型直接复用当前内容切换到实验编辑；图片等不支持编辑的类型保持按钮禁用。
3. 补充可用、禁用和无重复读取行为测试，执行聚焦测试与 `pnpm check`。

## Editor Toolbar Polish

1. 文件内容变化后在名称尾部显示星号，保存成功后清除。
2. 编辑工具栏按“实验功能 / 编辑 / 取消 / 保存”排列；取消直接放弃修改并返回列表。
3. 编辑、取消和保存采用 23px 高图标文字按钮，并补充保存图标。
4. 将 CodeMirror 可编辑光标切换为高对比薄荷色，不影响只读预览。
5. 补充脏状态、取消不写入、图标、顺序和 CSS 契约测试，执行 `pnpm check`。
6. 保存按钮固定显示“保存”和固定宽度；脏状态使用保存图标，已保存状态使用勾选图标。

## Remote Save Repair

1. 将 SFTP 保存从仅以 `WRITE` 打开不存在的临时路径，改为显式 `CREATE | TRUNCATE | WRITE` 创建同目录临时文件。
2. 写入后显式关闭文件句柄并等待服务端确认；写入或关闭失败时删除临时文件并保留原文件。
3. 仅将原文件权限复制到临时文件，避免复制旧大小与时间戳；冲突复检通过后继续使用备份回滚式原子替换。
4. 扩展 ignored 本地 OpenSSH 集成场景，验证保存内容、权限保持、临时文件清理和 revision 冲突。

## Acceptance To Verification

- 右键/键盘下载：RTL 菜单行为、IPC mock 与 Rust 目标授权测试。
- 递归/取消：临时目录 Rust 测试验证树、冲突和清理。
- 路径直达：RTL Enter/Escape/失败保留测试。
- 预览映射：RTL 文本、Markdown、图片、未知/超限测试。
- 安全保存：Rust revision 冲突测试和 RTL 未保存确认测试。

## Test Plan

- 聚焦：`pnpm test -- src/files/FileBrowserPane.test.tsx src/lib/tauri/files.test.ts`。
- 前端：`pnpm check`。
- Rust：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
- 可用时在 Tauri 桌面环境手工检查系统选择器、图片 object URL、CodeMirror 尺寸和 SFTP 保存。

## Rollback Plan

- 前端可移除预览组件和新增 IPC 调用，目录浏览 DTO 保持向后兼容。
- 新增 commands 可独立注销；不改变 Workspace 数据。
- 写入只使用临时文件和显式 revision，回滚不需要数据迁移。

## Risks

- SFTP 服务器对覆盖 rename 的支持不一致；不支持安全替换时必须失败而不是删除原文件。
- 大目录扫描耗时；需要取消、数量边界和持续进度。
- Webview 中编辑器布局和图片 URL 生命周期需要显式清理。

## Documentation Updates

- 更新本 spec、plan 状态与 `docs/qb-spec/DIRECTORY_MAP.md` 的文件服务职责。
