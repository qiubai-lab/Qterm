---
id: QB-20260831-git-repository-history
type: feature
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# 按连接保存最近打开的 Git 仓库

## Goal

让用户在 Git Block 中按本机或当前 SSH 连接快速重新打开曾经成功加载的仓库，同时保留现有原生本机目录选择和远程混合式目录浏览能力。历史应跨 Workspace 与应用重启保留，但不得污染连接配置、复制 session 生命周期或记录未成功打开的路径。

## Change Shape

- Type：`feature`，新增可见的仓库最近使用历史和快速打开行为。
- Tier：`strict`，需要升级 Workspace 持久化 schema，并对 MRU 去重/限额、按 profile 隔离和旧 schema 迁移建立完整保护。
- Approval：用户于 2026-08-31 明确“采纳方案，请你落地 spec 和 plan 并开始修改”，本 change 已获批准并进入 `active`。
- Related change：延续 `QB-20260831-git-remote-repository-picker` 的顶部仓库入口、native local picker、remote picker 和既有 `selectGitTarget` lifecycle。

## Current Behavior

- Workspace 文档持久化当前 Git Block target 和 `recentProfileIds`，但不保留已经关闭或被替换的 Git 仓库路径。
- 顶部文件夹按钮直接打开本机原生目录选择器，或在远程连接可用后打开远程目录选择弹窗。
- 用户切换到新的远程 profile 时只能填写路径；无法看到该连接过去成功打开的仓库。
- 路径被选择后会立即成为 target，但只有 Git snapshot 成功后才能确定它是可用仓库或已初始化仓库。

## Recommended Behavior

- Workspace 文档新增一个有序、全局有界的 `recentGitRepositories` MRU 列表；条目使用专用 `Local | Remote(profileId, path)` 模型，不允许 `Unbound`。
- 本机被视为一个独立 scope；远程历史按 `profileId` 精确隔离。每个 scope 最多保存 8 条，总计最多 64 条。
- 只有 GitPane 首次成功取得目标仓库 snapshot，或初始化成功返回 snapshot 后才记录；输入、浏览、失败、取消和普通刷新不得产生新历史条目或反复改变顺序。
- 顶部文件夹按钮改为稳定的“打开仓库”弹层，列出当前 scope 的最近仓库与固定“浏览其他目录…”动作。选择历史沿用既有 target/session lifecycle；远程断线时请求既有认证与重连。
- 新选择远程 profile 后的路径设置区域展示该 profile 最近成功打开的仓库，可直接选择并连接；没有历史时保留原路径输入流程。
- 路径失效、权限变化或不再是仓库时，继续使用现有 GitPane 错误/初始化/重试状态；不自动删除历史，避免把暂时性远端故障当成永久删除意图。

## Assumptions And Constraints

- 本机历史属于 `local` scope；“按连接”对远程只使用稳定 `profileId`，不使用名称或 endpoint 作为 identity。
- 仓库路径属于项目已允许持久化的 Workspace 非敏感数据；不得保存凭据、sessionId、Git 输出、文件内容或主机密钥数据。
- 历史名称从路径动态派生，不持久化仓库显示名称或时间戳；数组顺序就是 MRU 顺序。
- 删除 profile 不触发跨 repository 级联改写 Workspace；不存在的 profile 历史不展示，仍受 64 条总上限约束。
- 不静默改变 schema v9；新增字段必须使用 Workspace schema v10 和显式 v9 → v10 迁移。

## Requirements

- REQ-001：应用必须持久化最近成功打开的 Git 仓库，并在应用重启、Workspace 切换、Git Block 关闭或 target 被替换后继续可用。
- REQ-002：历史必须按 scope 隔离：本机/未绑定 Git target 只能看到本机历史，远程 target 或待配置 remote profile 只能看到相同 `profileId` 的远程历史；不得展示其他连接的路径。
- REQ-003：历史记录必须遵守 MRU 语义，同一 scope/path 去重并移到最前；每个 scope 最多 8 条，全部 scope 总计最多 64 条；`Unbound`、空路径、超长路径和控制字符不得保存。
- REQ-004：只有目标仓库首次成功加载 snapshot 或初始化成功后才能记录历史；选择路径、目录浏览、加载失败、取消和相同目标的自动刷新不得新增条目或反复改变 MRU 顺序。
- REQ-005：Git Block 顶部文件夹按钮必须打开一个 feature-local 最近仓库弹层；弹层显示 basename、完整路径、当前项状态、空态和固定“浏览其他目录…”动作，并在关闭后恢复触发按钮焦点。
- REQ-006：从历史选择本机仓库必须沿用现有 `selectGitTarget`；选择远程仓库必须保留相同 profile 并沿用现有 close/epoch/persist/reconnect/auth lifecycle，不建立第二条 Files session或绕过认证。
- REQ-007：“浏览其他目录…”必须保持现有行为：本机调用非阻塞 native picker，远程调用已实现的混合式远程目录选择器；取消不得改变 target 或 MRU。
- REQ-008：用户从 Git 目标选择器切换到新的 remote profile 时，路径设置区域必须展示该 profile 的历史；选择历史可直接作为目标连接，没有历史时手动路径输入和取消流程保持不变。
- REQ-009：历史路径失效、无权限或不再是 Git 仓库时不得自动删除或跨 scope 回退；现有 Git 错误、初始化和重试界面继续作为事实源。
- REQ-010：Workspace schema 必须升级到 v10，前端 model、domain model、IPC DTO 和 persistence record 保持分离；v9 文档显式迁移为空历史，旧文档在显式保存前不得被加载过程覆盖，未来/损坏文档继续拒绝且不改写。
- REQ-011：历史弹层必须遵守 Qterm 紧凑工作台样式，使用 semantic tokens、单一有界列表 scroller、可见 focus、键盘方向导航/Enter/Escape、当前项文本标记、主题滚动条和 reduced-motion；核心浏览动作不得只在 hover 时出现。
- REQ-012：现有 Git snapshot、status、stage/unstage、commit、branch、graph、commit tooltip、提交文件展开、远程目录 fallback、native picker、Workspace runtime 和连接选择行为不得回归。

## Non-Functional Requirements

- NFR-001：Workspace 文档新增历史后仍受现有 4 MiB 持久化文档上限保护；历史的 8/64 双重限额必须在前端 reducer 和 Rust domain validation 中一致执行。
- NFR-002：不增加 UI、状态、日期、虚拟列表或存储依赖；历史弹层最多渲染 8 行，不需要通用虚拟化或新 manager dialog。
- NFR-003：MRU 更新必须是纯、确定性转换，可在不挂载 React、不访问文件系统的情况下测试。
- NFR-004：路径不得进入日志、错误正文或 `connections.json`；历史只随现有 `workspaces.json` 原子保存。

## Observable Acceptance

- AC-001（REQ-001, REQ-003, REQ-010, NFR-001）：schema v10 文档可 round-trip 本机与多个 profile 的历史；v9 显式迁移为空历史；重复、超限、非法、未知字段、未来和损坏数据按既有严格策略拒绝或保留。
- AC-002（REQ-002, REQ-003, NFR-003）：纯 reducer/history 规则测试证明本机与不同 profile 精确隔离、重复项前移、每 scope 8 条、全局 64 条和 deterministic order。
- AC-003（REQ-004, REQ-009）：GitPane 测试证明成功 snapshot/initialize 每个 target identity 只报告一次，刷新与 mutation snapshot 不重复记录，失败/cancel 不记录；失效历史仍走现有错误状态且不自动移除。
- AC-004（REQ-005, REQ-007, REQ-011）：历史弹层测试覆盖 scope 条目、basename/path、当前标记、空态、固定浏览动作、pointer/keyboard 选择、outside/Escape 关闭和焦点恢复；样式契约覆盖有界单 scroller、semantic tokens、主题滚动条与 reduced motion。
- AC-005（REQ-006, REQ-007）：LayoutView 测试证明本机历史选择调用一次本机 target change，远程历史选择保留 profile 并在需要时沿用认证/重连；浏览动作继续分流 native picker/remote picker，取消不修改历史。
- AC-006（REQ-002, REQ-008）：切换到新 remote profile 的配置状态只显示该 profile 的最近仓库；选择一项直接提交相同 profile/path，其他 profile 和本机历史不可见，无历史时现有表单可用。
- AC-007（REQ-010, NFR-004）：序列化与静态审计证明历史只存在于 Workspace contract，不进入 profile DTO/`connections.json`，不包含 sessionId、时间戳、仓库输出或文件内容。
- AC-008（REQ-012）：既有 Git、Workspace、workspace persistence、native dialog 与主题样式回归继续通过，完整前端门禁和 tier-appropriate Rust checks 无本次新增失败。

## Behavior Delta

### ADDED

- REQ-001 至 REQ-006：新增跨重启的按连接 Git 仓库 MRU，以及顶部最近仓库快速打开弹层。
- REQ-008：新 remote profile 路径配置新增该 profile 最近仓库快捷选择。
- REQ-010：Workspace schema v10 新增严格历史字段和显式 v9 migration。

### MODIFIED

- REQ-005、REQ-007：顶部文件夹按钮由直接打开目录选择器改为先打开最近仓库弹层；原目录选择能力移动到弹层的固定“浏览其他目录…”动作。
- REQ-004：仓库 target 被选择不再等同于“最近打开”；只有成功取得 snapshot 后才进入历史。

## Architecture Boundary Decision

- Boundary Decision：仓库历史是 Workspace 低频可持久化状态，不属于 ConnectionProfile、Git transport 或 session runtime；连接 profile 只提供远程 scope identity。
- Placement：前端纯 MRU/scope 规则放在 `src/workspace/gitRepositoryHistory.ts`；Workspace reducer 持有更新；GitPane只报告首次成功打开；GitBlock编排历史弹层、浏览和 target lifecycle；Rust workspace domain验证稳定限制；JSON adapter只映射 schema/migration。
- Model Separation：`GitRepositoryHistoryEntry` 不复用允许 `Unbound` 的 `GitTarget`；前端 model、Rust domain enum、workspace command DTO 和 persistence record 分别定义并显式转换。
- Tradeoff：不新增 `git-history.json`、application service 或 profile 字段。现有 `recentProfileIds` 已证明 Workspace document 是低频 recent UI state 的合适 owner；独立 repository 在没有搜索、手工管理或跨设备合并需求时成本过高。

## Non-Goals

- 不保存 last-opened 时间戳、仓库名称、分支、remote origin 或缩略信息。
- 不提供全局“最近仓库管理器”、搜索、固定、手工排序、清空或逐项删除。
- 不验证历史路径当前是否存在，不在弹层内预加载 snapshot，也不自动移除失败条目。
- 不把历史写入 connection profile、network rule、vault、cache 或独立 Git history 文件。
- 不改变远程 Git action allowlist、SFTP 能力、Workspace session schema 或 GitTarget union。

## Strict Traceability Seed

- TASK-001（REQ-001 至 REQ-003, REQ-010, AC-001, AC-002, AC-007）：先建立前后端 schema v10、history model、migration、MRU/隔离/限额失败测试。
- TASK-002（REQ-004, REQ-009, AC-003）：建立 GitPane 成功记录时机与重复刷新保护测试，再实现一次性 opened callback。
- TASK-003（REQ-005 至 REQ-008, REQ-011, AC-004 至 AC-006）：建立历史弹层和 LayoutView 集成失败测试，再实现 header/pending-profile 两个入口与样式。
- TASK-004（REQ-012, AC-008）：执行 Workspace/Git/native dialog/theme/Rust 回归、更新 Directory Map 并完成验证归档。
- VER-001（AC-001, AC-002, AC-007）：Rust workspace domain/command/persistence 与前端 reducer/history tests。
- VER-002（AC-003）：GitPane success/failure/refresh/mutation opened-callback tests。
- VER-003（AC-004 至 AC-006）：history popover、LayoutView 和 gitStyles behavior/style tests。
- VER-004（AC-001 至 AC-008）：`pnpm check`、Rust fmt/clippy/workspace tests、native dialog audit、sensitive/profile persistence audit 和 `git diff --check`。

## Risks And Rollback

- 风险：在 target selection 时记录会保存无效路径；记录必须由成功 snapshot callback 驱动。
- 风险：自动 focus refresh 或 mutation snapshot 反复重排 MRU；GitPane 必须按已报告 target identity 去重。
- 风险：按名称或 endpoint 分组会在 profile 编辑后泄漏/丢失历史；scope 只允许稳定 profileId。
- 风险：相同 schema 版本增加默认字段会破坏严格 persistence 约束；必须升级 v10 并显式迁移 v9。
- 风险：header action 增加一层交互会降低纯浏览效率；弹层底部固定浏览动作，并为历史路径提供单击快速打开。
- Rollback：移除 history field/reducer/callback/popover并把 header action恢复为直接 browse；v10 → v9 不做反向迁移，但历史字段是附加数据，回滚构建应明确拒绝未来 schema而不覆盖文件。代码回滚前应保留 v10 读取能力或提供兼容版本。

## Quality Check

- REQ-001 至 REQ-012 均由 AC-001 至 AC-008 覆盖；schema、主路径、跨连接隔离、空态、失败、恢复、迁移、限额和兼容行为可观察。
- Behavior Delta 明确新增 MRU、入口交互变化和“成功后记录”语义；无未说明的移除行为。
- strict architecture、critical behavior、rollback、model separation 和 TASK/VER seed 已建立。

## Open Issues

- 无阻塞项。首期不提供历史删除/固定；如果后续出现明确管理需求，再评估独立 history repository 或 manager surface。

## Verification Evidence

- VER-001 / AC-001、AC-002、AC-007：前端纯 MRU/reducer 16 项聚焦测试与 Rust Workspace domain 6 项、command DTO 3 项、JSON persistence 8 项测试通过；覆盖 scope isolation、exact dedupe、8/64 确定性限额、非法条目、v10 round-trip、v9 空历史迁移、load no-overwrite 与 strict 数据拒绝。
- VER-002 / AC-003：GitPane 25 项测试通过；local/remote snapshot 和 initialize 成功才上报，失败不报告，refresh/mutation 不重复，target 切换后可重新报告。
- VER-003 / AC-004 至 AC-006：popover/LayoutView/GitPane/MRU/reducer/gitStyles 聚焦集合 99 项通过；覆盖 header history、local native browse、remote picker/reconnect、pending profile 隔离、pointer/keyboard/Escape/outside/focus restore、current/empty 与主题 scroller。
- VER-004 / AC-001 至 AC-008：最终 `pnpm check` 通过（68 个测试文件、612 项测试、ESLint、TypeScript、Vite production build）；Rust fmt、clippy、native dialog blocking audit、profile/sensitive-field 静态审计与 `git diff --check` 通过。
- Rust 全量测试只发现未修改基线文件中的跨平台断言：macOS 下现有 `Path::is_absolute` 不把 `C:/absolute.txt` 视为绝对路径。排除该单一用例后为 248 passed、0 failed、4 ignored；`src-tauri/src/domain/git.rs` 与 HEAD 无差异。

## Completion

- AC-001 至 AC-008 均由 VER-001 至 VER-004 覆盖；没有本次新增失败、未覆盖 acceptance 或阻塞性澄清。
- `docs/qb-spec/DIRECTORY_MAP.md` 已同步 Workspace schema v10、Git MRU domain、history popover、success reporting 与 persistence boundary。
- 实现没有新增 session、SSH capability、Git command、第三方依赖或 connection profile 字段；历史只随 `workspaces.json` 原子保存。
- Close：验证完成并于 2026-08-31 无冲突归档。

## Residual Risk

- 当前环境未执行真实远端仓库失效/权限变化的桌面 smoke；既有 error/initialize 状态与自动化已证明失败不会进入历史或触发删除。
- 仓库既有 Windows 绝对路径跨平台测试仍失败，最小复验为 `cd src-tauri && cargo test domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning --lib`；与本次文件差异无关。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Completeness：目标、按 `profileId` 隔离、成功后记录、MRU 限额、失效路径、重连、schema v10、旧文档迁移、UI 可访问性、回滚与明确非目标均已定义；没有需要用户再次决定的产品语义。
- Consistency：Workspace ownership 与现有 `recentProfileIds`/`GitTarget` lifecycle 一致；专用 history model 避免把 `Unbound` 或 session runtime 写入持久层；REQ-001 至 REQ-012 均回连 AC-001 至 AC-008 和 strict TASK/VER seed。
- Critical note：实现与测试必须把“每 scope 保留最近 8 条、全局保留最近 64 条”定义为从 MRU 头部到尾部的单次确定性筛选，禁止依赖 map iteration；同一 target identity 的 refresh/mutation snapshot 不得重排。
- Compatibility note：直接验收 v9 → v10，同时保持现有全部受支持旧 schema 通过迁移链得到 v10 空历史；加载和迁移不得在显式 save 前覆盖磁盘文档。
- Non-blocking note：首期没有删除、固定、搜索和失效自动清理；这些不影响当前主路径和错误恢复的可验证性。
- Next Action：进入 strict plan，并从 schema/MRU 和成功记录时机的失败测试开始。

## Next Action

本 change 已完成实现、验证与归档；删除、固定、搜索或失效自动清理应作为独立 change 评估。
