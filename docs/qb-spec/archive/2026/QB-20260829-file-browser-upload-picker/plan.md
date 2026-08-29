---
id: QB-20260829-file-browser-upload-picker
type: feature
tier: strict
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# File Browser Upload Picker Plan

## Background

实施 `QB-20260829-file-browser-upload-picker`：在远程 Files 导航栏增加显式上传按钮，通过“上传文件…”与“上传文件夹…”分别打开非阻塞系统选择器，把用户明确选择的本机根条目作为一个聚合任务上传到打开选择器时的远程目录。现有拖放 `UploadEntries`、递归扫描、进度、取消和拒绝覆盖能力继续作为传输基础。

## Requirement

- 实施 REQ-001 至 REQ-009，以 AC-001 至 AC-008 为完成条件。
- 保持本机路径 trust boundary：WebView 只能回传本次系统选择器已经登记的精确路径集合；授权不可伪造、替换或重复消费。
- 保持 Qterm Files 紧凑工具栏、persistent action、现有 `upload` 图标、主题 token、focus-visible 和窄窗口收缩契约。

## Non-Goals

- 不实现混合文件/目录原生面板、自建本机文件选择器、上传队列、并发任务中心、覆盖/合并、断点续传或远端目标二次选择。
- 不改变本地 Files、原生拖放上传、单文件 Transfer Dialog、下载或现有 SFTP 传输语义。
- 不新增依赖、capability、持久化 schema、Workspace 状态或长期 UI context。

## Architecture Impact

- `FileBrowserPane` 继续拥有导航栏、选择菜单、目标目录快照、Files 状态栏与完成后条件刷新；不读取本机文件或实现 SFTP。
- `src/lib/tauri/transfers.ts` 新增窄的文件/文件夹选择与 selected-entry upload IPC wrapper；现有 dropped-entry wrapper 保持兼容。
- `commands::native_dialog` 增加异步多文件 callback bridge；单目录继续复用现有 `pick_folder`，禁止任何 blocking picker。
- `commands::transfer::TransferState` 新增与单文件选择、原生 drop 分离的 selected-entry 一次性授权槽；selection command 登记精确有序 `PathBuf` 集合，upload command 原子消费并验证后才构造现有 `TransferRequest::UploadEntries`。
- `src-tauri/src/lib.rs` 只注册新增窄 commands；SSH manager、domain transfer 与 infrastructure SFTP 请求形态无需变化。

## Domain Model Impact

- 无稳定 domain 类型变化；现有 `RemotePath`、`TransferEvent`、`TransferRequest::UploadEntries` 和扫描边界继续作为事实源。
- 系统选择授权属于 command/runtime 瞬时状态，不进入 domain、持久化或前端长期状态。

## API Impact

- 新增系统选择 IPC：多文件选择返回有序本机路径数组，单文件夹选择返回零或一个路径；取消返回空选择并且不登记授权。
- 新增 selected entries 上传 IPC：请求只含 Files session ID、选择器返回的本机路径数组和远端目录，事件继续使用现有 `TransferEventDto` Channel。
- 现有 `transfer_select_upload_file` / `transfer_upload` 与 `transfer_upload_dropped` 保持兼容；新授权槽不能被这些入口消费或覆盖。

## Database Impact

- 无数据库、设置、Workspace 或磁盘 schema 变化。
- 新选择授权只存在内存中，被下一次匹配上传原子消费或被后续选择替换；进程退出自然清除。

## Implementation Tasks

- [x] TASK-001 [REQ-003, REQ-004] [AC-003, AC-004]：先扩展 Rust 聚焦测试，定义多文件/单目录非阻塞选择结果、空/重复/超限集合拒绝、精确集合一次消费、篡改/重放/替换失败及授权槽隔离。
- [x] TASK-002 [depends: TASK-001] [REQ-003, REQ-004, REQ-005, REQ-007, REQ-009] [AC-003, AC-004, AC-005, AC-007, AC-008]：实现 `native_dialog` 多文件 bridge、transfer selection/upload commands、一次性 selected-entry 授权与 composition registration；复用 `UploadEntries`，保持 drop/单文件授权兼容。
- [x] TASK-003 [P] [REQ-003, REQ-005, REQ-009] [AC-003, AC-005, AC-008]：更新 TypeScript transfer adapter 与 IPC 测试，覆盖两个选择入口、取消形态、selected-entry request/Channel，并证明原有 API payload 未变化。
- [x] TASK-004 [depends: TASK-002, TASK-003] [REQ-001, REQ-002, REQ-005, REQ-006, REQ-007, REQ-008, REQ-009] [AC-001, AC-002, AC-005, AC-006, AC-007, AC-008]：先扩展 `FileBrowserPane` 测试，再实现上传图标、锚定菜单、键盘/焦点/外部关闭、选择期间与活动传输禁用、目标目录快照、进度/取消复用和仅当前目标目录条件刷新。
- [x] TASK-005 [depends: TASK-004] [REQ-001, REQ-002, REQ-008] [AC-001, AC-002, AC-008]：最小调整 Files 导航栏 grid 与 feature-local 菜单样式，复用现有 token/context-menu视觉，补窄窗口、focus、persistent action 和无新增 motion 的样式契约。
- [x] TASK-006 [depends: TASK-001 至 TASK-005] [REQ-001 至 REQ-009] [AC-001 至 AC-008]：执行聚焦与 strict 门禁，记录环境依赖的 OpenSSH/SFTP smoke 状态；若无结构职责变化则不修改 Directory Map，完成后由 verification 流程归档。

## Dependencies And Parallel Work

- 项目已锁定的 `tauri-plugin-dialog` 提供 `pick_files` 与 `pick_folder` callback API；两者必须经现有 oneshot bridge 转为 async command。
- TASK-003 可在 Rust command 名称/DTO 确认后与 TASK-001/002 的后端实现并行；当前执行不启用多 Agent。
- `TransferRequest::UploadEntries`、扫描限制与远端冲突语义已经存在，不新增 SSH/domain 依赖。

## Acceptance To Verification

- VER-001 [AC-001, AC-002]：`FileBrowserPane.test.tsx` 覆盖远程/本地/未连接/活动传输下的按钮状态，菜单鼠标与键盘打开、顺序、关闭、焦点恢复及边界定位；`appStyles.test.ts` 覆盖稳定 grid 与窄窗口收缩。
- VER-002 [AC-003]：TS adapter 与 Rust native dialog tests 覆盖多文件、单目录、取消和 callback bridge；`rg 'blocking_(pick|save)' src-tauri/src/commands` 必须无匹配。
- VER-003 [AC-004]：Rust `TransferState`/command 测试覆盖空、重复、256/257、精确匹配、篡改、替换、重放和不同授权槽隔离，失败时不启动 manager transfer。
- VER-004 [AC-005]：前端测试验证目标为打开选择器时的路径且只启动一个任务；Rust 请求测试与现有 transfer scan/integration 回归证明使用 `UploadEntries` 并保留根名、symlink/深度/条目限制、拒绝覆盖与 purpose 隔离。
- VER-005 [AC-006, AC-007]：组件测试覆盖扫描/进度/取消/完成/失败，仍在目标目录时刷新、已导航时不刷新/不回跳，取消选择不产生状态，失败保持列表与重试能力。
- VER-006 [AC-008]：Files/TransferDialog/drag-drop/下载/创建/预览编辑回归、`pnpm check`、Rust fmt/clippy/test、`git diff --check` 通过；capabilities 与依赖清单无变化。

## Test Plan

1. `pnpm exec vitest run src/lib/tauri/transfers.test.ts src/files/FileBrowserPane.test.tsx src/app/appStyles.test.ts --maxWorkers=1`
2. 在 `src-tauri/` 运行 `cargo test commands::transfer --all-targets --all-features`。
3. 在 `src-tauri/` 运行 `cargo test commands::native_dialog --all-targets --all-features`。
4. `rg 'blocking_(pick|save)' src-tauri/src/commands` 必须无匹配。
5. `pnpm check`。
6. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`。
7. `git diff --check`。
8. 在可用 Unix OpenSSH/SFTP fixture 上运行现有 ignored transfer integration；环境不可用时记录具体限制和复验命令，不伪报通过。

## Rollback Plan

- 删除新增 Files 上传按钮/菜单、selected-entry TS adapter 与 command registration，并移除 `TransferState` 的 selected-entry 授权槽，即可恢复仅拖放与 Transfer Dialog 上传。
- 无 schema、持久化数据或远端迁移需要回滚；已经完成的正常文件上传与现有人工上传语义一致，不做自动删除。
- 回滚不得改动既有 dropped-path 或单文件选择授权，避免破坏现有入口。

## Risks

- 原生面板等待期间 Files runtime 可能断开或用户路径状态失效；目标目录必须快照，上传仍由 session manager 拒绝失效 session，完成事件不得回跳目录。
- selected-entry 授权若与 drop/single-file 槽混用，会产生跨入口替换或重放；使用独立槽并以原子 take 比较保护。
- 路径数组顺序、重复和 256 根边界必须在登记与消费两侧一致，否则可能产生授权集合与实际 request 不同。
- `FileBrowserPane` 当前只有一个传输状态槽；新按钮在选择或活动传输时禁用，避免覆盖当前进度/取消 ID，但不在本 change 中重写既有 drop 并发行为。
- 工具栏增加一列会压缩长路径；保持 `minmax(0, 1fr)` 并用样式测试保护最短支持宽度。

## Documentation Updates

- 实施不新增目录、不移动模块且不改变既有职责，预期无需更新 `docs/qb-spec/DIRECTORY_MAP.md`；若实现被迫改变 ownership，再触发目录图更新。
- 不自动修改长期 UI/engineering context；按钮/菜单遵循当前 Qterm UI skill 与现有 Files 视觉约束。

## Style Context

- `qterm-ui-spec.md`：核心 icon action 持久可见、约 25px、具备 `aria-label`/title/focus-visible；文件控制留在 block header；复用现有语义 token，路径区域继续 `min-width: 0`；原生面板必须使用非阻塞 bridge。
- 仓库 Directory Map：`src/files` 负责编排，`src/lib/tauri` 维持窄 IPC，commands 处理 DTO/授权，SSH infrastructure 执行 SFTP；本计划不跨越这些职责。

## Trigger Signals

- Architecture boundary：是；新增本机路径授权和 command/SSH 请求衔接，实施前运行 focused architecture check。
- Critical behavior protection：是；本机路径授权、重放拒绝、远端拒绝覆盖和导航竞争需要先有聚焦回归。
- Directory Map：预计否；只有实际 ownership/结构变化时更新。

## Verification Result

- VER-001、VER-005：Files/adapter/style 聚焦 Vitest 103 项通过；按钮、菜单、焦点、取消、目标快照、导航竞争、状态栏和布局均有自动化证据。
- VER-002、VER-003：native dialog 非阻塞审计与 Rust 授权集合测试通过；选择授权精确、独立、一次性，篡改、替换、重放、空、重复和超限均被拒绝。
- VER-004：selected upload 复用既有 `UploadEntries`；Rust 全量 transfer/scan/session 回归通过。真实 Unix OpenSSH/SFTP fixture 在当前 Windows 环境保持 ignored，未伪报执行。
- VER-006：`pnpm check` 通过（60 files / 532 tests + ESLint + TypeScript + Vite build）；`cargo fmt --check`、strict Clippy、Rust 全量测试通过（211 passed / 3 ignored）；`git diff --check` 通过。capabilities、依赖和持久化未变化。
- Directory Map：无目录、入口 ownership 或模块职责变化，不更新。
- Durable Preference：本次采用既有 Qterm UI 规范的局部工具栏入口，没有形成新的跨任务风格偏好。

## Next Action

实现、strict 验证与普通归档路径均已完成。
