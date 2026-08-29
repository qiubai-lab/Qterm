---
id: QB-20260829-local-terminal-clipboard-paths
type: feature
tier: standard
status: archived
created: 2026-08-29
updated: 2026-08-29
supersedes: []
---

# 本地终端剪贴板文件路径粘贴

## Goal

用户在 Qterm 本地终端中粘贴复制的文件、目录、截图或图片内容时，可以像远程终端文件暂存一样得到终端可用的本地路径；普通文本粘贴、输入顺序和长文本确认保持不变。

## Scope

- Windows 原生 Shell 使用本机 Windows 路径；macOS/Linux 默认 Shell 使用本机 POSIX 路径。
- 复用原生剪贴板的 file list > text > raw image 选择顺序。
- 复制的现有文件和目录直接粘贴规范化绝对路径，不复制内容、不经过 SFTP。
- 截图或复制的原始图片保存为 Qterm 管理的本地缓存 PNG，再粘贴其路径。
- 多个路径保持剪贴板顺序，生成适合当前原生平台默认 Shell 的单次粘贴文本。
- 继续通过 xterm `terminal.paste()` 和现有输入调度器提交内容。
- 本地文件粘贴显示稳定的准备、成功、路径已粘贴或失败状态，不显示虚假的上传进度。

## Constraints

- React 层不读取文件内容或图片像素；原生剪贴板、文件校验和图片编码留在 Rust infrastructure。
- application/domain 拥有 payload 选择结果、平台路径格式与本地缓存生命周期语义；Tauri command 只映射窄 DTO 和错误。
- 返回 WebView 的内容仅为当前粘贴动作所需的最终文本和非敏感展示元数据；不得记录、持久化或发送剪贴板路径。
- 原始图片缓存使用不可预测文件名、当前用户可写位置和有界 TTL 清理；现有文件不得被 Qterm 删除。
- 不绕过既有长文本确认、bracketed paste 和输入保序机制。

## Non-Goals

- 不支持 WSL、Git Bash/MSYS2、Cygwin 路径转换。
- 不自动识别用户临时进入的子 Shell、容器、嵌套 SSH 或其他文件系统命名空间。
- 不把本地文件上传到远端，也不为本地路径提供取消上传操作。
- 不新增本地终端 Profile、Shell 设置页或任意命令执行能力。
- 不改变远端 SFTP 暂存、取消、权限和清理行为。

## Requirements

- REQ-001：本地终端粘贴原生文件列表时，Qterm 按原顺序粘贴每个规范化绝对路径，不启动远端暂存任务。
- REQ-002：本地终端粘贴截图或原始图片时，Qterm 在受管理的本地缓存中生成 PNG，并粘贴生成文件的绝对路径。
- REQ-003：普通文本、空剪贴板、多行确认、bracketed paste 和粘贴后键盘输入顺序保持现有行为。
- REQ-004：Windows 使用 Windows 原生路径文本；macOS/Linux 使用 POSIX Shell 兼容路径文本；空格和平台允许的特殊字符不会拆分一个路径。
- REQ-005：生成图片使用不可预测名称并按 TTL 清理；复制的原有文件和目录永不被清理；剪贴板路径不进入日志或持久化状态。
- REQ-006：本地文件粘贴复用终端悬浮反馈组件表达准备、路径已粘贴与失败，不呈现上传字节进度或可停止上传按钮。

## Acceptance

- AC-001（REQ-001、REQ-004）：从 Explorer、Finder 或 Linux 文件管理器复制一个或多个文件/目录后，在对应本机默认终端粘贴得到按顺序、单路径不被空格拆分的绝对路径文本，且不调用 SSH 暂存 IPC。
- AC-002（REQ-002、REQ-005）：粘贴截图或复制图片内容会生成有效 PNG，路径位于 Qterm 本地缓存目录且可由当前本地终端读取；过期生成文件可被安全清理，现有来源文件保持不变。
- AC-003（REQ-003）：文本和空剪贴板行为不变；长文本仍需确认；异步解析期间后续终端输入仍排在粘贴之后。
- AC-004（REQ-004）：Windows 路径与 POSIX 路径格式化规则对空格、引号、Unicode 和多个路径具有纯函数回归覆盖；不声称支持 WSL/MSYS/Cygwin。
- AC-005（REQ-006）：本地文件或图片粘贴展示非上传语义的稳定状态，完成后路径通过 `terminal.paste()` 一次性写入；本地状态不提供停止上传动作。
- AC-006（REQ-001 至 REQ-006）：既有远端文件暂存、进度、取消和路径粘贴测试保持通过。

## Behavior Delta

### ADDED

- REQ-001：本地终端能够识别系统剪贴板文件列表并粘贴本机路径。
- REQ-002：本地终端能够把原始剪贴板图片保存为受管理的本机 PNG 并粘贴路径。
- REQ-004：本地路径按 Windows 或 POSIX 原生环境格式化为单次终端粘贴文本。
- REQ-005：本地生成图片获得独立于远端上传任务的缓存保留和 TTL 清理语义。
- REQ-006：本地文件粘贴获得不冒充上传过程的终端内状态反馈。

### MODIFIED

- REQ-003：本地 `Ctrl/Cmd+V` 从只读取文本扩展为遵循 file list > text > raw image 的原生剪贴板解析，同时保留既有文本粘贴保护。

## Recommended Approach

拆分“读取剪贴板 payload”和“远端上传目标”职责：复用 `NativeClipboardPayloadSource`，由新的本地终端粘贴用例把 `ClipboardPayload::Entries` 转换为本机路径文本；远端用例继续把相同 entries 交给 SFTP staging。生成图片写入由 Qterm cache root 派生的 clipboard 目录，本地用例保留，远端完成后继续删除；前端只接收最终粘贴文本与展示元数据，并通过现有输入调度器调用 `terminal.paste()`。

## Quality Check

- 目标、首版平台边界和非目标明确。
- REQ-001 至 REQ-006 均有 AC 覆盖；现有远端行为由 AC-006 保护。
- 图片缓存生命周期、路径隐私、输入保序和跨平台格式化风险均进入约束与验收。
- 无需独立 strict review；该变更不涉及鉴权、持久化 schema、公共 API 或不可逆迁移。

## Open Issues

- 无阻塞项。后续若需要 WSL/MSYS/Cygwin，应以显式本地终端类型或路径方言作为独立变更，不在本次自动推断。

## Verification Evidence

- AC-001、AC-004：domain/application/clipboard 聚焦测试通过；Windows 与 POSIX 路径格式、顺序、空格、Unicode 和引号均有回归覆盖。
- AC-002：原始图片 PNG、UUID 命名、受管目录 TTL 清理及不删除原来源文件的 Rust 测试通过。
- AC-003、AC-005、AC-006：前端聚焦测试 4 个文件、53 个测试通过；`pnpm check` 通过，共 60 个测试文件、536 个测试，并完成 ESLint、TypeScript 和生产构建。
- Rust 全量 `cargo test --all-targets --all-features` 通过：216 passed、3 ignored；`cargo clippy --all-targets --all-features -- -D warnings` 通过。
- 全量 Rust 格式检查 `cargo fmt --all -- --check --config newline_style=Auto` 通过；显式沿用工作区现有换行风格，未批量改写无关文件。
- `git diff --check` 通过，Directory Map 已同步。
- 当前主机为 Windows；macOS/Linux 的 POSIX 路径规则已由纯函数测试覆盖，但未在本机执行原生剪贴板运行时验证。
