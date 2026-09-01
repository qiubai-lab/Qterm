---
id: QB-20260901-git-conflict-resolution
type: feature
tier: strict
status: archived
created: 2026-09-01
updated: 2026-09-01
supersedes: []
---

# Git 合并冲突解决器

## Goal

在现有安全 merge/continue/abort 生命周期上补齐应用内冲突解决能力，使用户能够查看冲突双方和共同基线、编辑或选择最终结果、明确标记已解决，并在本机或 profile-bound SSH 仓库中可靠地继续合并。

## Approval

用户于 2026-09-01 明确采纳冲突解决评估中的推荐方案，要求落地 spec、plan 并开始修改。

## Scope

- 仅处理仓库处于 `MERGE_HEAD` 状态时的未合并 index entries。
- snapshot 保留冲突种类和可恢复的 merge 来源 identity，不再把全部冲突压缩成无类型布尔值。
- 用户可为单个冲突读取 index stage 1/2/3 对应的 Base、当前和传入版本，以及当前工作树结果。
- 普通、受限大小的 UTF-8 regular-file 冲突提供结果编辑、整文件采用当前/传入版本、保存并标记已解决。
- add/add、modify/delete、delete/modify 和二进制 regular-file 冲突提供适用的文件级采用当前、采用传入或删除动作。
- rename、symlink、submodule、mode-only、多 MERGE_HEAD 或无法安全分类的冲突必须明确显示为需要终端/外部工具处理，不伪装为可编辑文本。
- 本机和 profile-bound SSH Git 使用同一 domain 规则、封闭 DTO、大小限制、错误和恢复语义。
- 冲突列表打开宽版 manager dialog；列表、版本视图、结果编辑、状态和动作遵守 Qterm compact workbench 规则。

## Non-Goals

- 不支持 rebase、cherry-pick、revert、stash apply、octopus merge 或自定义 merge driver 的冲突生命周期。
- 不实现逐块接受、语义合并、自动解决、语言服务器、任意 diff/revision 查看或完整 IDE mergetool。
- 不接受 WebView 提供的 executable、shell、Git 子命令、参数数组、任意 revision/object OID/index stage selector 或工作树绝对写入路径；snapshot 可返回只读 `MERGE_HEAD` identity。
- 不自动继续合并，不自动提交普通工作区改动，不自动 Fetch/Stash，不改变现有默认 merge 策略。
- 不持久化文件内容、冲突草稿、snapshot、merge 状态或新增 Workspace schema 字段。
- 不放宽 Git-purpose SSH session/profile ownership，也不把 Git session 转换为通用 Files/SFTP session。

## Assumptions And Constraints

- index stage 1/2/3 是冲突版本的权威来源；stage 2 显示为“当前”，stage 3 显示为“传入”，缺失 stage 表示该侧不存在文件。
- merge 来源显示优先使用 `MERGE_HEAD` OID 与当前 snapshot 中匹配的 decoration；刷新后即使无法恢复原始分支显示名，也必须保持 OID identity 和“传入版本”语义。
- 首版文本上限复用 Files 的 2 MiB 限制；超过限制、非 UTF-8 或包含 NUL 的版本按 binary/unsupported 呈现，不把有损文本写回工作树。
- 工作树写回必须携带读取时 revision；文件被外部修改后必须拒绝覆盖并要求重新加载。
- “仍含冲突标记”只能作为警告；合法文件也可能包含相同文本，因此不得以字符串扫描替代 Git index 的未合并状态。
- 保存工作树和更新 index 无法组成跨文件系统/Git 的原子事务；任一步失败后必须返回或重新读取真实 snapshot，并保留可恢复状态。

## Requirements

- REQ-001：snapshot 必须为每个未合并 path 暴露稳定的冲突种类，至少区分双方修改、双方新增、当前删除/传入修改、当前修改/传入删除及其他；类型必须来自 machine-readable Git 状态而非 UI 文案推断。
- REQ-002：merge 进行中必须暴露可从真实仓库重建的 incoming identity；刷新、重新挂载或 SSH 重连不得依赖仅内存的发起操作记录来标识传入版本。
- REQ-003：用户选择冲突 path 后必须能读取 Base、当前、传入和工作树结果的有界详情；每一侧必须显式表达 missing、text、binary 或 unsupported，且 path 必须仍属于当前仓库的未合并 index entry。
- REQ-004：普通 UTF-8 regular-file 冲突必须允许用户编辑结果，并以 expected revision 防止覆盖外部修改；成功写回后必须返回新的 revision 或最新冲突详情。
- REQ-005：适用的 regular-file 冲突必须提供封闭的“采用当前”“采用传入”“删除结果”动作；不存在对应侧、unsupported kind 或非 merge state 时必须在 mutation 前拒绝。
- REQ-006：标记已解决必须只更新明确选择的冲突 path，不得隐式 `git add -A`、暂存其他工作区更改或自动继续合并；删除结果使用等价的安全 index 更新语义。
- REQ-007：保存成功但暂存失败、外部文件变化、权限失败、SSH 断线、超时或输出超限时，界面必须显示稳定错误并重新读取或保留最后可确认状态，不得宣称冲突已解决。
- REQ-008：所有冲突被 Git index 判定为已解决后，必须复用现有后端 continue 校验与非交互 merge commit；abort 的确认、真实恢复和焦点行为保持兼容。
- REQ-009：Git Block 必须提供宽版 manager dialog：可滚动冲突列表、明确选中态、Base/当前/传入 peer tabs、独立可滚动结果编辑区、固定状态和动作区；核心动作无需 hover 即可发现。
- REQ-010：解决器必须支持键盘选择、tab semantics、Escape/关闭、未保存结果离开确认、嵌套确认 topmost ownership、焦点恢复、窄窗口和 reduced-motion；状态不能只靠颜色表达。
- REQ-011：本机与 SSH 必须使用同一冲突模型和应用层前置规则；SSH 只通过已授权的 Git-purpose session/profile 执行封闭 conflict detail/resolve 请求，并保持 POSIX literal、stdin 大小、超时和输出上限。
- REQ-012：现有 stage/unstage、commit、聚合主按钮、merge/continue/abort、commit graph、仓库历史、操作记录和 Files 编辑器行为必须保持兼容；merge 状态下原“暂存全部”不得成为无提示的冲突批量解决入口。

## Primary, Alternate And Recovery Scenarios

1. 用户打开普通双方修改冲突，比较 Base/当前/传入，编辑结果，确认保存并标记已解决；列表进入下一项，全部解决后继续合并可用。
2. 用户在 add/add 冲突中采用传入版本或手动编辑；缺失 Base 被清楚标记，不显示伪造空文本。
3. 用户在 modify/delete 冲突中选择保留存在的一侧或删除结果；动作完成后只有当前 path 从未合并 index 消失。
4. 二进制 regular-file 不进入文本编辑器，只提供存在且安全的整文件侧选择或删除。
5. unsupported conflict 显示类型和外部处理说明；用户在终端解决并刷新后，列表和 continue gating 从真实 snapshot 恢复。
6. 文件在详情加载后被外部编辑；保存被 revision conflict 拒绝，用户可重新加载且外部内容不被覆盖。
7. 写回成功但 stage 失败；工作树保留写回结果，冲突仍未解决，错误说明下一步并允许重试。
8. SSH 在详情读取或解决期间断开；最近确认的详情保持可见但禁止 mutation，重连刷新后恢复真实状态。
9. 用户带未保存结果关闭解决器或切换文件；先出现确认，取消后保留草稿并恢复焦点。
10. 用户中止 merge；沿用现有危险确认，完成后关闭解决器并清除冲突状态。

## Acceptance Criteria

- AC-001 [REQ-001, REQ-002]：parser/domain 测试使用 `UU`、`AA`、`DU`、`UD` 和 unknown fixture 证明 conflict kind 与 incoming identity 可从真实状态重建并正确映射到 DTO/TypeScript。
- AC-002 [REQ-003]：真实本机仓库 fixture 证明 conflict detail 返回正确的 index stage 1/2/3 内容、缺失侧、工作树 revision，并拒绝非冲突 path、路径逃逸、超限和非法输入。
- AC-003 [REQ-004, REQ-006, REQ-007]：真实本机仓库测试证明匹配 revision 的文本结果可写回并只暂存当前 path；外部修改、权限/写入或 stage 失败不会覆盖新内容或伪装为已解决。
- AC-004 [REQ-005, REQ-006]：真实 Git fixture 覆盖 add/add、modify/delete、delete/modify 和 binary regular-file 的适用侧选择/删除；不存在侧和 unsupported kind 在 mutation 前拒绝。
- AC-005 [REQ-008, REQ-012]：完整 merge fixture 证明多冲突逐项解决、continue 和 abort 保持真实仓库语义；merge 状态下普通 stage-all 不会无提示批量标记冲突。
- AC-006 [REQ-009, REQ-010]：Testing Library 覆盖 manager dialog 的列表/详情、版本 tabs、编辑/保存/侧选择、loading/error/unsupported、未保存确认、键盘、Escape 和焦点恢复。
- AC-007 [REQ-009, REQ-010]：样式契约和受限视口检查证明 manager dialog 使用 semantic tokens、单一滚动 owners、固定动作区、可见 focus、窄窗口和 reduced-motion。
- AC-008 [REQ-011]：strict DTO、domain action 和 SSH manager/session 测试证明 Git-purpose/profile ownership、封闭 action、POSIX literal、stdin/输出上限和本机/SSH 等价；任意 command/args/revision/OID/path escape 无法进入 IPC。
- AC-009 [REQ-007, REQ-011]：SSH 聚焦测试覆盖 detail/resolve 成功契约、断线/ownership/超时失败和最新 snapshot 恢复；环境允许时运行 ignored real-SSH lifecycle。
- AC-010 [REQ-012]：既有 Git/Files 前端与 Rust 回归、`pnpm check`、Rust fmt/clippy/tests、固定命令静态审计和 diff hygiene 通过；无 Workspace schema、持久化或非 Git session 权限变化。

## Non-Functional Requirements

- NFR-001：冲突文本和工作树结果单项最多 2 MiB；Git/SSH 输出继续受 8 MiB 上限，mutation 继续使用 60 秒超时，详情读取使用既有只读超时级别。
- NFR-002：所有仓库 path 输入使用 relative literal path 并在后端验证；本机 canonical root containment 与远程 POSIX path 校验不得依赖前端。
- NFR-003：失败详情进入 WebView 前保持有界、脱敏，不包含命令、凭据、remote URL userinfo 或临时文件名。
- NFR-004：不新增通用 shell/文件写入 IPC、Workspace schema、持久化数据或额外 SSH session；新增依赖仅在无法用现有 CodeMirror 能力满足首版时单独评估。
- NFR-005：冲突解决器在 `min(790px, calc(100vw - 48px))` 级别 manager surface 内工作，列表与编辑区各自拥有滚动，固定 header/footer 不因反馈消息改变几何。

## Behavior Delta

### ADDED

- REQ-001：未合并 change 新增稳定 conflict kind。
- REQ-002：merge snapshot 新增可恢复 incoming identity。
- REQ-003：Git 新增有界 Base/当前/传入/结果详情读取能力。
- REQ-004：普通文本冲突新增带 revision 的结果编辑与安全写回。
- REQ-005：适用冲突新增采用当前、采用传入和删除结果动作。
- REQ-009：Git Block 新增冲突解决 manager dialog。
- REQ-011：Git-purpose SSH 新增封闭 conflict detail/resolve 能力。

### MODIFIED

- REQ-006：冲突行从“假设用户已在外部解决后直接 stage”改为优先进入解决器并只标记明确处理的 path。
- REQ-008：continue 的 UI readiness 从通用 stage 操作结果扩展为解决器和外部操作共同驱动的真实 index 状态。
- REQ-012：merge 状态下“暂存全部”从可直接执行 `git add -A` 改为受限或明确说明的冲突处理入口；普通非 merge 状态行为不变。

## Architecture Boundary Check

- Boundary Decision：conflict kind、可用 resolution、merge state 和 path/revision 前置条件属于 Git domain/application；index/blob/工作树/SSH 命令属于 infrastructure；commands 只映射严格 DTO；React 只拥有草稿、选择、焦点和 presentation。
- Placement：`domain/git.rs` 增加冲突模型与 validators；Git ports/application 增加 detail/resolve 用例；local/SSH adapters 实现固定 `ls-files`/index-stage 读取与封闭写回；`src/lib/tauri/git.ts` 提供窄 client；`src/git/` 实现 feature-local manager。
- Model Separation：Rust domain model、Tauri DTO、TypeScript transport model 和前端草稿状态保持显式映射；不复用 Files DTO 作为 Git domain，也不把工作树 absolute path 暴露为 resolution identity。
- Tradeoff：复用 Files 的 revision 算法/大小常量和 CodeEditor 展示能力，但不复用 Files-purpose command；Git-purpose SSH 必须保持 profile ownership。首版不抽象通用 diff editor。

## Critical Behavior Protection

- Coverage Decision：该功能覆盖/删除工作树文件、修改 Git index 并跨本机/SSH 执行，必须先建立 domain/parser/真实 Git/strict DTO/SSH ownership 失败测试。
- Required Coverage：冲突分类、stage blobs、path containment、revision race、文本写回、side/delete resolution、单 path staging、continue/abort、多冲突、SSH session/profile ownership、UI 未保存/错误/焦点。
- Gaps：真实平台权限模型、第三方 merge driver、submodule server 和各平台 symlink 权限不作为自动化首版 fixture；这些类型保持明确 unsupported，使用手工 smoke 和固定失败语义补充。

## Rollback And Compatibility

- 前端可移除解决器入口并恢复原冲突 stage 行；后端可移除 conflict detail/resolve DTO 与 ports，而现有 merge/continue/abort 保持可用。
- 变更不迁移数据库、Workspace 或持久化文件；回滚不会要求数据转换。
- 已经写入工作树或 index 的用户 resolution 属于真实 Git 状态，代码回滚不得自动撤销；用户仍可继续使用 Git CLI 或现有 abort merge。

## Quality Review

- Result：PASS WITH NOTES。
- Traceability：REQ-001 至 REQ-012 均有 AC 覆盖，Behavior Delta 与需求闭合；strict plan 必须继续提供 TASK/VER 映射。
- Notes：rename/symlink/submodule/mode-only 保持显式 unsupported；逐块编辑和其他 Git operation conflicts 另立 change，不阻塞首版。

## Open Issues

- 无阻塞项。首版使用现有 CodeEditor 的版本 tabs + 结果编辑，不新增 `@codemirror/merge`；若实现中证明缺少逐块语义才在后续 change 评估依赖。

## Next Action

本 change 已完成实现、验证和 conflict-free 归档；rebase/cherry-pick 等其他 operation conflict、逐块合并和真实 SSH 冲突环境 smoke 需要独立 change。

## Verification Evidence

- VER-001 / AC-001：domain/status parser 测试覆盖 `UU`、`AA`、`DU`、`UD`、`DD` 与 unknown 映射，snapshot 从真实 `MERGE_HEAD` 重建 incoming identity；strict DTO 和 TypeScript 编译证明 camelCase 映射闭合。
- VER-002 / AC-002 至 AC-004：本机临时真实 Git 仓库 fixture 覆盖 stage 1/2/3、缺失 Base/侧、工作树 revision、非冲突 path、2 MiB 超限、UTF-8 文本、二进制、AA、DU、UD、侧选择、删除、external revision race 与单 path stage；路径逃逸和有界内容由 domain/service validator 测试直接覆盖。
- VER-003 / AC-005：真实 merge lifecycle 覆盖冲突发现、stage-all 拒绝、continue gating、abort、文本保存后继续和 merge commit；新增 domain `validate_stage_all` 同时由 local/SSH adapter 使用。
- VER-004 / AC-006：`GitConflictResolver.test.tsx` 与 `GitPane.operations.test.tsx` 覆盖三方 tabs、结果编辑、expected revision payload、二进制文件级动作、dirty switch/close、Escape topmost、触发器焦点恢复、逐项 snapshot 和 continue/abort 接线。
- VER-005 / AC-007：`gitStyles.test.ts` 覆盖 790px manager surface、210px/窄屏 170px sidebar、列表独立 scroller、编辑区 overflow owner、固定 action row、semantic token、focus-visible 和 reduced-motion。
- VER-006 / AC-008：command DTO 测试拒绝任意 command/args/stage/revision selector/unknown resolution 字段；domain 限制 path/content/revision；SSH manager 测试验证 Git-purpose/profile ownership、POSIX path escape 拒绝和专用 detail/resolve control。
- VER-007 / AC-009：SSH detail/resolve manager/session 契约、断线错误映射、profile ownership 与专用 Git session 编译/测试通过；真实 OpenSSH Git conflict lifecycle 因环境 fixture 未提供而保留为残余 smoke 风险。
- VER-008 / AC-010：`pnpm check` 通过 ESLint、当时 73 个测试文件/651 项测试、TypeScript 和 Vite production build；新增收尾测试后 `pnpm test` 为 73/652 全通过。
- VER-009 / AC-010：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `cargo test --all-targets --all-features` 通过；Rust 全量结果为 274 passed、0 failed、4 个环境型 ignored，收尾 domain/真实 Git/SSH 聚焦测试再次通过。
- VER-010 / AC-008、AC-010：固定输入静态审计与 `git diff --check` 通过；未新增 executable/shell/args/任意 OID或 revision selector、依赖、Workspace schema、持久化字段或额外 SSH session。

## Completion

- AC-001 至 AC-010 均由 VER-001 至 VER-010 覆盖；没有本次新增失败或阻塞性澄清。
- `docs/qb-spec/DIRECTORY_MAP.md` 已同步 resolver、transport、domain/application/ports、本机 Git 和 Git-purpose SSH owner/边界。
- Close：2026-09-01 验证完成并无冲突归档。

## Residual Risk

- 没有运行需要真实 `sshd`/SFTP/Git 环境的端到端 SSH 冲突 lifecycle；自动化已覆盖同一 domain 模型、严格 DTO、manager ownership、session control 和失败映射，真实服务端权限/断线时序仍需手工 smoke。
- SFTP 基础读取接口把远端“文件不存在”和部分“文件不可读”统一收敛为 unavailable；解决器会重新以 Git index/snapshot 为事实源且不会宣称已解决，但个别服务端权限错误可能显示为通用读取失败或缺失结果。
- Vite 仍报告仓库既有的 500 kB chunk size warning；冲突编辑器沿用已有 lazy `CodeEditor` chunk，未新增依赖或新的同步首屏 editor bundle。
