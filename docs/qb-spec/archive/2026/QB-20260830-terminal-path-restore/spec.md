---
id: QB-20260830-terminal-path-restore
type: design
tier: strict
status: archived
created: 2026-08-30
updated: 2026-08-30
supersedes: []
---

# Restore Terminal And File Paths Across Restarts

## Change Shape

### Goal

在 OSC 7 已提供可靠当前目录的基础上，让工作区在 Qterm 关闭并重新启动、或同一终端 Block 重新连接后，优先回到该 Block 上一次确认的终端目录；现有文件管理 Block 继续恢复各自最后浏览的目录。

### Type And Tier

- Type: `design`。请求首先要求验证持久化、会话重建、路径失效降级和兼容迁移的可行性，再决定是否实现可见行为。
- Tier: `strict`。变更预计跨 React workspace model/provider、Tauri workspace DTO/domain/repository 和前后端测试，并需要 workspace schema 迁移；按 schema 变更门槛使用 strict traceability，但不涉及凭证格式、公开 API 或不可逆数据迁移。

### Approval

- 2026-08-30：用户明确采纳推荐方案，并授权编写计划和开始实现。

### Scope

- 按终端 Block 和当前连接目标持久化最后一次合法 OSC 7 目录。
- 本地终端重建时尝试以持久化目录作为 PTY 初始目录。
- SSH 终端重建时，在 OSC 7 / remote shell integration 可用时尝试以持久化目录作为初始目录。
- 保持本地与远程文件管理 Block 的当前路径随 workspace document 保存和恢复。
- 为目录已删除、不可访问、目标已变化或 Shell 不支持集成的情况定义安全降级。
- workspace schema 向后迁移，并继续禁止持久化 session、终端输出和凭证材料。

### Non-goals

- 不恢复原进程、SSH 会话、终端缓冲、环境变量、后台任务或 Shell 历史。
- 不保证重新创建一个已被用户从布局中关闭/删除的终端 Block 时恢复该 Block 的旧目录。
- 不让已经打开的独立文件管理 Block 持续跟随终端目录变化。
- 不新增跨所有 Shell 的 OSC 7 注入能力，也不改变 OSC 7 设置的默认值。
- 不保证已删除、已移动或权限已改变的目录仍可被打开。

### Assumptions

- “关闭终端后重新打开”主要指关闭并重新启动 Qterm，以及保留在布局中的同一终端 Block 断开后重连；关闭布局 Block 会删除其持久化身份。
- 恢复目录是导航状态，和现有文件管理路径一样属于可持久化的非敏感 workspace 数据；它可能暴露本地或远程目录名称，但不包含文件内容。
- 文件管理 Block 继续拥有独立路径；从终端新开文件管理 Block 时只复制当时的路径，不建立持续绑定。

## Current Evidence And Feasibility

### Existing Capabilities

- `TerminalRuntime.cwd` / `cwdSource` 已接收合法 OSC 7 路径，但当前只存在 React 内存中；`TerminalNode` 没有目录字段，所以应用重启后丢失。
- `FilesNode.path` 已属于 workspace layout，`FileBrowserPane` 在导航成功后通过 `setFilesPath` 更新 document；workspace provider 已对 document 做持久化。因此文件管理路径的主体能力已经存在，本变更主要需要把它纳入明确回归契约。
- 本地会话已经接受 `initialDirectory`，Rust PTY 会验证绝对且存在的目录，并在无效时降级到用户主目录。
- SSH 会话 DTO 已接受 `initialDirectory`；已支持的 Bash、Zsh、Fish 和 PowerShell 初始化命令会进行字面量安全编码，在安装 OSC 7 hook 前尝试切换目录，失败时保持会话可用。
- 工作区当前使用严格的 schema v6 DTO 和 repository record。给 Terminal leaf 增加目录需要协调升级 schema，并至少支持 v6 到新版本的迁移。

### Feasibility Conclusion

总体可行性：**高**。现有本地和 SSH 会话启动边界已经具备初始目录参数，核心缺口是持久化数据所有权和重建时的数据灌入，不需要新增协议、第三方依赖或长期保存运行时 session。

实现复杂度：**中等**。主要成本来自 workspace schema 迁移、终端目标切换时清理陈旧路径、退出前最后状态的可靠保存，以及本地/远程目录失效时的一致恢复行为。

## Requirements

- `REQ-001`：每个仍存在于 workspace layout 的终端 Block 可以保存最后一次合法、非空且长度受限的 OSC 7 目录，并与该 Block 当前 `profileId`（本地为 `null`）共同定义恢复上下文。
- `REQ-002`：本地终端首次重建或同 Block 重连时，应尝试从已保存目录启动；目录不存在、不是绝对目录或无权访问时，应安全降级到用户主目录，并以实际启动目录更新当前状态。
- `REQ-003`：SSH 终端自动重连或同 Block 重连时，在 remote shell integration 可用的前提下，应通过现有安全编码的 `initialDirectory` 路径尝试恢复；远端 `cd` 失败、Shell 不受支持或集成关闭时，连接不得因此失败，并应使用远端默认目录及后续实际 OSC 7 报告。
- `REQ-004`：本地和远程文件管理 Block 应继续独立保存最后成功解析的浏览路径，并在 workspace 重载及远程 SFTP 重连后以该路径发起目录加载。
- `REQ-005`：终端目标 `profileId` 改变、OSC 7 跟踪被关闭或终端 Block 被删除时，不得把旧目标的已保存目录应用到新目标或新 Block。
- `REQ-006`：持久化数据只新增受限目录导航状态；不得写入 `sessionId`、终端输入输出、终端缓冲、密码、口令、私钥内容或其他运行时状态。
- `REQ-007`：workspace schema 升级必须无损读取当前 v6 文档，并保留当前仍受支持的旧版本迁移路径；旧文档中缺少终端目录时按“没有恢复目录”处理，不覆盖源文件直到正常保存。
- `REQ-008`：OSC 7 目录的保存应复用 workspace 持久化节流，避免每个提示符造成无界写入；正常关闭应用时，应尽可能提交已接受但仍在防抖窗口内的最新 workspace 状态。

## Observable Acceptance

- `AC-001` (`REQ-001`, `REQ-002`)：本地终端收到目录 A 的合法 OSC 7 后，关闭并重启 Qterm；同一 workspace/Block 的新 PTY 从目录 A 启动，或在 A 已失效时从用户主目录启动且仍可交互。
- `AC-002` (`REQ-001`, `REQ-003`)：受支持的 SSH Shell 在目录 B 上报 OSC 7 后，重启或重连同一 Block；新会话尝试进入 B，并由首次实际 OSC 7 确认最终目录。B 失效时 SSH 连接仍成功并停留在远端默认目录。
- `AC-003` (`REQ-004`)：本地文件管理 Block 导航到目录 C、远程文件管理 Block 导航到目录 D 后重启应用；两个 Block 分别以 C 和 D 加载，不互相覆盖，也不随关联终端后续 `cd` 自动变化。
- `AC-004` (`REQ-005`)：保存了目录的终端切换到另一 profile、关闭 OSC 7 或删除 Block 后，旧目录不会被用于新 profile 或新建 Block。
- `AC-005` (`REQ-006`, `REQ-007`)：v6 workspace fixture 可加载为新 schema 且终端恢复目录为空；保存/重载包含本地、SSH 终端目录和文件路径的文档可无损往返，禁止字段检测仍拒绝 session、缓冲和凭证材料。
- `AC-006` (`REQ-003`, `REQ-006`)：包含空格、引号、Unicode 和命令元字符的合法远端路径继续使用现有字面量编码，不产生额外命令执行；超长、空字符串或含 NUL 的目录不进入持久化恢复状态。
- `AC-007` (`REQ-008`)：连续重复 OSC 7 报告不会造成与报告数量一一对应的持久化写入；在正常应用关闭路径中，防抖期间的最新已接受目录不会被静默遗失。

## Behavior Delta

### ADDED

- `REQ-002`：本地终端重建尝试恢复保存目录并安全降级。
- `REQ-003`：SSH 终端重建尝试恢复保存目录并安全降级。
- `REQ-005`：目标变化、设置关闭和 Block 删除清除不再适用的恢复上下文。
- `REQ-007`：workspace schema 为终端恢复目录提供兼容迁移。
- `REQ-008`：终端目录更新受控持久化并覆盖正常关闭时的待保存状态。

### MODIFIED

- `REQ-001`：替换 `2026-08-21-terminal-target-race-local-cwd` 中“不持久化运行时 CWD”的既有边界；只把最后一次合法 OSC 7 目录提升为与 Terminal layout leaf 绑定的恢复导航意图，仍不持久化 session 或其他运行时状态。

文件管理路径已经是持久化布局行为；`REQ-004` 将其作为本次变更必须保护的既有行为，而不是新增 Delta。

## Options

| 方案 | 成本与复杂度 | 风险与维护 | 结论 |
| --- | --- | --- | --- |
| A. 将最后确认目录放入 Terminal layout leaf，并复用现有 `initialDirectory` | 中等；需要 schema 迁移和前后端模型同步 | 数据所有权与 Block/profile 一致；可复用现有本地/SSH 安全边界 | **推荐** |
| B. 在 workspace 外维护按 blockId 索引的 runtime snapshot | 中高；需要额外存储、清理和双向同步 | 容易产生已删除 Block 的孤儿状态，并模糊 layout/runtime 边界 | 不推荐 |
| C. 会话连接后由前端直接向终端输入 `cd` | 表面成本低 | 存在 Shell 方言、转义、回显、时序和用户输入竞争；重复已有后端能力 | 拒绝 |

## Recommendation

采用方案 A。建议把字段命名为表达“恢复意图”而非活跃 runtime 的可空目录字段，并只在合法 OSC 7 报告后更新。终端启动读取该字段并传入现有 `initialDirectory`；首次真实启动目录或 OSC 7 报告继续作为运行时事实。文件管理继续使用现有 `FilesNode.path`，仅补齐重启、远程重连和失效路径的回归验证。

建议升级 workspace schema（v6 → v7），而不是在 v6 中静默加入字段。这样旧版应用不会误读新文档，新版可以显式把 v6 Terminal leaf 迁移为“无恢复目录”。

## Risks And Recovery

- 路径可能在下次启动前被删除或失去权限；恢复必须是一次尝试，不能阻断终端连接。建议以非阻塞提示说明已降级到实际目录。
- 远端目录恢复依赖已支持的 remote shell integration；未知 Shell 或用户关闭集成时只能回到远端默认目录。
- OSC 7 路径可能包含隐私信息；继续把 workspace 文件视为本机配置数据，并保持现有受限字段和文件权限策略。
- schema 前后端不同步会导致 workspace 保存失败；模型、command DTO、domain、repository 和 fixtures 必须同批发布。
- 若实现出现问题，可停止写入恢复目录并让新 schema 字段保持为空；v6 到 v7 的追加式迁移不需要反向修改原 v6 文件。

## Traceability Check

| Requirement | Acceptance |
| --- | --- |
| `REQ-001` | `AC-001`, `AC-002` |
| `REQ-002` | `AC-001` |
| `REQ-003` | `AC-002`, `AC-006` |
| `REQ-004` | `AC-003` |
| `REQ-005` | `AC-004` |
| `REQ-006` | `AC-005`, `AC-006` |
| `REQ-007` | `AC-005` |
| `REQ-008` | `AC-007` |

Embedded quality check: PASS。目标、范围和非目标明确；所有 `REQ-*` 均有可观察验收覆盖；Behavior Delta 与新增行为一致；兼容、安全、失败和恢复场景没有阻塞性缺口。由于 tier 升级为 strict，进入计划前仍需独立规格审查。

## Independent Spec Review

- Result: `PASS WITH NOTES`。
- Frontmatter：ID 唯一；type、strict tier、approved lifecycle、日期与 supersedes 完整。
- Traceability：所有 `REQ-*` 均有 `AC-*` 覆盖；Behavior Delta 已明确记录对既有“不持久化运行时 CWD”边界的局部替换。
- Notes：恢复失败提示样式和“删除 Block 后是否保留全局历史”仍是非阻塞选择；当前验收已明确默认行为，不影响进入 planning。

## Open Issues

- 非阻塞产品选择：恢复目录失败时，是只显示终端当前实际目录，还是额外显示一次“已回退到主目录”的提示。推荐一次非阻塞提示，便于用户理解为何未回到原路径。
- 如果用户期望“关闭一个布局终端 Block 后，再新建 Block 也恢复旧目录”，需要另行定义目录继承范围；本 draft 不把已删除 Block 的路径保留为全局历史。

## Next Action

实现与 strict verification 已完成；spec 和 plan 在无冲突条件下归档。

## Verification Evidence

- `VER-001` / `AC-001`：WorkspaceProvider hydration 回归证明本地 Terminal leaf 的 `restoreDirectory` 会进入现有 local `initialDirectory`；Rust local PTY 全量测试证明失效目录降级到 canonical home。
- `VER-002` / `AC-002`：WorkspaceProvider hydration 回归证明 SSH Terminal leaf 的恢复目录进入现有 terminal connect input；既有 shell integration 测试证明 Bash/Zsh/Fish/PowerShell 安全编码、目录切换先于首次 OSC 7 且失败非致命。
- `VER-003` / `AC-003`：Files reducer、LayoutView、FileBrowserPane 回归证明本地/远程 Files leaf 继续持久化自己的路径，并与终端恢复目录独立。
- `VER-004` / `AC-004`：reducer/provider/WorkspaceShell 回归证明 profile 变化、OSC 7 关闭和 Block 删除不会把旧恢复目录应用到新上下文。
- `VER-005` / `AC-005`：Rust domain、command DTO 和 JSON repository 回归证明 schema v7 往返、v5/v6 非覆盖迁移、4 KiB/NUL 边界以及 session/terminal output/secret 禁止字段保护。
- `VER-006` / `AC-006`：Rust `InitialDirectory` 和 shell integration 对复杂 Unicode、空格、引号与命令元字符的全量回归通过；无额外命令执行路径。
- `VER-007` / `AC-007`：reducer 幂等测试证明相同 OSC 7 路径不改变 workspace document；window adapter/provider 回归证明正常关闭按 flush → destroy 顺序保存最新 document。
- Frontend：`pnpm check` 通过；ESLint、60 个 Vitest 文件 / 541 项测试、TypeScript 和 Vite production build 全部成功。Vite 仅保留既有 chunk-size warning。
- Rust：`cargo clippy --all-targets --all-features -- -D warnings` 通过；`cargo test --all-targets --all-features` 为 217 passed、0 failed、3 个既有环境依赖 OpenSSH tests ignored。
- Formatting：本次触及的 `domain/workspace.rs`、`commands/workspace.rs`、`json_workspace_repository.rs` 通过 scoped `rustfmt --check`。仓库级 `cargo fmt --check` 仍被 22 个未改动 Rust 文件的既有 CRLF checkout 状态阻塞；失败列表不包含本次触及文件。

## Completion Notes

- Completion: `archived`。
- Manual GUI：未连接真实外部 SSH 主机执行桌面重启；本地/SSH 恢复路径由 provider、DTO、shell integration、PTY 和全量回归的分层自动化证据覆盖。
- Residual risk：真实远端目录仍可能因下次连接前被删除或权限变化而无法进入；按既有非致命 `cd`/home fallback 保持终端可用。
