---
id: QB-20260831-development-configuration-isolation
tier: strict
status: archived
created: 2026-08-31
updated: 2026-08-31
spec: spec.md
---

# Development Configuration Isolation Plan

## Background

Qterm 的 Rust 组合根目前在所有构建中固定读取 `~/.qterm-location.json` 并默认使用 `~/.qterm`，导致 `pnpm tauri dev` 与正式安装版共享连接、凭证、Workspace 和设备设置。用户已批准按 Rust debug/release 构建模式使用两套 home 路径，并要求保持正式路径兼容。

## Requirement

实施 spec 的 REQ-001 至 REQ-007，完整覆盖 AC-001 至 AC-007、NFR-001 至 NFR-003。

## Non-Goals

- 不增加独立 Tauri identifier、应用显示名或开发启动脚本。
- 不写入程序目录、Cargo target 或系统 app-config/app-data。
- 不迁移、复制或删除任何正式/开发配置。
- 不改变 locator 及其他配置文档 schema。

## Architecture Impact

- 在 `src-tauri/src/lib.rs` 组合根附近增加私有 `BuildMode` 与 `ConfigurationStoragePaths` 纯路径策略；`BuildMode::current()` 只映射 `cfg!(debug_assertions)`，setup 使用其结果注入 locator repository 和默认配置根。
- 抽出可测试的 active-configuration fallback helper，使 locator 缺失/异常只回退当前模式默认根，不建立跨 locator fallback。
- `JsonConfigurationDirectoryRepository` 保持只接收具体 locator path，不感知 build mode。
- `SettingsService` snapshot 增加注入的默认配置根；command/React 只消费投影结果。

## Domain Model Impact

- `ConfigurationDirectory` 不再拥有固定 `~/.qterm` 默认命名。
- `from_input` 接收调用方注入的 `default_configuration_directory`；空值和 `~` 返回该默认值，`~/...` 继续展开为显式绝对路径。
- 在开发模式明确输入 `~/.qterm` 会展开到正式默认目录并作为自定义根保存；恢复默认控件不会生成该输入。

## API Impact

- `SettingsSnapshot.general` 新增 `defaultRootDirectory: string`。
- 现有字段、commands 和输入 DTO 不移除、不改名；locator 文件路径与 build mode 不进入 IPC。

## Database Impact

- 无数据库或配置 schema 变更。
- 新增 debug 模式物理文件 `~/.qterm-location.dev.json`，内容继续使用 configuration location schema v1。
- 新增 debug 默认根 `~/.qterm-dev/{data,device,cache}`；仅在 debug 应用实际启动或保存该根时创建。

## Affected Files

- `src-tauri/src/lib.rs`
- `src-tauri/src/domain/settings.rs`
- `src-tauri/src/application/settings_service.rs`
- `src-tauri/src/commands/settings.rs`
- `src/lib/tauri/settings.ts`
- `src/components/dialogs/SettingsDialog.tsx`
- `src/components/dialogs/SettingsDialog.test.tsx`
- `docs/qb-spec/context/{PRODUCT_SPEC,ARCHITECTURE_SPEC,DECISIONS}.md`
- `docs/qb-spec/DIRECTORY_MAP.md`（只更新已有 composition-root/settings 职责描述，不新增模块）

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-002, REQ-003, REQ-006, REQ-007, AC-001, AC-002, AC-003, AC-007] 先在 `lib.rs` 补双模式路径、当前 debug 模式和跨 locator 隔离测试，再实现 `BuildMode`/`ConfigurationStoragePaths` 与 setup 注入。
- [x] TASK-002 [depends: TASK-001] [REQ-004, AC-004] 使用两个模式的具体 locator repository fixture 验证保存只写 owner locator、初始化目标分区且不触碰另一模式，再保持既有 repository 实现并补必要组合测试。
- [x] TASK-003 [REQ-005, REQ-006, AC-005, AC-006] 先修改 settings domain/service/command 测试表达注入默认根和 `defaultRootDirectory`，再调整 `ConfigurationDirectory`、snapshot 与 DTO。
- [x] TASK-004 [depends: TASK-003] [REQ-005, AC-005] 先更新 SettingsDialog fixture/test 证明恢复默认和路径预览使用后端值，再更新 TypeScript contract 与 UI，移除 `~/.qterm` 硬编码。
- [x] TASK-005 [depends: TASK-001, TASK-003] [REQ-001 至 REQ-007] 同步 PRODUCT、ARCHITECTURE、DECISIONS 与 Directory Map 的长期路径规则，保留正式兼容和 Tauri framework data 非隔离边界。
- [x] TASK-006 [depends: TASK-001 至 TASK-005] [REQ-001 至 REQ-007, AC-001 至 AC-007] 运行 strict 验证、记录真实证据并在无冲突时归档 change。

## Dependencies And Parallel Work

- 无新第三方依赖；只使用 Rust 编译配置、现有 Tauri home resolver 和现有 repositories。
- TASK-001 与 TASK-003 可概念并行，但共享 `ConfigurationDirectory` 的构造契约；本次单 agent 先稳定路径策略，再调整 settings 边界。
- 当前工作树存在用户的 Git/Workspace 改动；本计划只修改列出的 settings/path/docs 范围，不格式化或改写无关文件。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | VER-001：debug/release 纯路径矩阵与 `BuildMode::current()` debug 测试；VER-004：release focused test。 |
| AC-002, AC-003 | VER-001：临时 home 单侧 locator、损坏/未来 locator 与字节保留测试。 |
| AC-004 | VER-001：两个模式 repository 保存 owner、目标分区与非 owner 不变测试。 |
| AC-005 | VER-002、VER-003：Rust snapshot/DTO 与 SettingsDialog 默认值/预览回归。 |
| AC-006 | VER-002：开发默认注入下显式 `~/.qterm` 展开及空值/`~` 恢复默认测试。 |
| AC-007 | VER-001、VER-004、VER-005：当前 build mode、release 编译/测试与禁止程序目录路径源码审计。 |

## Test Plan

- VER-001 [AC-001 至 AC-004, AC-007]：`cd src-tauri && cargo test configuration_storage --lib --all-features`，覆盖双模式路径、当前 debug 模式、单侧/异常 locator fallback、owner 保存和非 owner 保留。
- VER-002 [AC-005, AC-006]：`cd src-tauri && cargo test settings --lib --all-features`，覆盖注入默认根、显式 tilde 路径、snapshot 和 DTO。
- VER-003 [AC-005]：`pnpm vitest run src/components/dialogs/SettingsDialog.test.tsx src/lib/tauri/settings.test.ts`，覆盖 IPC contract、开发默认恢复和派生路径预览。
- VER-004 [AC-001, AC-002, AC-003, AC-007]：`cd src-tauri && cargo test --release current_build_mode --lib --all-features` 与 `cargo check --release --all-features`，证明 release 模式选择和正式编译路径。
- VER-005 [AC-001 至 AC-007]：运行 `pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`、`rg 'current_exe|target/debug|executable_dir' src-tauri/src/lib.rs src-tauri/src/domain/settings.rs` 和 `git diff --check`。

## Rollback Plan

- 回退 `BuildMode` 路径策略和 settings 默认根字段即可恢复单一正式路径；configuration location schema 未变。
- 回滚不删除 `~/.qterm-location.dev.json` 或 `~/.qterm-dev`，其中数据保持可恢复但旧代码不读取。
- 如果回滚后的 debug build 再次读取正式配置，应在继续开发前重新应用隔离变更，而不是移动或删除用户正式数据。

## Risks

- Debug 用户首次看到空配置可能误以为数据丢失；这是不读取正式配置的预期，正式数据原样保留。
- `debug_assertions` 也适用于显式 debug bundle；该构建使用开发数据是已批准行为。
- 明确选择正式根仍可人为共享数据；UI 不自动推荐该路径，本次保留现有绝对目录能力。
- IPC 新字段要求所有 SettingsSnapshot 测试 fixture 同步，否则 TypeScript 或组件测试会暴露遗漏。

## Documentation Updates

- PRODUCT_SPEC：区分正式与 debug locator/default root，说明用户自定义整根能力不变。
- ARCHITECTURE_SPEC：记录 build mode 由组合根解析并注入，settings/domain/UI 不推断通道。
- DECISIONS：新增“开发构建与正式构建隔离配置根”的 accepted 决策。
- DIRECTORY_MAP：更新 `lib.rs`、settings domain/application/IPC 的职责描述；不新增结构节点。

## Style Context

- 不涉及新的 UI 视觉或交互模式；SettingsDialog 只把现有恢复默认按钮从硬编码值改为后端提供值。
- 既有 TypeScript/Rust 命名、两空格/四空格格式和薄 command 边界继续适用。

## Trigger Signals

- Architecture boundary：已触发；build mode 只能留在组合根，不能进入 domain/React。
- Critical behavior：已触发；双向隔离、异常 fallback 和恢复默认必须先有聚焦自动化保护。
- Directory Map：只有职责文字变化，无目录结构变化；按计划更新现有条目即可。

## Verification Result

- VER-001：configuration storage 聚焦测试 6 项和当前 debug mode 测试 1 项通过，覆盖双模式映射、无交叉 fallback、异常 fallback、owner-only locator 保存和分区初始化。
- VER-002：Rust settings 聚焦测试 18 项通过，覆盖注入默认根、snapshot/DTO、空值/`~` 恢复默认及显式 `~/.qterm` 自定义路径。
- VER-003：SettingsDialog/transport 聚焦测试 12 项通过；完整 `pnpm check` 为 68 个测试文件、613 项测试通过，ESLint、TypeScript 和 Vite build 通过。
- VER-004：release profile 的 `current_build_mode` 测试和 `cargo check --release --all-features` 通过，证明 Production 分支可选且可编译。
- VER-005：Rust fmt、Clippy、程序目录路径源码审计和 diff hygiene 通过。Rust 全量仅有未修改 `domain/git.rs` 中的既有 macOS/Windows path assertion 失败；跳过该单项后为 255 passed、0 failed、4 ignored。
- Documentation：PRODUCT、ARCHITECTURE、DECISIONS 与 Directory Map 已同步；spec 保存完整验收证据和残余风险。
- Completion：TASK-001 至 TASK-006 完成，change 于 2026-08-31 无冲突归档。

## Next Action

无需后续实施动作；独立开发 identifier 和既有跨平台 Git 路径校验如需处理，应分别建立新 change。
