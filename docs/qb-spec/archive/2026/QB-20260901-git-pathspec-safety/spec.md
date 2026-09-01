---
id: QB-20260901-git-pathspec-safety
type: bugfix
tier: strict
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 路径语义与 literal pathspec 修复

## Goal

修复 Git stage/unstage 路径校验随 Qterm 宿主平台漂移的问题，使本机仓库按宿主路径语义、SSH 仓库按既有 POSIX 执行边界校验 repository-relative 路径，并确保合法文件名不会被 Git 解释为 pathspec magic。

## Approval

用户于 2026-09-01 明确采纳评估方案，并要求实施拆分路径语义、literal pathspec 和回归保护。

## Observed Behavior

- `validate_paths(["C:/absolute.txt"])` 在 macOS 上返回成功，但既有测试固定要求失败，导致全量 Rust 门禁非零退出。
- 本机和 SSH action 共用宿主平台 `Path::is_absolute`；因此远端 POSIX path 是否通过会随运行 Qterm 的客户端 OS 变化。
- stage/unstage 虽使用参数数组或 NUL stdin，但没有关闭 Git pathspec magic；以 `:(...)` 开头的合法文件名可能改变 Git 匹配语义。

## Expected Behavior

- 本机 stage/unstage 只接受当前宿主平台下 repository-relative、无根和无平台 prefix 的路径。
- 既有 SSH Git adapter 使用 POSIX shell，因此远端 stage/unstage 始终使用 POSIX repository-relative 路径规则，与客户端 OS 无关。
- 所有逐路径 stage/unstage 都按 literal pathspec 执行；文件名不能扩大、缩小或改写用户选择的路径集合。

## Root Cause

领域层只有一个 `validate_paths`，把宿主平台 `std::path::Path` 语义同时用于本机和远端执行目标；测试又把 Windows 盘符字符串当作跨平台绝对路径夹具。基础设施层虽然隔离了 shell/option 参数，但没有显式关闭 Git pathspec magic。

## Scope

- 拆分共享路径列表结构校验、本机 repository-relative 校验和远端 POSIX repository-relative 校验。
- 本机 Git service 选择本机校验；`RemoteGitAction` 选择 POSIX 校验。
- 本机与 SSH 的逐路径 stage/unstage 命令启用 Git literal pathspec。
- 增加 domain 和真实 Git 回归测试，覆盖宿主绝对路径、POSIX 绝对路径、父目录、Windows 风格 POSIX 相对文件名及 pathspec magic 文件名。

## Non-Goals

- 不改变 snapshot、stage-all、unstage-all、commit、branch、merge 或同步语义。
- 不支持非 POSIX shell 的 SSH Git 远端，也不新增远端 OS 探测。
- 不改变 IPC DTO、前端行为、Workspace schema 或依赖。
- 不把所有 Git 命令统一重构为新的 command builder。

## Assumptions And Constraints

- SSH Git adapter 已通过 POSIX literal 构造固定 shell 命令，因此本 change 延续 POSIX 远端约束。
- snapshot 返回的 change path 是仓库相对路径；拒绝 root、platform prefix 和 `..` 不移除受支持用户流程。
- POSIX 上 `C:/absolute.txt` 是合法相对路径；不得为迁就旧断言而全局拒绝 Windows 盘符形状。
- 空值、数量、字节长度和 NUL 上限保持不变。

## Requirements

- REQ-001：本机逐路径 stage/unstage 必须按当前宿主平台拒绝 root、路径 prefix 与父目录组件，同时继续接受空格、Unicode、前导短横线和合法的普通相对路径。
- REQ-002：SSH 逐路径 stage/unstage 必须按 POSIX 语义拒绝 `/` 开头和父目录组件，并在所有客户端 OS 上保持一致；`C:/...` 在 POSIX 语义下保持合法相对路径。
- REQ-003：本机与 SSH 逐路径 stage/unstage 必须把每个路径当作 literal pathspec，不能把 `:(...)` 或通配符解释为 Git pathspec magic。
- REQ-004：共享的路径列表数量、空值、长度和 NUL 边界必须保持兼容，且 stage-all/unstage-all 和其他 Git action 不受影响。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-004]：domain 测试使用当前构建目标的真实绝对路径证明本机校验拒绝绝对/root/prefix/父目录，并接受既有合法相对路径。
- AC-002 [REQ-002, REQ-004]：domain/remote action 测试在任意宿主平台一致拒绝 `/absolute.txt` 与 `../outside.txt`，并接受 `C:/absolute.txt` 作为 POSIX 相对路径。
- AC-003 [REQ-003]：真实本机 Git 测试证明仅选中的 pathspec-magic 形状文件被 stage/unstage，邻近普通文件不被隐式匹配；SSH command/payload 测试证明命令启用 literal pathspec 且仍使用 NUL payload。
- AC-004 [REQ-001, REQ-002, REQ-003, REQ-004]：Rust fmt、Clippy、聚焦测试和 `cargo test --all-targets --all-features` 全部通过，不再出现 `C:/absolute.txt` 平台断言失败。

## Behavior Delta

### MODIFIED

- REQ-001：本机路径校验从仅依赖 `Path::is_absolute` 改为明确的 repository-relative 组件边界，并用宿主原生绝对路径测试。
- REQ-002：SSH 路径校验从客户端宿主 `Path` 语义改为稳定 POSIX 语义；POSIX 合法的 Windows 盘符形状文件名不再被 Windows 客户端误拒。
- REQ-003：逐路径 stage/unstage 从默认 Git pathspec 解释改为 literal pathspec，用户选择的文件名不再被当作 magic 或通配模式。

## Architecture Boundary Check

- Boundary Decision：路径列表形状与 local/POSIX repository-relative 规则属于 `domain/git`；application/remote action 选择执行目标语义；adapter 只启用固定的 literal Git 模式。
- Placement：不向 commands/React 泄漏路径 flavor，也不把 OS 分支散落进 IPC 或 SSH manager。
- Model Separation：本机 `Path` 与远端 POSIX string 是两个执行语义；不以一个宿主 `Path` 模型冒充远端路径模型。
- Tradeoff：保留两个小型公开 validator，避免为单一 local/POSIX 分支引入通用路径 flavor 框架或远端 OS 探测。

## Critical Behavior Protection

- Coverage Decision：stage/unstage 会修改 Git index，且本 change 修复 pathspec 解释边界，必须增加 domain 和真实 Git 回归保护。
- Required Coverage：本机与 POSIX 相对路径边界、父目录、合法特殊文件名、literal stage/unstage、远端固定命令和全量 Rust 门禁。
- Gaps：真实 OpenSSH lifecycle 继续依赖环境；固定 command/payload 单元测试与 action domain 测试作为非环境门禁。

## Risks And Rollback

- 风险：更严格的父目录/prefix 拒绝可能暴露此前由非 snapshot 调用方构造的异常路径；当前 IPC 只从仓库 snapshot 选择路径，因此这是预期收紧。
- 兼容：普通仓库相对文件名保持支持；POSIX 上包含冒号、空格、Unicode、前导短横线及 pathspec magic 形状的文件名继续可操作。
- 回滚：代码改动局限于 validator 选择、固定 Git 参数和测试，可整体回退而不涉及数据/schema 迁移。

## Open Issues

- 无阻塞项。

## Spec Review

- Result：PASS。
- Traceability：REQ-001 至 REQ-004 均由 AC-001 至 AC-004 覆盖；Behavior Delta、风险、回滚与 local/POSIX 兼容边界闭合。

## Verification Evidence

- VER-001 / AC-001：`cargo test git_path --lib` 通过；宿主原生绝对路径、父目录、合法相对文件名和共享 payload 上限均受保护。
- VER-002 / AC-002：同一 domain 聚焦测试证明 POSIX 绝对路径与父目录稳定拒绝，`C:/absolute.txt` 作为 POSIX 相对路径稳定接受；remote action 使用该语义。
- VER-003 / AC-003：`cargo test literal_pathspec --lib` 通过；真实 Git fixture 证明 `[ab].txt` 不再匹配 `a.txt`，stage 与有/无 HEAD 两种 unstage 路径均保持字面选择；SSH 固定命令包含 `--literal-pathspecs` 并保留 NUL stdin。
- VER-004 / AC-004：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`git diff --check` 全部通过；`cargo test --all-targets --all-features` 为 271 passed、0 failed、4 ignored。

## Residual Risk

- Windows-only drive-relative、rooted 与 UNC 断言通过 `#[cfg(windows)]` 纳入目标平台测试，但本次 macOS 验证环境未执行 Windows 二进制；通用宿主绝对路径与 POSIX 语义已在当前环境覆盖。
- 4 项真实 OpenSSH lifecycle 测试仍因需要本机 sshd/转发环境保持 ignored；远端 action、fixed command、literal 参数和 NUL payload 由非环境测试覆盖。

## Next Action

实现和 strict 验证已完成，归档关闭。
