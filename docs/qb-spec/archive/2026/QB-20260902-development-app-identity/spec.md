---
id: QB-20260902-development-app-identity
type: design
tier: strict
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Development App Identity

## Approval

用户于 2026-09-02 明确要求为开发版建立专用配置并完成修改，使本机同时运行正式版与开发版时，Codex 和桌面系统能够稳定选择开发版。

## Goal

让常规 `pnpm tauri dev` 启动的 Qterm 使用与正式版不同的桌面应用身份，同时保持正式构建、发布产物和既有开发配置根不变。

## Change Shape

- Type：`design`。变更由 Tauri 配置合并、桌面应用身份、跨平台命令入口和发布兼容性约束主导。
- Tier：`strict`。应用 identifier 影响 macOS bundle、Windows/Linux 桌面识别以及 Tauri 管理的 window-state/WebView 数据，属于打包与隔离边界。
- Affected users：同时运行本地开发版与已安装正式版的开发者；普通正式版用户不应观察到名称、identifier 或配置变化。

## Current Behavior And Root Cause

- `tauri.conf.json` 同时服务开发和正式构建，固定声明 `productName: Qterm`、`identifier: com.qiubai.qterm` 和窗口标题 `Qterm`。
- `pnpm tauri dev` 直接转发到 Tauri CLI，没有自动合并开发专用配置。
- 本机 Codex 应用解析器因此看到相同名称和 identifier；按 identifier 选择时发生歧义，按名称选择时解析到 `/Applications/Qterm.app`。
- 上一项开发配置隔离已让 debug 构建使用 `~/.qterm-dev`，但明确未隔离 Tauri identifier、window-state、WebView 数据或应用显示名。

## Requirements

- REQ-001：常规 `pnpm tauri dev` 必须自动合并仓库内的开发专用 Tauri 配置，不要求开发者记忆额外参数、环境变量或手工修改正式配置。
- REQ-002：开发专用配置必须将应用显示名设为 `Qterm Dev`，identifier 设为 `com.qiubai.qterm.dev`；运行期主窗口标题必须与最终应用显示名一致。
- REQ-003：`pnpm tauri build`、CI 和发布工作流必须继续使用正式身份 `Qterm` / `com.qiubai.qterm`，不得隐式合并开发配置或改变现有安装/升级身份。
- REQ-004：开发配置只能覆盖开发 flavor 所需身份字段；不得复制或替换通用及 macOS 专用窗口数组，从而保留现有尺寸、装饰、透明度、Overlay 标题栏和窗口效果。
- REQ-005：开发命令入口必须在项目要求的 Node 22 与 macOS、Windows、Linux 上使用同一实现，并原样转发非 `dev` 子命令和用户附加参数。
- REQ-006：既有 `~/.qterm-dev` / `~/.qterm` 核心配置根隔离必须保持不变；新开发 identifier 只进一步隔离 Tauri 管理的应用数据，不迁移、复制或删除任何现有用户数据和构建产物。
- REQ-007：开发入口的参数注入与身份配置必须有自动化回归保护，并通过实际 Tauri 配置/产物检查证明开发和正式身份不同。

## Non-Functional Requirements

- NFR-001：开发配置路径必须相对仓库稳定，不依赖当前用户 home、Cargo `target` 目录或已安装应用路径。
- NFR-002：命令入口不得通过 shell 拼接参数；参数应以数组形式交给本地固定版本的 Tauri CLI，避免跨平台引用和转义差异。
- NFR-003：正式发布无需新增 secret、环境变量或 workflow 分支；现有 `pnpm tauri build` 调用保持兼容。

## Non-Goals

- 不增加 beta、nightly 或 preview 等额外通道。
- 不为开发版设计新图标、签名、安装器或自动更新通道。
- 不重命名 Cargo package/lib crate，也不承诺裸 debug 可执行文件的磁盘文件名改变。
- 不删除或移动 `target/` 中已有的正式 bundle；旧构建产物仍由开发者按正常构建缓存策略管理。
- 不修改 Qterm 业务逻辑、配置 schema、凭证、Workspace 或传输行为。

## Observable Acceptance

- AC-001（REQ-001, REQ-005, NFR-001, NFR-002）：自动化测试证明 `dev` 子命令会且只会注入一次 `src-tauri/tauri.dev.conf.json`，其余参数顺序保持；`build`、`info` 等非开发子命令不注入。
- AC-002（REQ-002, REQ-004, REQ-007）：开发配置经 Tauri 合并后生成/运行的应用显示为 `Qterm Dev`、identifier 为 `com.qiubai.qterm.dev`，主窗口标题为 `Qterm Dev`，且 macOS Overlay/透明窗口配置仍生效。
- AC-003（REQ-003, REQ-007, NFR-003）：不带开发配置的正式 bundle 仍生成 `Qterm.app`，Info.plist 的显示名为 `Qterm`、identifier 为 `com.qiubai.qterm`；CI/发布命令保持原样。
- AC-004（REQ-002, REQ-006）：正式版和通过 `pnpm tauri dev` 启动的开发版同时运行时，Codex 应用列表能以 `Qterm Dev` / `com.qiubai.qterm.dev` 唯一识别开发版，不再把开发目标解析到 `/Applications/Qterm.app`。
- AC-005（REQ-005）：显式追加其他 Tauri CLI 参数时，开发配置先于用户提供的额外配置合并；用户参数保持可用，非 `dev` 子命令行为保持 Tauri CLI 原语义。
- AC-006（REQ-006）：源码审计和现有配置隔离测试证明 `.qterm-dev` / `.qterm` 规则未改变，变更不执行用户数据或 `target/` 产物迁移/删除。

## Behavior Delta

### ADDED

- REQ-001：新增自动应用开发专用 Tauri 配置的常规开发入口。
- REQ-002：新增 `Qterm Dev` / `com.qiubai.qterm.dev` 开发桌面身份及与 productName 同步的主窗口标题。
- REQ-007：新增开发命令参数与最终桌面身份的回归验证。

### MODIFIED

- REQ-003：原开发与正式构建共享 `Qterm` / `com.qiubai.qterm` 的行为，变为只有正式构建保留该身份；发布兼容性不变。
- REQ-006：原仅隔离核心配置根的开发模式，进一步由独立 identifier 隔离 Tauri 管理的数据；现有核心配置路径与数据不变。

## Options Evaluated

### Option A：可测试命令入口自动注入开发配置及 macOS app runner（采用）

- 保留现有 `pnpm tauri dev` 使用方式，正常开发不会漏掉专用身份。
- 开发配置只覆盖身份和 macOS dev plist 路径，窗口标题从最终 productName 同步，避免 JSON Merge Patch 用窗口数组整体替换平台配置。
- macOS runner 保留 Vite/Tauri dev 生命周期，但将编译结果放入独立 `.app` 后运行；Windows/Linux 不改变默认 runner。
- 正式 `build` 子命令原样转发，不进入开发配置路径。

### Option B：新增 `pnpm tauri:dev` 并要求开发者改用

- 实现更少，但旧文档、历史命令和自动化仍能启动同身份开发版，无法从入口消除误用。

### Option C：把基础配置改为开发身份，正式构建再注入 production override

- 会把漏传正式 override 变成发布身份事故，扩大 CI、release 和人工构建风险，不采用。

## Recommendation

采用 Option A：由仓库内 Node ESM 入口识别顶层 `dev` 子命令并在参数数组中注入 `src-tauri/tauri.dev.conf.json`；macOS 同时注入专用 runner，将 Cargo 编译结果原子放入 `Qterm Dev.app` 后运行，Windows/Linux 继续使用默认 runner。开发配置声明 `productName`、`identifier` 与非保留的 `Info.dev.plist`；Rust 组合根在 setup 时把主窗口标题同步为最终 productName。

## Architecture Boundary Decision

- Placement：开发 flavor 配置与 `Info.dev.plist` 位于 `src-tauri/`；命令路由和 macOS app runner 位于仓库 `scripts/`；应用标题同步位于 `src-tauri/src/lib.rs` 组合根。
- Domain/Application：不感知应用名称、identifier 或 CLI flavor；既有配置目录 build-mode 规则保持原样。
- Transport/UI：React 和 IPC 不增加 build channel 字段，也不自行推断开发/正式身份。
- Model separation：Tauri build config、CLI args、Rust runtime config 与 Qterm domain/configuration storage model 保持分离。
- Tradeoff：不引入通用多通道框架或重命名 Cargo binary；当前只建立 Development 与 Production 两个已批准 flavor。
- Critical behavior signal：入口注入、正式命令不受影响、最终 bundle/runtime identity 必须有聚焦回归与产物证据。

## Strict Traceability Seed

- TASK-001（REQ-001, REQ-005, REQ-007）：先建立开发配置/runner 注入与 Cargo 参数转换的纯函数测试，再实现跨平台 Tauri CLI 入口和 macOS runner。
- TASK-002（REQ-002, REQ-004）：新增最小开发 Tauri 配置与非保留 dev plist，并让组合根将窗口标题同步到最终 productName。
- TASK-003（REQ-003, REQ-006）：保护正式 build/release 入口与既有配置根规则，更新开发文档和结构索引。
- TASK-004（REQ-001 至 REQ-007）：执行脚本测试、静态检查、debug/release bundle 身份检查及 macOS Codex 双实例识别验证。
- VER-001（AC-001, AC-005）：Node 参数路由聚焦测试及 CLI help smoke test。
- VER-002（AC-002, AC-004）：开发 config schema/build/runtime 与 Codex 应用列表检查。
- VER-003（AC-003）：正式 app bundle 的 Info.plist 身份检查和 workflow diff 审计。
- VER-004（AC-006）：既有 configuration storage 聚焦测试、源码/文件操作审计与 diff hygiene。

## Risks And Rollback

- 变更 identifier 后，开发版的 Tauri window-state 与 WebView framework data 会使用新命名空间；这是隔离目标，但首次运行可能采用默认窗口状态。
- 裸 debug 可执行文件仍由 Cargo 命名为 `Qterm`；macOS runner 不直接运行它，而是原子复制到 `Qterm Dev.app` 内，使 LaunchServices 采用开发 identifier，同时不改变 Cargo binary 名。
- Tauri 的普通 macOS dev 模式不运行 `.app`，专用 runner 因而是识别可靠性的必要适配层；Tauri CLI 升级后必须重跑参数和真实启动验证。
- 显式传入额外 `--config` 的高级用法可以在开发配置之后覆盖字段；正常 `pnpm tauri dev` 路径保持确定性，覆盖行为在文档中说明。
- 回滚只需恢复 package script、删除命令入口和开发配置、移除标题同步；不会删除新 identifier 下生成的系统数据或现有 `.qterm-dev`。

## Quality Check

- REQ-001 至 REQ-007 均由 AC-001 至 AC-006 覆盖，Behavior Delta 同时描述新开发身份和正式兼容行为。
- 主路径覆盖常规 dev、正式 build、双实例解析；备选路径覆盖附加 CLI 参数和额外 config；恢复路径明确不删除开发系统数据。
- NFR 覆盖路径稳定性、跨平台参数传递和发布兼容；没有需要用户补充的阻塞性产品选择。

## Independent Spec Review

- Result：`PASS WITH NOTES`。
- Findings：没有阻塞性语义缺口。显式追加的其他 `--config` 可以在开发配置之后覆盖身份字段，这是 Tauri CLI 的既有高级能力；标准 `pnpm tauri dev` 仍保持确定性。
- Traceability：REQ-001 至 REQ-007 全部有 AC 覆盖，AC-001 至 AC-006 映射到 VER-001 至 VER-004，Behavior Delta 同时覆盖新增开发 flavor 与正式兼容行为。
- Context consistency：本 change 实现上一项配置隔离规格记录的后续候选，不修改 domain/application 数据路径规则；长期架构与决策文档需要同步新的开发启动边界。
- Next Action：审查通过，进入 strict execution plan。

## Verification Evidence

- VER-001 / AC-001、AC-005：`node --test scripts/tauri.node-test.mjs` 通过 9 项，覆盖 dev config/runner 单次注入、Linux 默认 runner、macOS 自定义 runner 保留、附加 config 顺序、非 dev 原样转发、Cargo/app 参数拆分、debug/release/target bundle 布局和 package script 接线；`pnpm tauri dev --help` 与 `pnpm tauri build --help` 均通过。
- VER-002 / AC-002、AC-004：普通 `pnpm tauri dev --no-watch` 实际使用 `scripts/tauri-dev-runner.mjs`，运行路径为 `target/tauri-dev/debug/Qterm Dev.app/Contents/MacOS/Qterm`。bundle plist 为 `Qterm Dev` / `com.qiubai.qterm.dev`；`lsappinfo` 在正式版同时运行时返回两个独立记录，AppleScript 分别将 `Qterm Dev` 和 `Qterm` 唯一解析为各自 identifier。主窗口标题由已编译通过的组合根同步最终 productName，开发 config contract 证明未覆盖 `app.windows`。Codex 可访问性层的直接读取因 macOS 当前锁屏被系统拒绝，系统应用解析证据已覆盖唯一目标。
- VER-003 / AC-003：`pnpm tauri build --bundles app` 通过；最终 `target/release/bundle/macos/Qterm.app/Contents/Info.plist` 为 `Qterm` / `com.qiubai.qterm` / version `0.3.1`。`.github/workflows` diff 为空，CI 与发布命令未引用开发 config、plist 或 runner。
- VER-004 / AC-006：`cargo test configuration_storage --lib --all-features` 6 项通过，既有 `.qterm-dev` / `.qterm` 隔离规则未改变；`cargo fmt --check`、严格 Clippy、`pnpm check` 和 `git diff --check` 通过。`pnpm check` 包含 79 个 Vitest 文件、713 项前端测试、9 项 Node runner 测试、ESLint、TypeScript 与 Vite build。

## Completion

- `pnpm tauri dev` 保持原使用方式，并在 macOS 以可热更新的 `Qterm Dev.app` 运行；正式构建和安装身份保持兼容。
- 开发/正式的 productName、identifier、窗口标题和 Tauri 管理数据命名空间已分离；Qterm 核心 `.qterm-dev` / `.qterm` 数据路径不迁移、不复制、不删除。
- Architecture、Decisions、Directory Map、README、开发与排障文档已同步；change 于 2026-09-02 无冲突归档。

## Residual Risk

- Tauri CLI 的 runner 参数形状和 JS `run` 入口受锁定版本保护，但未来升级 `@tauri-apps/cli` 时仍需重跑 Node tests 与真实 `pnpm tauri dev` smoke test。
- Windows/Linux 在本机无法执行真实桌面进程识别验证；两平台会应用独立 productName/identifier 和窗口标题，但继续使用 Tauri 默认 runner。macOS 的原始问题已有实际双实例证据。
- 高级用户显式追加其他 `--config` 或 `--runner` 时仍可覆盖标准开发 flavor，这是保留的 Tauri CLI 能力。

## Open Issues

- 无阻塞项。

## Next Action

无需后续实施动作；未来升级 Tauri CLI 时重跑入口、bundle 和双实例识别验证。
