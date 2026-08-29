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

# Remote Terminal Clipboard Staging Paste

## Approval

用户于 2026-08-29 明确批准推荐方案并要求落地：同时支持截图/复制图片内容与从系统文件管理器复制图片文件，并把图片专用上传升级为通用文件暂存上传；每个 Terminal Block 使用始终显示、结构固定的上传状态组件。

## Goal

让远程 Terminal 用户通过一次粘贴动作，把本机剪贴板中的文件、文件夹或原始位图安全地暂存到当前 SSH 服务器并粘贴远端绝对路径；上传具备可观察进度、稳定状态与用户可取消能力，且不向 WebView 暴露本机路径或文件字节。

## Current Behavior

- 非空文本由 WebView 读取并沿用既有文本/多行确认流程；文本为空时 Rust 只尝试读取原始位图。
- 截图或复制图片内容能够编码为 PNG、上传并粘贴路径；从 Explorer、Finder 或 Linux 文件管理器复制的图片文件以系统 file-list clipboard format 表达，当前实现不会读取该格式。
- 图片存在固定的 8192 边长、16,777,216 像素与 20 MiB PNG 限制，且图片字节通过独立的内存 SFTP 上传路径传输。
- Terminal 上传反馈是会自动消失的悬浮文本，没有传输百分比和用户停止入口。

## Scope

- 远程 Terminal 粘贴识别系统剪贴板 file list、非空文本和原始位图。
- file list 支持单个或多个普通文件和目录；文件内容流式上传，目录按现有安全递归策略扫描。
- 原始位图不再使用固定尺寸、像素或 PNG 字节上限；校验像素布局后编码到受限本机临时 PNG，再走相同的流式暂存上传。
- 沿用远端 `/tmp` 优先、canonical home fallback、私有 session 目录、原子 `.part`、正常关闭清理与 home TTL 策略，并把路径命名从图片专用推广到通用暂存条目。
- 每个 Terminal Block 永久挂载一个固定高度的上传状态栏，展示准备、扫描、上传进度、停止中、成功、路径已粘贴、已停止与失败状态。
- 用户可在扫描或上传期间停止当前暂存任务；停止或失败不得粘贴路径。

## Non-Goals

- 不把任意 clipboard MIME、Office 对象、HTML 或应用私有对象自动序列化为文件。
- 不改变普通文本、多行文本确认、本地 Terminal 粘贴或人工 TransferDialog 的语义。
- 不开放由 WebView 提交任意本机路径、远端根目录、文件权限或文件字节的通用上传 IPC。
- 不建立应用级全局传输任务中心，不统一重做 Files 下载、TransferDialog 与 Terminal 状态界面。
- 不承诺第三方 CLI 一定把所有文件格式渲染为附件；Qterm 保证上传与路径粘贴，CLI 决定如何解释路径。
- 不提供远端磁盘配额探测或绕过 SFTP 的 PTY/Base64 fallback。

## Assumptions And Constraints

- 一个固定状态组件属于一个 Terminal Block/SSH session；多个 Terminal Block 可分别显示自己的最后状态，不共享全局当前任务。
- 系统 file-list format 表示明确的文件复制意图，因此优先于同一剪贴板中附带的文本路径；没有 file list 时，非空文本仍优先于原始位图。
- “不限制大小”表示移除图片专用固定业务上限。仍必须拒绝零尺寸、像素长度不一致、整数溢出、不可读路径、符号链接、特殊文件以及本地/远端文件系统或 SFTP 返回的资源错误。
- 普通文件不得完整载入内存；传输缓冲维持有界。原始位图由操作系统 clipboard API 解码时仍会占用一份 RGBA 内存，PNG 编码不得再持有第二份无界内存副本。
- 临时远端文件必须保留到 session 正常关闭，因为 CLI 可能在路径粘贴后延迟读取；停止、失败与未完成 `.part` 必须立即尽力清理。
- 多项目返回多个无空格、不可预测且保留安全扩展名的远端路径，前端以单个 bracketed paste、空格分隔且不附带 Enter。

## Requirements

- REQ-001：远程 Terminal 粘贴必须按 file list、非空文本、原始位图的顺序解析剪贴板；file list 存在时不得把附带的本机文本路径发到终端，没有 file list 时必须保持既有文本和多行确认行为。
- REQ-002：系统复制的普通文件与目录必须从 Rust 原生剪贴板来源获得并视为一次性授权输入；路径和文件字节不得进入 WebView，符号链接、特殊文件、重复条目、超过现有条目数或目录深度边界的输入必须稳定拒绝或按现有安全策略跳过。
- REQ-003：截图或复制图片内容必须校验非零尺寸、checked 像素长度与 RGBA 一致性后编码为 PNG；不得再使用固定边长、像素数或 PNG 大小上限，编码结果必须落入私有本机临时文件并在任务完成、停止或失败后删除。
- REQ-004：文件、目录和生成 PNG 必须共用 Terminal-only 远端暂存传输语义：私有 session 目录、不可预测名称、安全扩展名、有界分块、`.part` 原子 rename、`0700/0600`、`/tmp` 优先和 canonical home fallback；不得复用人工选择任意远端路径的授权入口。
- REQ-005：暂存任务必须发送稳定的 preparing/scanning/started/progress/completed/cancelled/failed 事件；可计算总大小时显示 transferred/total 与百分比，扫描或总量未知时显示不确定进度，事件不得携带本机绝对路径或文件内容。
- REQ-006：用户必须能在扫描或上传阶段停止任务；停止需中断后续读取/写入、清理本机生成文件和本次远端未完成内容、返回 cancelled，且不得粘贴任何路径。完成与停止竞争必须只有一个终态，session 关闭必须取消所属任务。
- REQ-007：上传完成后前端必须通过现有 TerminalInputScheduler 在触发粘贴的位置一次性插入一个或多个远端绝对路径，不自动 Enter；只有实际 paste 完成后状态才变为“路径已粘贴”，session/view 失效或结果迟到不得输入。
- REQ-008：每个 Terminal Block 必须永久挂载一个结构和高度固定的上传状态组件；状态标签、摘要、进度条、百分比/字节槽和停止按钮始终占位，只改变状态文本、进度、语义颜色和 enabled 状态，不因 idle、success、error 或长路径改变终端几何。
- REQ-009：固定组件必须直接使用 Dark、Light、Cyberpunk 的 semantic tokens，保持终端内容主层级，支持窄 Block 溢出、键盘 focus-visible、progress/aria-live 语义、不可仅以颜色表达状态，并在 reduced-motion 下关闭非必要进度动画。
- REQ-010：现有人工文件传输、Files 拖放上传/下载、文本粘贴、图片内容粘贴、SFTP purpose 隔离与 capabilities 最小权限必须保持兼容；不得新增 WebView 任意文件读取或 clipboard file-list 权限。

## Acceptance

- AC-001 [REQ-001, REQ-010]：自动化测试证明 file list 与文本同时存在时只启动暂存上传；无 file list 的非空文本仍走文本/多行确认；空文本+位图走 PNG；空剪贴板、本地 Terminal 不启动远端任务。
- AC-002 [REQ-002, REQ-010]：native clipboard adapter 测试覆盖单/多文件和目录 file list，并证明 IPC 请求只含 session ID、事件/结果不含本机路径或字节；符号链接、特殊文件、重复或越界条目不进入远端写入。
- AC-003 [REQ-003]：大于旧 8192 边长、旧像素与旧 20 MiB 阈值的纯规则/编码路径不再按旧常量拒绝；零尺寸、checked 长度不一致仍拒绝；PNG 使用私有临时文件且成功、失败、停止均有清理证据。
- AC-004 [REQ-004]：SFTP 测试证明普通文件与生成 PNG 共用私有暂存根、随机安全名称、保留扩展名、`0700/0600`、64 KiB 级有界复制和 `.part` rename；目录多项目不覆盖既有文件，fallback 与清理隔离保持有效。
- AC-005 [REQ-005]：事件测试覆盖准备/扫描、不确定进度、started、单调 progress、completed/cancelled/failed；total 已知时百分比与字节正确，事件序列不泄漏本机路径。
- AC-006 [REQ-006]：取消测试覆盖扫描中与写入中停止、重复停止、完成竞争、session 关闭；终态唯一、部分内容与本机生成 PNG 被尽力删除、terminal paste 为零。
- AC-007 [REQ-007]：前端调度测试证明一个或多个无空格远端路径只 paste 一次、不带 Enter，上传期间后续键入排在路径之后；失效 view/session 和 cancelled/failed 不输入，只有 paste 完成后显示“路径已粘贴”。
- AC-008 [REQ-008, REQ-009]：组件测试覆盖 idle、preparing、scanning、uploading、stopping、completed、pasted、cancelled、failed；所有状态保留相同 DOM 槽和停止按钮位置，长名称截断且可访问名称完整。
- AC-009 [REQ-008, REQ-009]：样式测试证明组件固定高度、非条件挂载、使用 semantic tokens、窄宽度 `min-width:0`/ellipsis、focus-visible 和 reduced-motion；Dark、Light、Cyberpunk 不需要 feature-local raw color 或主题 selector。
- AC-010 [REQ-010]：现有 TransferDialog、Files transfer、TerminalPanel、input scheduler、session purpose 与 capabilities 回归通过；真实 Unix ignored integration fixture 覆盖文件列表等价输入、进度、取消清理和最终路径可读。

## Behavior Delta

### ADDED

- REQ-002、REQ-004 至 REQ-006：新增原生 file-list 文件/目录暂存、统一进度事件和用户停止能力。
- REQ-008、REQ-009：新增每个 Terminal Block 永久可见的主题化固定上传状态组件。

### MODIFIED

- REQ-001：远程粘贴从“文本优先、否则图片”调整为“系统 file list 优先、否则文本优先、否则原始位图”，避免复制文件时粘贴不可用的本机路径。
- REQ-003：原始位图从固定图片尺寸/像素/PNG 上限和内存 PNG 上传，调整为仅保留技术合法性检查、私有本机临时 PNG 与通用流式暂存上传。
- REQ-007：图片单路径结果调整为通用单/多路径结果，并以固定状态组件表达最终路径已粘贴。

### REMOVED

- REQ-003：移除 8192 边长、16,777,216 像素和 20 MiB PNG 的产品级拒绝行为；资源耗尽和底层文件系统/SFTP 错误仍显式失败。

## Architecture Boundaries

- `src/terminal/` 拥有用户粘贴动作、固定状态展示与最终有序路径 paste；不接收本机路径、文件字节或实现远端命名/清理。
- `src/lib/tauri/` 暴露 session ID、opaque task ID、无敏感事件和取消调用；不新增任意本机路径上传 API。
- `commands/` 只装配原生 clipboard source、启动用例、桥接事件和映射稳定错误。
- `application/` 拥有 clipboard payload 优先级、暂存任务生命周期、取消终态和本机生成文件清理编排。
- `domain/` 拥有无敏感传输事件、合法状态迁移、远端暂存名称和资源边界规则。
- `infrastructure/clipboard` 读取跨平台 text/file list/RGBA；`infrastructure/ssh` 流式扫描/传输、权限、原子 rename 与远端清理。arboard、Tauri Image、PathBuf 授权细节和 russh-sftp 类型不得进入 IPC DTO。

## Risk Review

- 本机路径授权：只接受 native clipboard file list，不接受前端回传路径；clipboard 读取必须串行并移出主线程。
- 内存：普通文件流式读取；原始位图仍受 OS RGBA 解码内存约束，使用 checked 长度并把 PNG 编码到磁盘，避免额外无界 PNG Vec。
- 磁盘：取消和失败立即清理，完成内容保留到 session close；远端无标准配额预检，磁盘不足按稳定上传失败处理。
- 路径：随机名称避免 shell quoting、重名和本机 basename 泄漏；只保留经过白名单清理的扩展名。
- 并发：每个 Terminal Block 同时只允许一个 clipboard staging task；重复粘贴在 input scheduler 中排队，取消/完成和 session close 必须终态唯一。
- 兼容：CLI 对 HEIC、SVG 或任意非图片文件的解释由 CLI 决定；截图输出 PNG，复制图片文件默认保持原内容和扩展名。

## Open Issues

- 无阻塞项。用户已明确确认同时支持原始图片内容与复制图片文件，并批准推荐方案实施。

## Independent Quality Review

- 结果：`PASS WITH NOTES`。change ID、feature/strict 分类、approved 生命周期与 supersedes 关系有效。
- 追踪：REQ-001 至 REQ-010 均由 AC-001 至 AC-010 覆盖；ADDED、MODIFIED、REMOVED 全部引用已覆盖需求，没有无验收行为。
- 主路径与替代路径：file list、文本、原始位图、空剪贴板、本地终端、多项目、目录、取消、失败、迟到结果和 session close 均有可观察结果。
- 风险：任意本机路径 IPC、无界内存 PNG、远端覆盖、符号链接、特殊文件、磁盘不足和取消竞争已有明确边界。
- 非阻塞说明：Windows/macOS/Linux file-list clipboard interoperability 与真实超大文件/SFTP 资源故障需要平台或 ignored integration fixture 补充；当前范围允许按环境阻塞记录，不得伪报跨平台实机通过。

## Verification Result

- AC-001 至 AC-003：domain/application/native adapter/IPC 测试证明 file list > text > raw image、文件与目录来源、旧尺寸/像素上限移除、checked RGBA、磁盘 PNG 和本机路径/字节不进入 WebView。
- AC-004 至 AC-006：SSH staging tests/ignored fixture 覆盖随机安全路径、扩展名、`0700/0600`、64 KiB 分块、进度、扫描取消、重复停止占槽、失败/关闭清理和互斥终态。
- AC-007 至 AC-009：TerminalPanel 与固定状态组件测试覆盖多路径一次 paste、输入顺序、取消/失败/迟到零输入、全部可见阶段、固定 DOM/高度、semantic tokens、focus-visible 与 reduced-motion。
- AC-010：前端全量 528 项与 Rust 全量 208 项通过，3 项 Unix 环境测试按声明忽略；ESLint、TypeScript、Vite、rustfmt、Clippy、Windows MSI/NSIS 打包与 diff/capability 检查通过。
- 环境限制：当前 Windows 主机未运行 Unix OpenSSH/SFTP ignored smoke；跨 Windows/macOS/Linux 的真实 file-list clipboard 互操作仍需各平台人工/CI 复验，不影响当前确定性实现与自动化门禁。
