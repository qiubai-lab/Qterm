---
id: QB-20260829-terminal-staging-paste
type: feature
tier: strict
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes:
  - QB-20260829-remote-cli-image-paste
---

# Remote Terminal Clipboard Staging Paste Plan

## Background

实施 `QB-20260829-terminal-staging-paste`，把当前图片专用 request/response 上传替换为原生 clipboard payload + 可取消流式远端暂存任务。现有 SFTP Transfer 已具备扫描、64 KiB 复制、进度和取消基础；本次复用其内部复制原语，但保持 Terminal 暂存的私有远端目录、路径返回与 session-close 清理策略独立于人工文件传输授权。

## Requirement

- 实施 REQ-001 至 REQ-010，以 AC-001 至 AC-010 为完成条件。
- 保持架构 trust boundary：WebView 只看到文本、opaque task ID、无敏感进度与远端路径；native clipboard file list 和本机文件字节只在 Rust 内部。
- 保持 Qterm UI semantic tokens、固定几何、终端内容主层级、键盘焦点、ARIA 与 reduced-motion 契约。

## Non-Goals

- 不重构应用级全局传输中心，不统一 Files/TransferDialog 的状态 UI。
- 不开放通用 `uploadLocalPath`、任意远端根、任意 clipboard MIME 或 PTY/Base64 fallback。
- 不增加设置项、Workspace persistence、schema 或远端配额探测。

## Architecture Impact

- 用通用 `terminal_staging` domain/port/application 契约替换图片专用 `clipboard_image` 契约；domain 表达 clipboard payload 选择、无敏感事件、终态与安全扩展名，application 编排读取后启动远端 store。
- native clipboard adapter 直接使用已锁定版本的 arboard file-list/text/image 能力，在 blocking worker 内按 domain 优先级选取 payload；原始 RGBA 用 PNG encoder 写入私有本机临时文件，不生成无界 PNG Vec。
- `SshSessionManager` 提供 Terminal-only staging store：接收 Rust 内部授权的本机 source entries、产生进度事件、返回 opaque task ID、使用现有取消登记并在完成事件中只给远端路径。
- SSH transfer infrastructure 复用有界 copy/aggregate primitives，新增安全本机扫描、通用远端暂存条目、递归失败清理和 session close 清理；人工 TransferRequest/TransferEvent 公共语义保持不变。
- Tauri command 使用 Channel 桥接 staging events；请求只含 session ID，取消只含 session/task ID。
- 前端用固定 `TerminalStagingStatus` feature-local component 替换 transient paste operation；TerminalPanel 继续拥有 input scheduler 和最终 paste。

## Domain Model Impact

- 新增 `ClipboardPayloadKind`/选择规则：file list > non-empty text > raw image > empty。
- 新增 `TerminalStagingEvent`：preparing、scanning、started、progress、completed(paths)、cancelled、failed；completed/cancelled/failed 为互斥终态。
- 新增内部 `StagingSourceEntry`：本机 PathBuf、原始显示名、受限 extension、file/directory 与完成后本机清理标记；该模型不进入 IPC。
- 移除图片边长、像素数量和 PNG 字节固定常量；保留非零尺寸、checked RGBA length、文件/目录/符号链接与条目深度边界。

## API Impact

- 用 `session_start_clipboard_staging(sessionId, onEvent)` 替换 `session_paste_clipboard_image`。返回 tagged DTO：empty、text 或 transfer(taskId)；只有 text 分支携带剪贴板文本。
- 新增 `session_cancel_clipboard_staging(sessionId, taskId)`；前端不能指定 source path、remote root、name、mode、size 或 bytes。
- staging event completed 只携带远端绝对路径数组；进度只携带数量、transferred/total 与安全 display name，不携带本机路径。
- 删除旧图片尺寸 DTO 与图片专用错误码的前端依赖；稳定 clipboard/temporary/SFTP/upload 错误继续映射。

## Database Impact

- 无数据库、Workspace、settings 或 persistence schema 变化。
- 任务、授权 source、远端目录与本机临时 PNG 只存在于当前进程/session 生命周期。

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, REQ-003] [AC-001, AC-002, AC-003]：先新增 domain/port/application 测试，覆盖 payload 优先级、无旧图片上限、checked RGBA、一次性本机 source 与 IPC 无路径/字节。
- [x] TASK-002 [P] [depends: TASK-001] [REQ-001, REQ-002, REQ-003] [AC-001, AC-002, AC-003]：实现 arboard native clipboard snapshot/file-list adapter和磁盘 PNG spool；普通文件不读入内存，本机临时文件在所有终态清理。
- [x] TASK-003 [P] [depends: TASK-001] [REQ-004, REQ-005, REQ-006] [AC-004, AC-005, AC-006]：扩展 Terminal-only SSH staging store，复用有界复制，增加递归本机扫描、随机安全远端名称、进度/终态、取消竞争与通用清理。
- [x] TASK-004 [depends: TASK-002, TASK-003] [REQ-001, REQ-005, REQ-006, REQ-010] [AC-001, AC-002, AC-005, AC-006, AC-010]：实现窄 start/cancel command、Channel DTO 与 composition；移除旧图片 command，保持 capabilities 不扩大。
- [x] TASK-005 [depends: TASK-004] [REQ-007, REQ-008, REQ-009] [AC-007, AC-008, AC-009]：先更新 TerminalPanel/adapter 失败测试，再实现 fixed `TerminalStagingStatus`、事件 reducer、停止动作和单/多路径有序 paste。
- [x] TASK-006 [depends: TASK-003, TASK-004, TASK-005] [REQ-006, REQ-010] [AC-006, AC-010]：扩展 ignored Unix OpenSSH/SFTP fixture，验证普通文件/生成 PNG 等价 source、进度、取消/关闭清理和最终路径可读；记录当前环境限制。
- [x] TASK-007 [depends: TASK-001 至 TASK-006] [REQ-001 至 REQ-010] [AC-001 至 AC-010]：运行聚焦与 strict 全量门禁、更新 Directory Map、写验证摘要并归档。

## Dependencies And Parallel Work

- arboard 当前锁定版本已支持跨平台 `file_list()`，但 Tauri plugin wrapper 未暴露；作为直接依赖使用相同锁定版本，避免双版本。所有读取串行且在 blocking worker。
- TASK-002 与 TASK-003 在 domain/ports 稳定后可分别修改 clipboard 与 SSH infrastructure；当前执行不启用多 Agent。
- 原始图片 PNG spool 可复用当前 `image` PNG-only 依赖；本机临时文件优先使用锁定 `tempfile` 作为直接依赖或等价 create-new RAII adapter。

## Acceptance To Verification

- VER-001 [AC-001, AC-007]：`TerminalPanel.test.tsx` 与 application tests 覆盖 file-list/text/image/empty/local 优先级、单次多路径 paste、输入顺序和迟到结果。
- VER-002 [AC-002, AC-003]：native clipboard/domain tests 覆盖 file list、checked RGBA、超过旧阈值不拒绝、临时 PNG 与所有终态清理；command/TS DTO 测试证明无本机路径/字节。
- VER-003 [AC-004, AC-005]：SSH staging pure/fake/integration tests 覆盖随机名称、扩展名、权限、chunk、递归扫描、单调进度、fallback 与 completed paths。
- VER-004 [AC-006]：取消测试覆盖扫描/写入/session close、重复取消和完成竞争，验证唯一终态、部分文件清理与零 terminal paste。
- VER-005 [AC-008, AC-009]：`TerminalStagingStatus.test.tsx`、`terminalSurfaceStyles.test.ts` 验证永久 DOM 槽、全部状态、固定高度、长文本、semantic tokens、focus 与 reduced-motion。
- VER-006 [AC-010]：现有 Terminal/TransferDialog/Files/session purpose/capability regressions以及 `pnpm check`、Rust fmt/clippy/test 通过。
- VER-007 [AC-004, AC-006, AC-010]：可用 Unix 主机运行 ignored OpenSSH/SFTP fixture；环境缺失时记录具体阻塞和最小复验命令。

## Test Plan

1. `pnpm exec vitest run src/terminal/TerminalStagingStatus.test.tsx src/terminal/TerminalPanel.test.tsx src/lib/tauri/sessions.test.ts --maxWorkers=1`
2. `cargo test terminal_staging --all-targets --all-features`
3. `cargo test clipboard --all-targets --all-features`
4. `cargo test --all-targets --all-features`
5. `pnpm check`
6. `cargo fmt --check`
7. `cargo clippy --all-targets --all-features -- -D warnings`
8. `git diff --check`
9. `rg 'blocking_(pick|save)' src-tauri/src/commands` 必须无匹配；capabilities 必须无任意文件/clipboard image/file-list read 扩权。
10. 在可用 Unix 环境运行 `cargo test local_openssh_exercises_terminal_transfer_and_file_editing --all-features -- --ignored --nocapture`。

## Rollback Plan

- 回滚 staging start/cancel IPC、fixed status component 与通用 manager control，并恢复已归档 change 的图片专用 command/adapter，即可恢复文本优先+原始图片行为。
- 无 schema 或持久化回滚。回滚不会删除崩溃遗留远端暂存目录；仍由 session close、`/tmp` 策略与 home TTL 处理。
- 旧/新临时根若在实现中改名，清理器需在本版本兼容两个受限前缀，避免回滚/升级遗留失管。

## Risks

- arboard 多格式读取在平台上的格式组合不同；测试必须把 file list 与文本共存作为优先级规则，不假设所有平台同时提供相同表示。
- 超大 raw image 在 OS 解码 RGBA 时仍可能内存不足；无固定业务上限不等于无资源错误，错误必须在远端写入前稳定呈现。
- 目录扫描可能耗时且总量未知；必须在扫描阶段可取消，禁止跟随 symlink、socket、device 或越界层级。
- 完成与停止竞争可能产生已上传但未粘贴路径；终态原子化，completed 后停止禁用，view/session epoch 仍保护最终 paste。
- 永久状态栏会改变 xterm 可用高度；固定高度且始终挂载，使 fit/resize 只发生一次稳定布局变化，不随状态跳动。

## Documentation Updates

- 结构变化后更新 `docs/qb-spec/DIRECTORY_MAP.md`，以 terminal staging 替换图片专用 domain/application/ports/command/adapter 职责。
- 不自动修改长期 UI/Architecture context；固定状态组件已符合现有 semantic-token 与预分配反馈区规范，不形成新的跨任务风格偏好。

## Style Context

- `qterm-ui-spec.md`：采用 Terminal Block 内固定底部状态区、密集单行层级、persistent action、semantic tokens、ellipsis、focus-visible 与 reduced-motion。
- `ARCHITECTURE_SPEC.md`：前端不可信、窄 IPC、application 编排、第三方类型留在 infrastructure、capabilities 最小权限。

## Verification Result

- 聚焦 frontend staging/Terminal/IPC 回归 47 项通过；仓库级 `pnpm check` 共 60 个测试文件、528 项测试通过，ESLint、TypeScript 与 Vite production build 通过。
- Rust 全量 208 项通过、3 项环境依赖测试忽略；聚焦 terminal staging 10 项通过；`cargo fmt --check` 与严格 Clippy 通过。
- `pnpm tauri build` 成功生成 Windows MSI 与 NSIS；`git diff --check` 通过。capabilities 无变更，commands 中无 blocking native picker。
- ignored Unix OpenSSH/SFTP fixture 已改为走通用 staging source，覆盖随机路径、文件内容、`0700/0600` 与 session-close 清理；当前 Windows 主机缺少 Unix sshd/sftp-server 环境，未伪报该真实 smoke 通过。扫描/上传取消、重复停止、迟到结果与零 paste 由跨层自动化覆盖。
