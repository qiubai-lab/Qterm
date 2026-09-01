---
id: QB-20260902-unified-git-directory-picker
type: feature
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# 统一 Git 本机与远程目录选择体验

## Goal

让 Git Block 在选择本机或 SSH 仓库目录时使用同一套 Qterm 应用内目录选择界面，同时保留本机系统目录选择器作为能力兜底，并保持远程 Git session 的既有隔离边界。

## Scope

- 将现有 Git 远程仓库目录选择器扩展为本机与远程两种数据源。
- 本机模式复用既有本地目录 listing 与磁盘根目录 API，仅展示可选择的目录。
- 本机模式提供显式系统选择器入口，以覆盖系统搜索、收藏位置、网络位置和新建文件夹能力。
- 保留目录选择、路径编辑、前进/上级、刷新、虚拟列表、键盘与取消语义。
- 更新相邻组件、调用链和自动化测试。

## Non-Goals

- 不复用完整 `FileBrowserPane`，不在选择器中增加预览、编辑、传输、删除或上下文菜单。
- 不改变 Git target、最近仓库、snapshot、初始化或 SSH 认证生命周期。
- 不让远程 Git 通过 Files-purpose session 浏览目录。
- 不移除非阻塞原生目录命令；它继续作为本机模式兜底。

## Assumptions And Constraints

- 用户已明确采纳“统一选择器外壳 + 本机/远程数据适配器 + 系统选择器兜底”方案。
- UI 遵守 Qterm 紧凑暗色工作台、文件浏览行选择语义和 `DialogFrame` 焦点管理。
- 本机目录 listing 返回规范化路径；Windows 驱动器根目录必须可发现且不能通过普通父路径越界。
- 远程手工路径在 SFTP 不可用时仍可确认；本机手工路径必须成功读取后才作为当前可选目录。

## Requirements

- REQ-001：Git Block 的“浏览其他目录”对本机和已连接远程目标必须打开同一个应用内 Git 目录选择器视觉与交互外壳。
- REQ-002：本机模式必须使用既有本地目录 API 浏览目录、只展示目录，并支持 Windows 驱动器根目录或非 Windows `/` 根目录入口。
- REQ-003：本机模式必须保留显式“使用系统选择器”操作；系统选择取消时不得改变 target，成功选择时只提交一次目标变更。
- REQ-004：远程模式必须继续使用 Git-purpose directory IPC，并保留 profile ownership、connected session、手工路径降级和只读能力边界。
- REQ-005：两种模式必须共享选择、双击/Enter 打开、路径编辑、上级、前进、刷新、加载、空态、错误、取消和确认交互；文案与元数据列可按数据源调整。
- REQ-006：本机磁盘根目录、路径不可访问、陈旧异步响应、长目录列表和对话框关闭不得产生错误 target 变更或破坏现有 Git snapshot。
- REQ-007：选择器不得获得文件读取、写入、传输、删除或远程 Files session 能力；原生文件对话框继续通过非阻塞 bridge 调用。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-005]：本机与远程入口渲染同一选择器组件，标题、路径标签、列表 aria 名称和反馈按模式正确变化。
- AC-002 [REQ-002, REQ-005, REQ-006]：本机模式能读取目录、过滤文件、选择或打开子目录，并能从驱动器根目录进入统一根目录列表后选择其他根。
- AC-003 [REQ-003, REQ-006]：本机系统选择器成功返回时提交所选路径；取消返回 `null` 时保留弹窗和当前 target。
- AC-004 [REQ-004, REQ-007]：远程模式继续只调用 `listRemoteGitDirectory(sessionId, profileId, path)`，浏览失败时仍可确认合法手工路径。
- AC-005 [REQ-005, REQ-006]：两种模式的取消、明确确认、键盘打开、过期响应丢弃与大列表有界渲染均有自动化保护。
- AC-006 [REQ-001, REQ-003, REQ-004]：LayoutView 对本机打开、远程连接后打开、选择确认和系统选择取消均保持一次性 target 生命周期。

## Behavior Delta

### ADDED

- REQ-002：新增应用内本机目录浏览和本机根目录切换能力。
- REQ-003：新增统一选择器中的系统目录选择兜底入口。

### MODIFIED

- REQ-001：本机从直接打开系统目录选择器改为优先打开与远程一致的 Qterm 目录选择弹窗。
- REQ-005：原远程专用交互扩展为本机/远程共用交互外壳。

## Options Considered

- 推荐并采用：扩展 feature-local Git 选择器，以数据源适配区分本机和远程；范围小，能保留 Git session 边界。
- 未采用：直接复用完整 `FileBrowserPane`；其编辑、传输、变更操作和状态体量超出单一目录选择任务。
- 未采用：完全移除系统选择器；会损失系统搜索、收藏位置、网络位置和新建文件夹能力。

## Quality Check

- REQ 与 AC 已闭合；正常、取消、失败、根目录、异步竞态和大列表场景均有可观察验收。
- 不涉及公共 API、schema、认证或权限模型变化，standard tier 足够。
- 当前没有阻塞实现的开放问题。

## Verification Evidence

- AC-001 至 AC-006：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/workspace/LayoutView.test.tsx`，54 项通过。
- 静态检查：`pnpm lint` 通过。
- 类型与生产构建：`pnpm build` 通过；Vite 仅报告既有大 chunk 提示。
- 边界审计：Git 选择器未调用 `listRemoteDirectory`；commands 中无 `blocking_(pick|save)`。
- `pnpm check` 的 lint 通过，完整测试 711 项中 710 项通过；唯一失败来自工作树中既有 `connectionDialog.css` 将连接行列宽改为 `13px`，而 `appStyles.test.ts` 仍断言 `5px`，不在本 change 范围。生产构建已单独通过。
- `git diff --check` 未发现 whitespace error；仅报告工作树现有 LF/CRLF 转换警告。

## Residual Risk

- 未在真实 macOS/Linux/Windows Tauri 窗口逐平台点击系统选择器；非阻塞 bridge 未修改，组件与调用链已有自动化覆盖。
- 仓库完整 `pnpm check` 仍受上述无关连接样式断言阻塞。

## Completion

- 2026-09-02：实现与 standard-tier 验证完成，普通归档。
