---
id: QB-20260902-development-app-identity
tier: strict
status: archived
created: 2026-09-02
updated: 2026-09-02
spec: spec.md
---

# Development App Identity Plan

## Background

常规 `pnpm tauri dev` 与正式构建当前共享 `Qterm` / `com.qiubai.qterm`，导致 macOS 和 Codex 无法唯一识别开发实例。既有 `.qterm-dev` 只隔离 Qterm 核心配置，没有隔离桌面应用身份和 Tauri 管理的数据。

## Requirement

实施 spec 的 REQ-001 至 REQ-007，覆盖 AC-001 至 AC-006，并保持正式发布身份和现有配置根兼容。

## Non-Goals

- 不增加第三个发布通道、开发图标、签名或 updater。
- 不重命名 Cargo package/binary，不修改业务逻辑或配置 schema。
- 不删除用户数据、安装应用或 `target/` 构建产物。

## Architecture Impact

- `scripts/tauri.mjs` 成为 package script 的 Tauri CLI 窄入口，只对顶层 `dev` 子命令注入开发 config，并在 macOS 注入 app-bundle runner；其他命令和参数按数组原样转发。
- `scripts/tauri-dev-runner.mjs` 把 Tauri 传入的 `cargo run` 参数安全转换为 build，原子更新 `target/tauri-dev/.../Qterm Dev.app` 后运行编译结果，保留 Vite/Tauri dev 生命周期。
- `src-tauri/tauri.dev.conf.json` 只覆盖开发身份和 `Info.dev.plist` 路径，避免 JSON Merge Patch 替换 `app.windows` 数组；plist 使用非保留文件名，不能自动进入正式 bundle。
- `src-tauri/src/lib.rs` 组合根读取最终 Tauri config 的 productName 并同步主窗口标题；domain/application/IPC/React 不感知 flavor。

## Domain Model Impact

- 无 domain model 变化。
- 既有 `BuildMode -> ConfigurationStoragePaths` 与 `.qterm-dev` / `.qterm` 行为保持不变。

## API Impact

- 无 IPC 或公共 API 变化。
- 开发者命令 `pnpm tauri dev` 的外观不变，内部增加开发 config；`pnpm tauri build` 继续正式构建。

## Database Impact

- 无数据库或 Qterm 配置 schema 变化。
- 新 identifier 会让桌面框架为开发版选择独立的 Tauri window-state/WebView 等系统命名空间；不迁移旧框架数据。

## Affected Files

- `package.json`
- `scripts/tauri.mjs`
- `scripts/tauri-dev-runner.mjs`
- `scripts/tauri.node-test.mjs`
- `src-tauri/tauri.dev.conf.json`
- `src-tauri/Info.dev.plist`
- `src-tauri/src/lib.rs`
- `docs/DEVELOPMENT.md`
- `docs/troubleshooting.md`
- `docs/qb-spec/context/ARCHITECTURE_SPEC.md`
- `docs/qb-spec/context/DECISIONS.md`
- `docs/qb-spec/DIRECTORY_MAP.md`
- 当前 change spec / plan

## Implementation Tasks

- [x] TASK-001 [REQ-001, REQ-005, REQ-007, AC-001, AC-005] 先新增 Node 参数路由、runner 参数转换和 config contract 测试，再实现 `scripts/tauri.mjs`/macOS runner 并让 package `tauri` script 使用该入口。
- [x] TASK-002 [depends: TASK-001] [REQ-002, REQ-004, AC-002] 新增开发 Tauri config 与 `Info.dev.plist`，并在 Rust 组合根将主窗口标题同步为最终 productName。
- [x] TASK-003 [depends: TASK-001, TASK-002] [REQ-003, REQ-006, AC-003, AC-006] 更新开发/排障文档、Architecture/Decisions 与 Directory Map，明确正式命令不注入开发身份和现有数据不迁移。
- [x] TASK-004 [depends: TASK-001 至 TASK-003] [REQ-001 至 REQ-007, AC-001 至 AC-006] 执行 strict 验证，检查实际开发/正式 bundle 与双实例系统解析，记录证据并在无冲突时归档。

## Dependencies And Parallel Work

- 不新增第三方依赖；复用 Node 22、项目锁定的 `@tauri-apps/cli` 和 Tauri runtime config。
- 当前工作树中 `src/files/FileBrowserPane.tsx` 及其测试是用户已有改动；本 change 不修改、格式化或归档它们。
- 参数入口和 Rust 标题同步最终共同影响运行验证，按顺序实现以保持证据可归因。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | VER-001：Node tests 覆盖 dev 单次注入、重复保护与非 dev 原样转发；CLI help smoke test。 |
| AC-002 | VER-002：开发 config contract、debug app bundle Info.plist、运行窗口状态与 macOS 窗口属性检查。 |
| AC-003 | VER-003：正式 app bundle Info.plist 和 CI/release 命令 diff 审计。 |
| AC-004 | VER-002：正式版与新开发版并行运行时，Codex 应用列表及按 dev identifier 定位检查。 |
| AC-005 | VER-001：附加普通参数和额外 config 的顺序/转发测试。 |
| AC-006 | VER-004：configuration storage 聚焦测试、无迁移/删除源码审计与 git diff hygiene。 |

## Test Plan

- VER-001 [AC-001, AC-005]：`node --test scripts/tauri.node-test.mjs`、`pnpm tauri dev --help`、`pnpm tauri build --help`。
- VER-002 [AC-002, AC-004]：通过普通 `pnpm tauri dev --no-watch` 启动 macOS dev app，检查 runner bundle Info.plist、LaunchServices 的 `Qterm Dev` / `com.qiubai.qterm.dev` 唯一记录；Codex 可访问性读取在系统未锁定时补充。
- VER-003 [AC-003]：执行正式 macOS app bundle 构建并检查 `Qterm.app/Contents/Info.plist`；审计 `.github/workflows` 未注入开发 config。
- VER-004 [AC-006]：`cargo test configuration_storage --lib --all-features`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`pnpm check`、`git diff --check` 与相关源码审计。

## Rollback Plan

- 恢复 package `tauri` script 为直接 CLI，删除两个 scripts、测试、`tauri.dev.conf.json`/`Info.dev.plist`，移除组合根标题同步即可恢复共享身份。
- 回滚不删除 `com.qiubai.qterm.dev` 下的系统数据、`.qterm-dev` 或任何 bundle；它们保持可恢复但不再由旧入口使用。
- 如果开发身份验证失败，保留正式配置不变，修正开发 config/入口后再启动，不通过修改 production identifier 规避。

## Risks

- Tauri CLI 内部 JS API 和 runner 参数形状虽来自项目锁定的直接依赖，但不是独立稳定公共包接口；Node smoke test、真实启动和锁定版本降低升级风险，升级 CLI 时需重跑两类验证。
- macOS `target/release/bundle/macos/Qterm.app` 仍与 `/Applications/Qterm.app` 共享正式 identifier；它不再影响按开发 identifier 选择，但按正式 identifier 调试仍可能需要显式完整路径。
- 高级用户的额外 config 可覆盖开发身份；正常入口和文档不会这样调用。

## Documentation Updates

- DEVELOPMENT/troubleshooting：说明 `pnpm tauri dev` 自动使用 `Qterm Dev` 身份以及显式 config 的合并顺序。
- ARCHITECTURE_SPEC/DECISIONS：记录开发 flavor 的 CLI/config/组合根 owner 与正式兼容边界。
- DIRECTORY_MAP：登记两个 Tauri scripts、`tauri.dev.conf.json` 与 `Info.dev.plist` 的职责。

## Style Context

- 不涉及视觉设计或 React UI；只改变系统应用名称和原生窗口标题。
- 遵守现有 ESM、Rust 格式和薄组合根边界，不引入 shell wrapper。

## Trigger Signals

- Architecture boundary：已确认由 CLI/config/组合根拥有，不进入 domain/application/UI。
- Critical behavior：必须先有参数/config contract 测试，再改 package 入口。
- Directory Map：新增 `scripts/` 入口和开发 config，需要更新结构索引。

## Verification Result

- VER-001：Node 入口/runner/config tests 9 项、dev/build CLI help smoke tests通过。
- VER-002：普通 `pnpm tauri dev --no-watch` 通过专用 runner 启动 `target/tauri-dev/debug/Qterm Dev.app`；开发 plist、LaunchServices 双实例和 AppleScript name→identifier 唯一解析通过。Codex 可访问性读取因系统锁屏不可用，已由同层系统应用解析证据替代。
- VER-003：正式 macOS app bundle 重建通过，最终 Info.plist 保持 `Qterm` / `com.qiubai.qterm` / `0.3.1`；workflow 未修改且未引用开发 flavor。
- VER-004：configuration storage 6 项、Rust fmt、严格 Clippy、`pnpm check`、diff hygiene 全部通过；前端基线为 79 个文件、713 项 Vitest 加 9 项 Node tests。
- Documentation：README、DEVELOPMENT、troubleshooting、Architecture、Decisions 与 Directory Map 已同步。
- Completion：TASK-001 至 TASK-004 完成，change 于 2026-09-02 无冲突归档。

## Next Action

无需后续实施动作；Tauri CLI 升级时复验 runner 参数契约和真实 macOS dev app 启动。
