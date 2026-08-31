---
id: QB-20260831-development-configuration-isolation
type: design
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
supersedes: []
---

# Development Configuration Isolation

## Approval

用户于 2026-08-31 明确采纳按 Rust 构建模式隔离配置的方案，并要求落地 spec、plan 后开始实现。批准范围是让 `pnpm tauri dev` 自动使用开发专属 locator 与默认配置根，同时保持正式构建路径和现有自定义目录语义不变。

## Goal

让开发版 Qterm 默认不再读取或写入正式版的 locator、连接、凭证、Workspace、设备设置和缓存，避免开发中的 schema、测试数据或未完成行为污染正式使用环境。

## Change Shape

- Type：`design`。变更由构建通道、启动路径解析、数据隔离和兼容性约束主导。
- Tier：`strict`。locator 决定包含加密凭证和 Workspace 在内的全部配置根，属于数据隔离边界。
- Affected users：同时运行本地开发版与已安装正式版的 Qterm 开发者；普通正式版用户的路径和数据不应发生变化。

## Current Behavior And Constraints

- 组合根固定读取 `~/.qterm-location.json`，缺失或不可用时固定回退 `~/.qterm`；debug 与 release 构建因此共享同一套数据。
- `ConfigurationDirectory::from_input` 把空值、`~` 和 `~/.qterm` 硬编码为同一个默认根；只改启动代码会使开发版在设置页“恢复默认”后重新指向正式目录。
- `data/`、`device/`、`cache/` 的分层结构、严格 schema、原子写入和“修改根目录后重启生效”行为保持不变。
- 不修改真实用户配置，不读取、复制、合并、迁移、覆盖或删除正式版或旧开发版数据。
- Tauri Commands → Application → Domain / Ports ← Infrastructure 的依赖方向保持不变；构建模式和 home 下的物理命名属于组合根路径策略。

## Requirements

- REQ-001：启用 Rust `debug_assertions` 的桌面构建必须使用 `~/.qterm-location.dev.json` 作为 locator，并在 locator 缺失、损坏、不兼容或不可访问时回退到 `~/.qterm-dev`。
- REQ-002：未启用 Rust `debug_assertions` 的正式构建必须继续使用 `~/.qterm-location.json` 和默认 `~/.qterm`，不得要求迁移或改写现有正式配置。
- REQ-003：开发构建不得把正式 locator 作为兼容 fallback，也不得因开发 locator 缺失或异常而读取正式默认根；正式构建同样不得读取开发 locator 或开发默认根。
- REQ-004：每个构建模式保存自定义配置根时只能写入自己的 locator；初始化目标 `data/`、`device/`、`cache/` 的既有行为不变，不自动搬迁任一模式的数据。
- REQ-005：设置快照必须返回当前构建模式的默认根；设置页“恢复默认”、空输入保存和派生路径预览必须使用该值，开发版不能硬编码或回退到 `~/.qterm`。
- REQ-006：构建模式选择和 locator/default-root 物理路径必须由 Rust 组合根拥有并注入 settings 边界；domain 只校验/展开用户目录输入，不依赖 Tauri、Cargo profile 或硬编码开发/正式通道。
- REQ-007：本次不得把 locator 写入可执行程序、应用包、AppImage 挂载目录或 Cargo `target/`；不得新增环境变量、CLI 参数或用户手工准备步骤才能安全运行 `pnpm tauri dev`。

## Non-Functional Requirements

- NFR-001：路径选择必须是启动前的确定性纯规则，并能在单元测试中覆盖 debug/release 两个分支，而不依赖实际发布构建或修改用户 home。
- NFR-002：locator 的 schema、大小限制、损坏/未来版本保护和原子写入规则保持不变。
- NFR-003：IPC 只新增 UI 恢复默认所需的非敏感默认根字符串，不暴露 locator 文件路径、凭证明文或构建环境细节。

## Non-Goals

- 不为开发版增加 `com.qiubai.qterm.dev` identifier，也不隔离 Tauri window-state、WebView 数据或框架缓存。
- 不支持 beta/nightly/preview 等额外发布通道，不新增运行时通道切换。
- 不迁移当前 `~/.qterm-location.json`、`~/.qterm` 或任何自定义正式配置根。
- 不自动导入开发者此前存放在正式根中的测试数据。
- 不改变配置文档 schema、凭证加密、host-key、Workspace 或 cache 内容格式。
- 不新增“程序目录 portable mode”。

## Observable Acceptance

- AC-001（REQ-001, REQ-002, REQ-006, NFR-001）：纯路径策略测试同时证明 Development 映射到 `~/.qterm-location.dev.json`/`~/.qterm-dev`，Production 映射到 `~/.qterm-location.json`/`~/.qterm`；当前 debug 测试构建选择 Development。
- AC-002（REQ-001, REQ-003, NFR-002）：临时 home 只有正式 locator 时，Development 仍选择 `~/.qterm-dev`；开发 locator 损坏/未来版本时也回退开发默认且正式 locator 字节不变。
- AC-003（REQ-002, REQ-003, NFR-002）：临时 home 只有开发 locator 时，Production 仍选择 `~/.qterm`，且不读取或改写开发 locator。
- AC-004（REQ-004, NFR-002）：Development/Production 分别保存自定义根时，只生成各自 locator 并初始化目标三个分区；另一模式 locator 和目标目录不被创建、修改或删除。
- AC-005（REQ-005, REQ-006, NFR-003）：settings snapshot/IPC 返回 `defaultRootDirectory`；开发默认输入解析、恢复默认控件和路径预览使用 `~/.qterm-dev` 对应值，正式快照继续使用 `~/.qterm`。
- AC-006（REQ-005）：用户在开发版明确输入 `~/.qterm` 时仍可将其作为自定义绝对根保存；只有恢复默认和空值/`~` 语义自动选择开发默认，避免隐藏禁止既有自定义目录能力。
- AC-007（REQ-002, REQ-007）：`pnpm tauri dev` 无需额外参数即可由 debug profile 选择开发路径；正式构建源代码路径保持原值，源码中不使用 `current_exe`、`target/debug` 或程序目录作为 locator。

## Behavior Delta

### ADDED

- REQ-001：debug 构建新增独立 locator 与默认配置根。
- REQ-003：新增开发/正式 locator 和默认根双向隔离不变量。
- REQ-005：设置快照新增当前构建模式默认根，并用于恢复默认与预览。

### MODIFIED

- REQ-002：原“所有构建固定使用 `~/.qterm-location.json`/`~/.qterm`”变为仅正式构建保持该行为；正式用户兼容性不变。
- REQ-004：原单 locator 保存行为变为按构建模式写入对应 locator，目标分区初始化和不迁移数据行为不变。
- REQ-006：原由 domain 硬编码 `~/.qterm` 默认值的行为变为组合根选择并注入默认根；domain 继续负责用户输入校验和 tilde 展开。

## Options Evaluated

### Option A：按 `debug_assertions` 使用两套 home 路径（采用）

- 成本：低到中；需要组合根路径策略、settings 默认值注入和前后端快照调整。
- 风险：debug build 一律视为开发通道，包括显式 `tauri build --debug`；这符合隔离目标。
- 维护性：无需开发者记忆额外参数，`pnpm tauri dev` 默认安全；正式路径完全兼容。

### Option B：写入当前可执行程序旁边

- 成本：表面低，跨平台兼容成本高。
- 风险：应用包/系统安装目录/AppImage 不保证可写，Cargo target 可被清理，路径随打包和更新变化。
- 维护性：无法为当前 macOS/Windows/Linux 发布矩阵提供稳定契约。

### Option C：使用独立 Tauri identifier 和系统 app-config/app-data

- 成本：中；还会改变 Tauri 框架数据、应用显示名和启动脚本。
- 风险：范围超过当前核心配置混用问题，需要新的打包与桌面识别验证。
- 维护性：适合后续完整开发 flavor，本次不采用。

## Recommendation

采用 Option A。组合根通过一个可测试的 `BuildMode -> ConfigurationStoragePaths` 规则决定 locator 与默认根；当前模式来自 `cfg!(debug_assertions)`。`ConfigurationDirectory` 接收已验证的默认根处理空输入/`~`，settings snapshot 把默认根投影到 IPC，前端恢复按钮不再硬编码生产路径。

## Architecture Boundary Decision

- Placement：构建模式和 home 下文件名放在 `src-tauri/src/lib.rs` 组合根附近；JSON repository 只接收 locator 具体路径，`DataPaths` 只从已选根派生分区。
- Domain/Application：`ConfigurationDirectory` 只拥有绝对路径、tilde 展开和“使用注入默认值”的输入规则；`SettingsService` 持有默认/活动/已配置根并将默认根纳入 snapshot。
- Transport/UI：settings command 只投影 `defaultRootDirectory`，React 只消费该值恢复默认和预览，不推断 debug/release。
- Model separation：build mode、domain directory、IPC DTO 和 JSON locator document 保持分离。
- Tradeoff：本次不抽取通用多 channel 框架；两个编译模式由小型纯规则表达，避免过度设计。
- Critical behavior signal：模式隔离、异常 fallback、保存 owner 和设置恢复默认需要先补聚焦自动化保护。

## Strict Traceability Seed

- TASK-001（REQ-001 至 REQ-004, REQ-006, REQ-007）：建立可测试 build mode/storage path 策略及组合根装配，先覆盖双模式路径与无跨 locator fallback。
- TASK-002（REQ-005, REQ-006）：让 domain/application 使用注入默认根，并在 settings snapshot/IPC 增加默认根。
- TASK-003（REQ-005）：更新 TypeScript settings contract、设置页恢复默认和路径预览，移除生产默认根硬编码。
- TASK-004（REQ-001 至 REQ-007）：更新长期产品/架构/决策 context，完成聚焦和仓库质量验证。
- VER-001（AC-001 至 AC-004, AC-007）：Rust 路径策略、locator repository 与组合根聚焦测试。
- VER-002（AC-005, AC-006）：Rust settings domain/service/command 测试与 SettingsDialog/TypeScript 回归。
- VER-003（AC-001 至 AC-007）：`pnpm check`、Rust fmt/clippy/test、源码路径审计与 `git diff --check`。

## Risks And Rollback

- Debug 构建首次启动会看到空的开发配置，这是隔离后的预期行为；不会自动复制正式连接或凭证。
- 开发者仍可在设置页明确选择 `~/.qterm` 或其他正式自定义根；这属于显式操作，不是自动 fallback。
- 回滚代码后 debug 构建会重新读取正式 locator；回滚前无需删除开发目录，开发数据会保留但旧代码不读取。
- 若未来增加独立 Tauri identifier，应作为新的 change 同时评估窗口状态、WebView 数据、应用显示名和打包行为。

## Quality Check

- REQ-001 至 REQ-007 均由 AC-001 至 AC-007 覆盖；Behavior Delta 描述了开发隔离、正式兼容和默认值 owner 的变化。
- 主路径覆盖 dev/release 启动、保存和恢复默认；错误/恢复路径覆盖 locator 缺失、损坏、未来版本和存储不可用 fallback。
- NFR 覆盖确定性、严格持久化保护和非敏感 IPC。
- 用户已批准唯一推荐方案；无阻塞性产品或迁移问题。

## Verification Evidence

- VER-001 / AC-001 至 AC-004、AC-007：`cargo test configuration_storage --lib --all-features` 通过（6 项），`cargo test current_build_mode --lib --all-features` 在 debug profile 通过（1 项）。临时 home 测试覆盖双模式路径矩阵、单侧 locator、损坏/未来版本/存储不可用 fallback、owner-only 保存和三个目标分区初始化；测试未访问真实 home。
- VER-002 / AC-005、AC-006：`cargo test settings --lib --all-features` 通过（18 项）。domain、application 和 command 测试证明空输入/`~` 使用注入默认根、开发默认可为 `~/.qterm-dev`、显式 `~/.qterm` 仍作为自定义绝对路径保留，并且 IPC 输出 `defaultRootDirectory`。
- VER-003 / AC-005：`pnpm vitest run src/components/dialogs/SettingsDialog.test.tsx src/lib/tauri/settings.test.ts` 通过（12 项）；`pnpm check` 通过（68 个测试文件、613 项测试，以及 ESLint、TypeScript 和 Vite production build）。设置页恢复默认和 data/device/cache 预览均使用后端返回的开发默认根。
- VER-004 / AC-001 至 AC-003、AC-007：`cargo test --release current_build_mode --lib --all-features` 通过，证明 release profile 选择 Production；`cargo check --release --all-features` 通过，正式路径分支可编译。
- VER-005 / AC-001 至 AC-007：`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、禁止 `current_exe|target/debug|executable_dir` 的源码审计和 `git diff --check` 均通过。排除一个未修改基线文件中的既有跨平台 Git 用例后，`cargo test --all-targets --all-features` 为 255 passed、0 failed、4 ignored。

## Completion

- AC-001 至 AC-007 均有直接自动化证据，开发构建使用 `~/.qterm-location.dev.json`/`~/.qterm-dev`，正式构建继续使用 `~/.qterm-location.json`/`~/.qterm`，两个模式没有自动交叉 fallback。
- Settings domain/application/IPC/React 已统一消费组合根注入的默认配置根；开发版恢复默认不会重新指向正式根，显式自定义能力保持不变。
- PRODUCT、ARCHITECTURE、DECISIONS 和 Directory Map 已同步长期决策；没有读写、复制、迁移或删除真实用户配置。
- Close：实现和本次范围验证完成，于 2026-08-31 无冲突归档。

## Residual Risk

- Tauri identifier 仍然相同，因此 window-state、WebView 数据和其他框架管理数据不在本次隔离范围；核心 Qterm locator、data、device 和 cache 已隔离。
- Rust 全量门禁仍有一个仓库既有失败：macOS 下 `domain::git::tests::rejects_branch_and_path_values_that_can_change_git_argument_meaning` 期望 `C:/absolute.txt` 被 `Path::is_absolute` 识别为绝对路径。`src-tauri/src/domain/git.rs` 与 HEAD 一致，且同日已归档的其他 change 也记录了该基线问题；应作为独立 Git 领域修复处理。

## Independent Spec Review

- Result：`PASS WITH NOTES`。规格语义、兼容范围和 strict traceability 足以进入 planning。
- Findings：没有阻塞性缺口。唯一非阻塞备注是开发者仍能明确把自定义根选为 `~/.qterm`；AC-006 已把它定义为保留的显式能力，而不是自动 fallback，因此不削弱默认隔离验收。
- Traceability：REQ-001 至 REQ-007 均有 AC 覆盖；AC-001 至 AC-007 均映射到 VER-001 至 VER-003；Delta 覆盖新增开发隔离、正式兼容与默认路径 owner 变化。
- Context consistency：本变更细化 2026-08-23 的稳定配置根决策，对正式构建不做替换；长期 PRODUCT/ARCHITECTURE/DECISIONS 需要在实施中同步 debug 构建例外。
- Next Action：按 strict tier 写入 execution plan。

## Open Issues

- 无阻塞实现的问题。
- 非阻塞后续候选：独立 `com.qiubai.qterm.dev` identifier 可进一步隔离 Tauri 管理的数据，但不属于本 change。

## Next Action

本 change 已完成实现、验证与归档；若要进一步隔离 Tauri 框架数据，应独立评估开发 identifier 和打包行为。
