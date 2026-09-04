---
id: QB-20260904-conpty-ordered-resize
tier: strict
status: active
created: 2026-09-04
updated: 2026-09-04
---

# Windows 有序缩放实施计划

## Background / Requirement

遵循 [spec](../specs/QB-20260904-conpty-ordered-resize.md) REQ-001–010、AC-001–009；来源与方案比较见 [research](../research/QB-20260904-conpty-ordered-resize.md)。规格质量审查为 PASS WITH NOTES；仅批准规划继续，native 可行性仍待 G0。

用户已授权落地实现，开始执行 G0。以下名称、接口和文件在验收前仍为**拟新增设计**；现有 stock ConPTY 不提供这些功能。生产链路接线依赖 G0 通过，不将原型或 API 返回当作原生输出屏障。

## 实施进度（2026-09-04，未完成）

- TASK-001 已扩展探针：可选 runtime，实际 DLL 路径，API return 与 native commit 独立计数，输出延迟排空，历史折行/合法重复/持续输出场景。完整时序矩阵仍待执行。
- TASK-002 已实现并编译 `native/conpty/patches/g0-ordered-output.patch`；真实 QTR0 帧由 host 生产，测试 consumer 按帧串行 write/resize。构建脚本与精确上游锁已落盘。
- **G0 尚未通过完整门槛**：当前版本是隔离原型，非正式 ABI；session/request 身份、early resize、背压关闭、内存上限及所有尺寸入口审计仍缺证据。不能据此进入生产接线或归档。
- TASK-003–010 尚未完成。Qterm 当前生产路径仍是 120ms 缓解方案；未替换安装目录内的 DLL/host，未修改生产 IPC。

| 验证 | 已有证据 | 当前状态 |
| --- | --- | --- |
| VER-001 / AC-001 | native hook + 同一原生输出流中的 Hello/Resize/Data；banner 77 次、live 113 次真实尺寸事件 | 部分通过；全部入口与锁顺序尚未证明 |
| VER-002 / AC-002 | 100 次 resize 的真实 xterm oracle 比较、UTF-8/帧分片、重复帧/缺帧/截断拒绝；2 个 Node tests 通过 | 部分通过；不是要求的 10,000 操作生产状态机测试 |
| VER-003 / AC-003 | ordered 140ms/200ms：banner 与 scrollback 均通过；77 native commits，欢迎语 1 次 | 部分通过；完整矩阵未完成 |
| VER-004 / AC-004 | 40 条历史长行、合法重复 2 条；live 80 条长行在 200ms/1000ms 延迟下完整保留，113 native commits | 部分通过；TUI/实际属性/全套 Unicode 场景未完成 |
| VER-005 / AC-005 | QTR0 长度/seq/Hello 校验与分片拒绝测试 | 部分通过；正式 session/epoch/请求生命周期未实现 |
| VER-006 / AC-006 | 64KiB frame 分片已实现，但 native `_front/_back` 仍无总预算约束 | 未通过；不可将 frame 上限当作队列上限 |
| VER-007 / AC-007 | ordered 探针不使用120ms计时 fit | 未完成延迟分位数、Mac/SSH 实测 |
| VER-008 / AC-008 | 可重建 Windows x64 host，源码/补丁/DLL hash 记录；构建脚本复跑成功 | 部分通过；非生产装载/打包验证 |
| VER-009 / AC-009 | source-size 与 lint 通过；pnpm check：123 files/918 tests 通过、GitPane.graph 1 test 失败；cargo example build 通过 | 未通过完整 gate；cargo fmt --check 报告多处未修改文件换行差异；未运行完整 clippy/原生打包/GUI |

具体构建、隔离运行命令及原型限制见 [native README](../../../native/conpty/README.md)。本表保留 active，不宣称请求的产品修复已完成。

## Non-Goals

不使用更长防抖作为根治；不自动改 shell、不清历史、不按内容去重、不改远端 SSH 协议、不将未知 SDK 当作现成依赖、不在当前存活会话热换 native host。

## 架构与所有权

| 责任 | 拟 owner / 文件 | 约束 |
| --- | --- | --- |
| 原生输出与实际 resize 的共同顺序 | `native/conpty/`：upstream lock manifest、MIT notices、小范围 patch、native contract tests | 必须在 host 内部生成边界；该目录保存可构建来源与补丁，不将完整上游源码硬塞入 Rust 模块。 |
| 会话控制用例、pending request、失败/关闭 | `src-tauri/src/application/local_terminal_flow.rs` | 经 port 编排，不依赖 Tauri 或 Windows API。 |
| 应用拥有的 ordered event / control port | `src-tauri/src/ports/local_terminal.rs` | 数据事件不复用 IPC DTO；其大小界限/事件顺序契约明确。 |
| 受控 runtime 装载、ABI、framing、进程 I/O | `src-tauri/src/infrastructure/local/windows/{runtime,protocol,session}.rs` | Windows cfg 隔离；`local/pty.rs` 作为跨平台窄 façade 保留 Unix portable-pty 路径。 |
| Tauri DTO 与命令 façade | `src-tauri/src/commands/local_session.rs` | 映射版本化事件/请求/错误；不运行解析循环或持锁阻塞 UI。必要时 async + spawn_blocking。 |
| TypeScript IPC | `src/lib/tauri/localSessions.ts` | 解码 discriminated union，不在这里拥有 grid 或业务重试策略。 |
| epoch、view 暂离期间的有序 mailbox/credit | `src/workspace/localTerminalEventStream.ts`，由现有 controller 接线 | 严格 Windows 流不得走旧的 256KiB 截断 pendingTerminalOutput；不扩大 SSH 改动范围。 |
| desired / requested / committed 尺寸与 resize intent | `src/terminal/windowsTerminalResize.ts` | 只合并未发请求，不直接猜测已提交尺寸。 |
| xterm 逐帧消费、write barrier、ResizeCommitted | `src/terminal/terminalEventConsumer.ts` | 一条消费队列；保留 UTF-8/VT parser 状态；销毁时取消。 |
| 测量和视图组合 | `terminalLayout.ts`、`TerminalPanel.tsx` | strict Windows 只 proposeDimensions；真实 grid 更新委托 consumer。Panel 和巨型测试不得增长。 |
| 构建/证据/打包 | `scripts/build-conpty-runtime.ps1`、`scripts/conpty-resize-contract.mjs`、现有 probe、Windows CI 和 Tauri config | 拟新增命令必须随实现提交；本文不将其描述为当前可执行工具。 |

遵守 ENGINEERING_STYLE_SPEC。先跑 source-size preflight；若 `pty.rs` 等超过限制按 Windows adapter/生命周期职责拆分。变化的 source-size baseline 只能下降。Directory Map 在实际 owner 落地后更新，不预登记不存在的模块。

## 设计：生产端契约

### G0 必须冻结的 native 扩展

初始上游对照候选为官方 `v1.24.11911.0` / `ConPTY.1.24.260710001`；G0 解出精确 commit、源包及 artifact digest，再选 patch 基线。不能直接使用随 main 漂移的构建，也不能只复制 DLL 却继续加载系统 conhost。需要作为整体控制启动 ABI、ConPTY DLL、host exe 和 framing version。

拟议扩展接受 `ResizeIntent(requestId, cols, rows)`，输出私有 framed stream。实现可采用受控 host 的显式能力开关/ABI，具体导出名在 G0 确定；不得假定 portable-pty 现有 `MasterPty::resize` 能表达该契约。Windows 新 adapter 负责新 ABI，Unix 保持 portable-pty。

G0 从实际 resize 入口与 VtIo Writer/Submit/缓存路径追踪：

1. 在 console 状态变化与输出生产共同同步域内，封存所有旧状态的输出，包括旧缓存及已排队异步写，不要求接收端此时已经读完。
2. 执行尺寸变更，取得**实际成功后的 grid**；将该操作期间生成的输出暂存在当前事务，禁止先发布新尺寸 Data 再发边界。
3. 成功后有序发布 `ResizeCommitted(actualSize)`，随后发布事务内及后续新尺寸 Data。旧输出、边界、新输出由同一个序列器负责。
4. 若失败完全无副作用，可发明确 rejected；若可能部分改变状态或丢失边界，则终止严格会话输出并报告 fault，不继续猜测。设计不能依赖“失败时大概没改”。
5. 审计应用自身 Console API 的尺寸改变、early resize、normal/alternate grid。只在 pipe signal 入口加事件不足以过 G0。需区分真实可见 grid 变化与纯内部 buffer allocation，防止误改变前端窗口语义。
6. 不为等待前端 ack 而持有 console/global lock；输出背压、shutdown 和 overlapped writer 必须有锁顺序分析。G0 必须说明如何在有界资源下保持排序，不能用无界 queue 换一致性。

### Frame 草案（G0 冻结后才可接线）

私有 transport envelope 包含 magic、protocolVersion、type、payloadLength、sessionIdentity、monotonic seq；数值端序/编码及最大长度作为版本化 ABI 固定。binary u64 序号跨 JSON 时使用十进制字符串，避免 JS Number 精度截断。

| 类型 | payload | 含义 |
| --- | --- | --- |
| Hello | initialGrid、runtimeId/revision、protocolVersion、features | 在任何 Data 前确认初始尺寸与实际能力。 |
| Data | bytes | 最大 payload 64KiB，保持原始字节；应用能打印任意 envelope-like 字节而不产生外层控制帧。 |
| ResizeCommitted | requestId 或 null、actual cols/rows、generation | 生产端实际发生的尺寸边界；应用主动 grid 变化可无 requestId。 |
| ResizeRejected / RequestSuperseded | requestId、原因、是否仍一致 | 仅明确未提交或已替代的请求；部分失败须转 Fault。 |
| Fault / Closed | 错误码/终止状态 | 顺序结束；后续帧不得继续应用。 |

控制与应用输出不是同一个可伪造的 VT 命名空间。只有受控 host 在 child 输出进入 transport 时构造 envelope；read thread 不扫描字节“猜”控制帧。不要往 VT 文本里注入 OSC nonce、DSR 或 shell echo 作为边界。已有 native 自发 DSR 在长 DCS/APC 内的风险必须在 G0 验证/修补，不能因新 envelope 是安全的就忽略旧注入路径。

Rust 首先验证 Hello、帧长度/类型/seq/session；单一原生流经单一 Tauri event Channel 传递。前后端不同版本一起发布；不能在同一会话里混用旧 `{data}` DTO 与新事件。为测试兼容旧路径可保留明确 backend mode，正式严格发布选择和错误行为遵从 REQ-007。

### 前端消费顺序

```text
ResizeObserver → desiredSize → latest unsent intent → native control

Hello → xterm initial grid
Data(n) → terminal.write(bytes, callback) → consumed credit
ResizeCommitted(n+1) → terminal.resize(actual cols, actual rows)
Data(n+2) → terminal.write(bytes, callback) → consumed credit
```

不调用 `fit.fit()` 提前改变 Windows grid。提交时必须使用事件中 actualSize，不能重新测量 DOM 代替它。消费者按序等待每个 Data 解析完成；建议直接 write Uint8Array，让 xterm 保留跨 chunk UTF-8 状态，不在 resize 时 flush/reset decoder。控制事件不能进入 terminal output observer；原有 OSC 通知只观察 Data 一次。

consumer 触发的 xterm resize 不得被回送为新 intent；requestedSize、desiredSize、committedSize 不能用一个 state 混写。grid 暂时保持旧尺寸时可由容器裁剪，禁止 clear、重建 xterm 或变形文本；最终 actualSize 收到后适配。这里的 ack 是原生事件，不是 JS Promise 返回或 120ms elapsed。

### 生命周期、背压和错误

- 后端每个 session 单一 command/event owner；未发 intent 可合并。native 已提交事件必须逐个消费；关闭将所有 pending promises 收敛，旧 epoch 全部丢弃。
- 初始 Hello 在首字节前；前端已准备 consumer 后才启动 child 或启用 credit，避免启动时按错误默认 80×24 解码。
- 前端累计消费后发 credit（批量可行），用于上游背压，不用 credit 推断“下次 resize 已完成”。当前 native/transport 未消费预算 8MiB、前端4MiB、单帧64KiB；在 G0 验证成本与共享 budget 的计量位置，修改需同步 spec。
- 隐藏 workspace 保持逻辑 consumer；writer 暂离则有界 mailbox 保留**全部类型**事件。不得借用会移除旧 chunk 的 pending 字节数组。
- 错 seq/缺 frame/未知版本/长度异常：停止消费并显示故障，保留已显示历史。不允许跳过控制帧继续显示“看起来还能用”的内容。
- watchdog 只决定报错/中止，不触发成功或强制 fit；关闭必须能取消 native I/O/credit 等待。不得等待前端响应时占用控制关闭所需锁。

## API / Database / Packaging Impact

- API：仅内部 Windows 本地 IPC、native private ABI 与 typed output union 变化；command acceptance 和 actual commit 分开。连接返回值携带 session identity/协商能力；Mac/Linux adapter 保持现有语义。
- Database：不新增 workspace/settings schema，不回写 shell 环境文件，不迁移历史缓冲。
- Packaging：Windows x64 私有 runtime 按固定目录和绝对路径装载，核对完整组件集 hash/version/架构；禁止 cwd/PATH DLL 搜索。保留 MIT notices、patch 来源、构建工具链和 upstream 更新流程。Tauri dev 也走同一 runtime resolver。
- Release：修改 native 依赖/资源/配置后必须 `pnpm tauri build` 并验证 NSIS/MSI，不能把前端 Vite build 当成 native 包验证。跨平台产物不包含多余 Windows runtime。

## Implementation Tasks

| Task | depends | Requirement / Acceptance | 工作与退出条件 |
| --- | --- | --- | --- |
| TASK-001 | 无 | REQ-009；AC-003 | 保留 140/200ms 反例，改 probe 为可配置矩阵与 artifact 输出，记录真实 commit 次数、shell/version、stdout、final buffer。旧模式必须仍失败，防止测试失效。 |
| TASK-002 | TASK-001 | REQ-001, REQ-008, REQ-010；AC-001 | **G0**：比较系统/官方候选 runtime；构建 native framing/resize 原型，冻结 upstream revision/ABI，完成所有输出/resize 路径及锁审计。证明边界并跑反例；失败即停止后续接线、更新技术阻塞。 |
| TASK-003 | TASK-002 | REQ-001, REQ-004, REQ-006；AC-001, AC-005, AC-006 | 将 native 原型变成小范围可维护补丁与契约测试；覆盖分片、应用伪造、部分失败、背压、长 DCS；G0 review 所有风险有落点。 |
| TASK-004 | TASK-003 | REQ-004–008；AC-005, AC-006, AC-008 | Rust port/Windows adapter/runtime resolver/frame validator；旧 Unix façade 保持；输出序号来源不下移到 reader。相邻 Rust 测试先覆盖非法帧和关闭等待。 |
| TASK-005 | TASK-004 | REQ-004–007；AC-005, AC-006 | application lifecycle、Tauri DTO/Channel、TS union、epoch/mailbox/credit 接线；严格路径不再进入截断 pending cache。 |
| TASK-006 | TASK-005 | REQ-001–003；AC-002, AC-007 | 前端 event consumer 和 desired/requested/committed 状态；写解析完成再提交 event size；取消 Windows 计时 fit，保留非 Windows 行为和 source-size ratchet。 |
| TASK-007 | TASK-006 | REQ-001–006, REQ-009；AC-002–006 | 固定 seed、乱延迟、分片和正常/备用屏幕回归；输出相同文本两次不得被去重；Mac/SSH mock integration 与实际 buffer 对照。 |
| TASK-008 | TASK-007 | REQ-003, REQ-009；AC-003, AC-004, AC-007 | 真实 cmd/PowerShell/TUI、快慢拖、宽高变化和持续输出矩阵；测量响应与内存；保存原生事件与 xterm 快照。 |
| TASK-009 | TASK-004, TASK-008 | REQ-007, REQ-008；AC-008 | Windows dev/打包/CI、干净安装、篡改/缺失/架构错误与 DLL 搜索测试，整包升级回滚。 |
| TASK-010 | TASK-007, TASK-008, TASK-009 | REQ-009, REQ-010；AC-009 | 实际 Tauri 窗口/分屏/DPI/工作区复验；跑仓库 gate，更新 Directory Map 与用户复验文档，只有所有 AC 通过才归档。 |

## Dependencies And Parallel Work

G0 是硬依赖，未通过时不得先完成“看起来已修复”的前端接线。native producer 与 Rust/TS frame schema 必须先固定一个契约。测试语料可以提前整理，但本计划不要求多 Agent，不安排未授权发布操作。

## Acceptance To Verification / Test Plan

下列新测试/脚本路径是计划产物，TASK 对应提交创建后才能运行；现有命令注明 existing。

| Verification | AC | 命令/检查与通过标准 |
| --- | --- | --- |
| VER-001 | AC-001 | G0 native contract tests + 锁/输出路径 review；提交标注每个 native production/resize hook 的源码位置与 seq trace，证明 `Data(old)* → Resize(new) → Data(new)*`。不能只有统计无重复。 |
| VER-002 | AC-002 | 拟新增 `terminalEventConsumer.test.ts`、`windowsTerminalResize.test.ts`：固定 seed ≥10,000 operations，匹配同一原生事件轨迹的零延迟 oracle；错误乱序应 fault，不自行重排。 |
| VER-003 | AC-003 | 扩展现有 `scripts/conpty-resize-probe.mjs` 或新 contract driver；下述时序矩阵保留实测反例，至少20次实际 native committed resize，欢迎语一次、提示符/输入正确。 |
| VER-004 | AC-004 | cmd、系统 Windows PowerShell、已固定版本 pwsh/TUI；编号输出、合法重复、CJK/emoji、wrap 与属性、normal/alternate 切换；同序零延迟对照 + 明确预期行数，不只检查 banner。 |
| VER-005 | AC-005 | Rust frame validator/生命周期测试与 TS mailbox/observer 测试；任意 header-like Data、seq gap/replay、epoch、半帧、early resize 等均有断言；旧事件零副作用。 |
| VER-006 | AC-006 | consumer 暂停、writer 暂离、native backpressure、部分 resize 失败、关闭中断；内存预算不超限，无字节/控制边界静默丢失；无等待环。 |
| VER-007 | AC-007 | 记录指定测试机的100次健康resize延迟 p95 和负载；测试关闭所有计时优化后仍正确。Mac本地与Linux SSH真实回归不可用时记 blocked，不能替换为Windows mock并宣称全平台验收。 |
| VER-008 | AC-008 | pinned runtime build + `pnpm tauri build`（existing）；Windows x64 NSIS/MSI 干净安装/升级/回滚，cwd 同名 DLL、缺件/错版本/篡改注入均明确拒绝，runtime identity 可取证。 |
| VER-009 | AC-009 | `pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features`（existing），以及 native patch tests、真实 Tauri 窗口录屏/缓冲导出；历史诊断单独列出而非忽略失败。 |

### 时序与数据矩阵

- resize 间隔：16 / 60 / 119 / 120 / 121 / 140 / 250ms；输出延迟：0 / 60 / 150 / 200 / 500ms。按同一逻辑生产顺序注入可变延迟与多种分片；至少有一组数据通道暂停2秒后完整恢复。
- 保持真实输出顺序时只延后到达，不用独立 setTimeout 意外反转帧；另设显式乱序/缺帧故障用例验证安全失败。
- 行数6↔24、列数20↔120、两轴交错；先填充滚动历史到8000边界、合法重复文本、真实换行/自动折行分别测试。
- 一段字节可拆成1字节或多帧合并，包括UTF-8多字节、CSI/OSC/DCS中间；ResizeCommitted 可在前后Data跨分片处消费，不重置 parser。
- 关闭、重连、切目标、隐藏页面/拆分、writer重挂载、请求在native处理前被替代、实际尺寸clamp/reject、慢消费、input/control回应同时进行。
- 矩阵 runner 必须按场景调整 watchdog 和初始握手等待，不能因旧20秒固定超时或未启动shell误判。所有随机测试保存seed和最小失败轨迹。

## Rollback Plan

未完成 G0 不启用产品路径。开发阶段用明确的 test mode 对照，不在最终修复包中静默 fallback。native/ABI/前端配套按完整版本发布；回滚恢复整个前版且要求新建本地会话，不热切当前进程。没有数据库迁移，设置不变；旧版本仍有已知竞态，回滚说明不能称已根治。

## Risks / 决策门槛

最大不确定性在 producer hook 与native锁/输出缓存，非前端状态机。TASK-002 必须拿出可运行证据后才能决定最终patch基线。若可靠协议需要替换大部分 Console/renderer，停止此实施路径，另行评估统一native状态方案的产品成本，不把“原型未通过”写成完成。

旁加载新版 ConPTY、单次反例通过与全部性质证明是三个不同结论。对照版本没有重绘重复不代表具备有序尺寸契约；G0 不能仅凭缺陷暂未复现通过。

## Documentation Updates / Completion

保留既有防抖归档作为历史；更新 `docs/conpty-resize-testing.md` 指向最终反例、真实脚本与能力版本；实际代码owner落地后更新 Directory Map；记录native第三方来源/更新维护说明。长期产品偏好不在本任务写入。

本轮完成标准：research/spec/plan内容闭合，文档链接与REQ/AC/TASK/VER映射校验通过，runtime代码不变。整个bug完成标准：spec全部AC通过、G0证据存在、原生与桌面实际验证完成后才能归档。当前仍为 draft。
