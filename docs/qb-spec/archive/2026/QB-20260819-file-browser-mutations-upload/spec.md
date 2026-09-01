---
id: QB-20260819-file-browser-mutations-upload
status: archived
archived: 2026-09-02
legacy: true
---
# File Browser Mutations and Drop Upload

## Goal

用户能够直接在文件窗口中复制、改名和安全删除条目，并将系统文件或文件夹拖入已连接的远程文件窗口上传到当前目录。

## Scope

- 普通文件右键菜单提供“复制文件…”，以用户输入的新名称在同目录创建副本。
- 文件、文件夹和符号链接提供“改名…”；目标名称必须是单个安全路径段且不得覆盖现有条目。
- 文件、文件夹和符号链接提供“删除”；删除前使用紧凑确认弹窗明确对象与不可恢复性，文件夹递归删除，符号链接仅删除链接本身。
- 已连接的 SFTP 文件窗口监听 Tauri 原生文件拖放；指针位于文件内容区时显示遮罩，说明将上传到当前远程目录。
- 一次拖入可包含多个本地文件或目录；目录递归上传但不跟随符号链接，不覆盖远端同名根条目，并复用底部传输进度与取消入口。
- 操作成功后刷新当前目录并保留明确的精简状态；失败时保留当前列表并显示错误。
- 文件窗口导航栏在刷新按钮左侧固定提供“创建文件”和“创建文件夹”图标按钮；按钮不显示常驻文本，通过可访问名称和 hover 提示说明用途。
- 创建操作复用紧凑命名弹窗，在本地或当前 SFTP 目录创建空文件/文件夹，并拒绝非法名称和覆盖。

## Constraints

- 本地路径必须来自 Tauri 原生 drop 事件并由 Rust 侧一次性授权，不能只信任 WebView 传入的字符串。
- 远程复制、改名、删除和上传通过 SFTP adapter 完成；commands 只负责 DTO、校验入口和错误映射。
- 递归操作最多 100,000 个条目、128 层，不跟随符号链接。
- 所有复制、改名和上传操作拒绝覆盖现有目标。

## Non-Goals

- 不实现复制/粘贴剪贴板、多选批量文件管理、跨目录移动、覆盖/合并策略和上传队列管理器。
- 本轮不为本地文件窗口提供系统拖入复制；“上传”仅作用于已连接 SFTP 文件窗口。

## Acceptance

1. 普通文件右键菜单可打开复制命名弹窗，合法且不冲突的名称会创建内容一致的同目录副本；文件夹和链接不显示该操作。
2. 文件、文件夹和链接均可改名；空名称、路径穿越和同名冲突被拒绝且列表不丢失。
3. 删除必须经过二次确认；取消不产生写操作，确认后文件或目录消失，删除链接不会影响链接目标。
4. 外部文件进入远程文件内容区时显示包含当前路径的上传遮罩，离开、取消或落下后遮罩消失；其他区域不接受上传。
5. 多文件和目录拖入后递归上传到当前目录，显示聚合进度并支持取消；符号链接跳过，目标冲突时不覆盖。
6. WebView 伪造的未授权本地路径不能启动上传；每次 drop 授权只能消费一次。
7. 鼠标与键盘右键菜单、命名弹窗焦点、Escape、删除确认以及失败提示均可访问。
8. 前后端相关行为、边界和失败路径具有自动化保护，完整质量命令通过。
9. 两个创建按钮位于刷新按钮左侧、仅显示图标且 hover 可见用途；创建成功刷新当前目录，取消或失败不改变目录内容。

## Acceptance To Verification

- 1、2、3、4、5、7：`FileBrowserPane.test.tsx` 行为测试和 `appStyles.test.ts` 样式契约。
- 1、2、3：Rust 本地文件服务测试与 ignored OpenSSH SFTP 集成场景。
- 5、6：TransferState 授权测试、递归扫描测试与 ignored OpenSSH 上传集成场景。
- 8：`pnpm check`、Rust fmt、Clippy、全量测试。
- 9：`FileBrowserPane.test.tsx`、IPC 客户端测试、本地 tempdir Rust 测试与 ignored OpenSSH 集成场景。

## Open Questions

- 无阻塞问题；首期采用显式副本名称、拒绝覆盖和远程窗口上传的保守语义。

## Recommended Approach

采用独立文件 mutation IPC 与复用 transfer 通道的递归上传方案。相比在前端模拟复制或逐文件启动多个传输，该方案能集中执行路径校验、冲突和取消规则，并保持一个聚合进度状态；相比直接信任 WebView drop 路径，Rust 窗口事件的一次性授权保留现有本地路径安全边界。

## Next Skills

- `writing-qb-plans`（Strict：新增 IPC、递归删除和本地路径授权）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `qterm-interface-design`
- `verifying-before-completion`
- Directory Map: not needed（不新增目录或改变现有模块职责）
