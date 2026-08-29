---
id: QB-20260829-remote-cli-image-paste
type: feature
tier: strict
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# Remote CLI Clipboard Image Paste

## Goal

让用户在 Qterm 的远程 Terminal Block 中执行粘贴时，可以把本机剪贴板中的图片安全地转换为 PNG、上传到当前 SSH 目标，并把远端绝对路径插入正在运行的 Codex、Claude Code 等 CLI 输入区；图片像素不进入 WebView，现有文本粘贴语义保持不变。

## Current Behavior

- Terminal 粘贴只从 WebView 调用剪贴板 `readText()`；图片剪贴板无法进入远程会话。
- Qterm 已能在 Terminal purpose SSH session 上打开独立 SFTP channel，但现有上传入口只接受经过系统文件选择或原生拖放授权的本地路径。
- 远程 Codex/Claude Code 无法直接读取运行 Qterm 的本机剪贴板；OSC 52 query 也没有标准图片格式协商，不能作为原版 CLI 的图片粘贴通道。

## Scope

- 在已连接的远程 Terminal Block 中，把“无文本、存在图片”的用户粘贴操作升级为本机图片上传。
- 由 Rust/Tauri 后端读取图片、校验尺寸、编码 PNG，并通过当前 Terminal SSH session 的 SFTP channel 上传。
- Unix-like 远端优先使用 `/tmp/.qterm-clipboard-<session-uuid>/`；不可用时回退到 SFTP canonical home 下的 `.cache/qterm/clipboard/<session-uuid>/`。
- 上传成功后通过现有有序终端输入调度器插入远端绝对路径，不自动提交。
- 管理远端临时目录权限、原子写入、会话内登记、失败清理和正常断开清理。
- 为剪贴板读取、图片限制、路径策略、SFTP 字节上传、失败恢复和前端粘贴分支增加聚焦自动化覆盖。

## Non-Goals

- 不实现 OSC 52 query、OSC 1337、Kitty graphics 或其他终端图片传输扩展。
- 不修改 Codex、Claude Code 或其他第三方 CLI，也不承诺把路径转换为第三方 CLI 的专有图片 chip；Qterm 只插入可读取的远端 PNG 路径。
- 不把图片 RGBA、PNG 或通用剪贴板图片读取权限暴露给 WebView。
- 不在首个版本提供远端临时根目录设置、容器 mount namespace 探测或宿主机到容器的文件复制。
- 不支持没有 SFTP subsystem 的远端，也不通过 PTY/Base64/Shell 命令回退上传。
- 不改变本地 Terminal Block 的剪贴板行为，不自动按 Enter，不把临时图片写进项目工作目录。

## Assumptions And Constraints

- 首个版本面向 SFTP 与交互 Shell 看到同一文件系统命名空间的 Unix-like SSH 目标；CLI 运行在隔离容器且看不到宿主 `/tmp`/home 时明确报错或由 CLI 自身报告路径不可读，不猜测容器路径。
- 为保持兼容，剪贴板只要返回长度大于零的文本，即使同时含有图片或文本只有空白，也继续执行现有文本粘贴；只有文本为空或不可用时才尝试图片。
- 图片必须满足：宽高均为 `1..=8192`、总像素不超过 `16,777,216`、编码后的 PNG 不超过 `20 MiB`。超限在任何远端写入前失败。
- 原生剪贴板读取不得运行在可能阻塞 Tauri 主线程的上下文；图片只在 Rust 内存中短暂存在，不记录像素、PNG、剪贴板错误原文中的敏感内容或远端文件内容。
- `/tmp` 是共享命名空间；固定部分只作为名称前缀，每个 SSH session 使用不可预测的 UUID 私有目录，不共享 `/tmp/.cache/qterm` 等固定父目录。

## Requirements

- REQ-001：远程 Terminal 的用户主动粘贴必须保持文本优先；剪贴板有非空文本时沿用现有确认与粘贴流程，文本为空或不可用且存在图片时才开始图片粘贴。没有文本和图片时不得向终端发送数据。
- REQ-002：图片读取、尺寸校验和 PNG 编码必须在 Rust 后端完成；前端 IPC 只能提交当前 SSH session ID 并接收状态、稳定错误和最终远端路径，不能接收图片资源 ID、RGBA 或 PNG 字节，也不得新增 WebView `allow-read-image` 权限。
- REQ-003：图片必须按既定宽高、像素和编码大小上限验证并规范化为 PNG；任何超限、剪贴板不可用或编码失败都必须在打开远端文件前返回稳定、无敏感内容的错误。
- REQ-004：Unix-like 目标必须优先原子创建 `/tmp/.qterm-clipboard-<session-uuid>/` 私有目录，目录权限为 `0700`，图片权限为 `0600`；名称必须使用不可预测 UUID、禁止覆盖既有条目或跟随符号链接。`/tmp` 不存在或不可写时，必须回退到 canonical home 下的 `.cache/qterm/clipboard/<session-uuid>/` 并保持相同隔离规则。
- REQ-005：图片必须通过当前 Terminal purpose SSH session 新开的 SFTP channel 分块上传，先写同目录 `.part` 文件再原子重命名；上传成功后只返回规范化远端绝对路径，前端通过现有 `TerminalInputScheduler` 在触发粘贴的位置有序插入该路径且不自动提交。
- REQ-006：SFTP subsystem 不可用、两个临时根均不可写、上传取消/失败、连接中断或结果迟到当前 session 时，必须清理本次可识别的部分文件、不得插入路径、不得回退为 PTY/Base64 数据，并向用户显示可恢复的失败反馈。
- REQ-007：后端必须按 SSH session 只在内存中登记由 Qterm 创建的临时目录；正常关闭 session 前尽力删除该 session 的目录，上传失败立即清理 `.part`。清理不得删除其他 session、非 Qterm 路径或无法验证归属的条目；崩溃/断网残留由远端 `/tmp` 策略处理。后续同一账号成功准备 home fallback 时，必须尽力清理该 fallback 根下超过 24 小时且通过前缀、类型、归属和非符号链接检查的旧 session 目录。
- REQ-008：本地 Terminal、远程文本粘贴、多行粘贴确认、终端输入顺序和现有人工文件上传必须保持兼容；图片上传期间后续键入不得越过图片路径，重复粘贴不得复用或覆盖前一次图片文件。

## Acceptance

- AC-001 [REQ-001, REQ-008]：前端测试覆盖文本、空文本+图片、文本+图片、空剪贴板和本地 Terminal；文本存在时只走原流程，远程图片 fallback 只触发一次，空剪贴板不产生终端输入或远端调用。
- AC-002 [REQ-002]：IPC DTO 测试证明请求只含 session ID、响应不含图片数据；主窗口 capabilities 仍无 `clipboard-manager:allow-read-image`，Rust clipboard adapter 在阻塞工作线程读取且错误日志不含图片字节。
- AC-003 [REQ-003]：边界测试接受合法截图并产出 PNG，拒绝零尺寸、任一边超过 8192、超过 16,777,216 像素或 PNG 超过 20 MiB 的输入；所有拒绝场景在 fake remote store 中记录零创建/零写入。
- AC-004 [REQ-004]：SFTP 路径测试验证优先创建匹配 `/tmp/.qterm-clipboard-<session-uuid>/` 的 `0700` 目录和 `0600` UUID PNG；既有路径、符号链接或权限设置失败不会被复用，`/tmp` 失败后只回退到 canonical home，两个根均失败时返回稳定错误。
- AC-005 [REQ-005, REQ-008]：SFTP 测试验证 PNG 以多个有界 chunk 写入 `.part`、成功后同目录重命名且返回绝对路径；前端调度测试验证上传期间的后续键入排在路径之后，路径使用 terminal paste 语义插入且不附带 Enter。
- AC-006 [REQ-006]：SFTP 初始化、mkdir、write、chmod/setstat、rename、取消和断线各失败点均不会向终端插入路径；已创建的本次 `.part`/目录被尽力清理，清理失败不覆盖原始稳定错误，也不会触发 OSC/PTY 上传。
- AC-007 [REQ-007]：两个并发 session 创建不同目录；关闭其中一个只清理其登记目录。非匹配前缀、未知 UUID、符号链接和归属无法确认的目录均不删除；home fallback 清理只删除超过 24 小时且满足前缀、归属、类型和过期条件的条目，恰好 24 小时或更年轻的条目保留。
- AC-008 [REQ-008]：现有 TerminalPanel 文本/多行确认、`TerminalInputScheduler` 顺序、TransferDialog 上传及 SSH purpose 隔离回归通过；Files/Network session 不能调用图片粘贴上传。

## Behavior Delta

### ADDED

- REQ-002 至 REQ-007：新增 Rust 原生图片读取、受限 PNG 编码、安全远端临时目录、同会话 SFTP 字节上传、失败恢复和按 session 清理。

### MODIFIED

- REQ-001、REQ-008：远程 Terminal 的粘贴从“仅支持文本”调整为“文本优先、无文本时可上传图片并插入远端路径”；本地 Terminal、文本和多行确认行为保持原样。

## Architecture Boundaries

- `src/terminal/` 只拥有用户动作、短暂进度/错误状态和有序路径粘贴，不读取图片像素、不选择远端目录或实现清理规则。
- `src/lib/tauri/` 只暴露窄图片粘贴 IPC，不新增通用 `uploadBytes` 或通用剪贴板读取 API 给 WebView。
- `commands/` 只校验 session 目标、调用应用用例并映射稳定错误；不编码 PNG、不拼接临时路径、不直接实现 SFTP。
- `domain/` 拥有图片限制与受信 PNG 模型；`application/` 只编排“从 clipboard source 读取，再交给 remote store”，不感知 Tauri、远端路径布局或 SFTP 类型。
- 原生剪贴板与 PNG 编码适配器，以及远端临时目标选择、fallback、清理、russh-sftp channel、权限设置和分块写入只存在于 `infrastructure/`；第三方 Image/SFTP 类型不得进入 application、domain 或 IPC DTO。
- 临时图片、session UUID、远端路径和清理登记均为运行时状态，不进入 Workspace、profile 或 settings persistence。

## Risk Review

- 隐私：远端输出不能触发剪贴板读取；只有用户粘贴动作可调用窄用例，图片字节不进入 WebView、日志或持久化配置。
- 共享目录：随机 session 目录、`0700/0600`、拒绝覆盖和符号链接防护降低 `/tmp` 预创建与跨用户读取风险。
- 资源：像素和 PNG 上限限制内存与网络使用；SFTP 分块写入避免额外完整 IPC/PTY 副本。
- 可靠性：`.part` + rename 避免 CLI 读取半文件；失败不污染终端输入，正常 session close 尽力清理。
- 兼容性：SFTP、文件系统命名空间和第三方 CLI 路径读取仍是外部边界；第一版不以不安全的 Shell/PTY fallback 掩盖不兼容。

## Open Issues

- 非阻塞后续项：若容器化 CLI 不能看到 SSH/SFTP 命名空间，可后续增加用户配置的远端临时根或显式 workspace 路径模式；本 change 不预留不受控任意路径 IPC。
- 非阻塞后续项：第三方 CLI 若提供稳定的“按路径附加图片”协议，可在独立 change 中增加显式 adapter；当前只保证路径插入。

## Independent Quality Review

- 结果：`PASS WITH NOTES`。frontmatter、change ID、strict 层级和 Behavior Delta 有效，REQ-001 至 REQ-008 均有可观察 AC，主路径、文本优先分支、权限/符号链接风险、SFTP 错误、取消、并发 session 和清理恢复均有覆盖。
- 修订：将 home fallback 的模糊 TTL 明确为 24 小时，并补充边界时刻验收；保留 `/tmp` 系统清理为断网/崩溃后的首选恢复机制。
- 追踪：8 条 REQ 全部由 AC-001 至 AC-008 覆盖；Delta 中的 ADDED/MODIFIED 条目均引用已覆盖 REQ，没有 REMOVED 行为。
- 非阻塞说明：Unix-like 同命名空间与“只插入路径、不生成第三方图片 chip”是已显式记录的首版兼容边界；容器路径配置和 CLI adapter 留待独立 change，不影响当前 plan。

## Verification Summary

- AC-001、AC-005、AC-006、AC-008：`TerminalPanel.test.tsx` 验证文本优先、远程图片 fallback、有序插入、不自动 Enter、本地终端不调用后端、失败不输入和迟到结果丢弃；聚焦前端回归 41 项通过。
- AC-002、AC-003：domain/application/native adapter 测试验证尺寸、像素、PNG 上限与签名、RGBA 编码、有界输出和校验失败零远端写入；IPC 测试证明请求只有 session ID、响应无图片字节，capabilities 保持无 `allow-read-image`。
- AC-004、AC-007：路径与清理纯测试验证安全文件名、绝对路径、严格大于 24 小时边界；SSH manager 测试验证 purpose/session 拒绝。Unix ignored integration fixture 验证 `/tmp` 私有 session 目录、随机图片、`0700/0600` 与正常关闭清理。
- AC-005、AC-006：实现使用 Terminal session 新 SFTP channel、64 KiB 分块、排他创建 `.part`、同目录 rename、取消登记和失败尽力清理；稳定错误映射与前端失败不输入均由自动化覆盖。
- 仓库级验证：`pnpm check` 通过（59 个测试文件、520 项测试），`cargo test --all-targets --all-features` 通过（205 项通过、3 项忽略），`cargo fmt --check`、严格 Clippy、`git diff --check` 和 `pnpm tauri build` 全部通过。
- `docs/qb-spec/DIRECTORY_MAP.md` 已更新，记录新增 domain/application/port/native clipboard/SSH store/command 与前端职责。

## Residual Risk

- 当前 Windows 验证主机缺少 `/usr/sbin/sshd` 与 `/usr/libexec/sftp-server`，因此未执行真实 Unix OpenSSH/SFTP smoke。可在具备依赖的 Unix 主机运行 `cargo test local_openssh_exercises_terminal_transfer_and_file_editing --all-features -- --ignored --nocapture` 补充证据。
- SFTP 服务端对 setstat、rename 和 canonical home 的支持仍可能因实现不同而异；失败会保持不向终端插入路径，也不会回退到 OSC 或 PTY/Base64。
