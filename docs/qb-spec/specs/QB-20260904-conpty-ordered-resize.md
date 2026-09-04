---
id: QB-20260904-conpty-ordered-resize
type: bugfix
tier: strict
status: active
created: 2026-09-04
updated: 2026-09-04
supersedes: [QB-20260904-conpty-resize]
---

# Windows 本地终端有序缩放

## 目标与当前状态

消除 Windows 本地终端在输出与尺寸更新交错时重复堆叠历史的竞态。用户已授权落地实现，当前进入 G0 原生可行性验证；active 不表示代码已经根治，也不表示 native 扩展已存在。supersedes 表示替代前一防抖修复的最终技术方向，不撤销其历史测试事实，不代表新实现已上线。

当前证据、来源、备选比较见[调研](../research/QB-20260904-conpty-ordered-resize.md)。现有 fixed probe 在 140ms resize 间隔、200ms 输出延迟下出现 36 份欢迎语，不能以此前 16ms 连续拖动测试作为完成依据。

strict 原因：跨 native/Rust/TypeScript 的输出协议、并发状态机、应用输出与控制消息隔离，以及 Windows 原生组件打包均受影响。

## 范围和非目标

包含：Windows 本地会话输出/尺寸排序；受控原生能力的可行性原型及接入；有界流与生命周期；实际 xterm 缓冲保护；Windows 构建发布验证。macOS 本地与 Linux SSH 保持原路径。

不包含：更换用户 shell、自动改用 WSL/SSH、删除重复文本、清空历史、固定 PTY 尺寸、改写 Workspace 持久化格式、修复所有 Windows Console API 差异、向既有会话热切换 PTY。

## 已知约束

- 依赖 ENGINEERING_STYLE_SPEC、Directory Map 和 qterm-maintainable-modules；TerminalPanel.tsx 764 行与其测试 889 行基线不得增长。新增逻辑按 capability 拆分，禁止提高基线来掩盖增长。
- stock ResizePseudoConsole 返回值、读取线程锁、xterm write 回调、空闲窗口均不是 native 输出屏障。
- 必须支持现有 Windows x64 发布目标；最低支持 Windows 版本在 G0 从当前实际支持范围核定，不得因换 DLL 无声缩减。Mac/Linux 不装载 Windows 组件。
- 新 ABI、frame 名称和字段是项目拟议契约，必须在 G0 固定版本、来源与行为后才能生产接线。

## Requirements

- REQ-001 **生产端顺序**：每次实际 grid 变化与相关输出存在可审计的共同顺序；旧尺寸 Data 全部在 ResizeCommitted 前，新尺寸 Data 全部在其后。保证不以计时阈值为前提。
- REQ-002 **前端单一提交入口**：测量只更新 desiredSize；只有有序 native 尺寸事件能改变 Windows xterm grid。Data 在对应 committedSize 下处理。未发出的 resize intent 可 latest-wins；已提交事件不得跳过或按最新 DOM 大小替换。
- REQ-003 **内容完整性**：不因修复清屏、重建会话、回放全量快照、文本去重或丢弃真实重复输出；保留现有 8000 行 scrollback 语义、wrap、样式、光标、normal/alternate buffer 和输入行为。
- REQ-004 **控制隔离**：应用输出不能伪造 resize/ack/close；版本、序号、尺寸、长度和会话身份受校验。UTF-8/VT 跨帧不被截断或重新解释。控制帧不触发 OSC 通知或目录上报。
- REQ-005 **会话生命周期**：连接、early resize、迟到 capability、隐藏/恢复、writer 重挂载、关闭与重连均保持顺序；旧 epoch 不能作用于新终端；resize 请求只有在实际提交/明确替代/明确失败后才结束生命周期。
- REQ-006 **有界失败行为**：慢消费和暂停使用有界背压，不静默丢 Data 或边界；超时只报告故障/取消，不能当作同步成功。中间失败后不得继续按猜测尺寸处理输出。关闭可取消等待并清理子进程。
- REQ-007 **平台与降级**：非 Windows 及 SSH 行为保持；严格能力必须由实际 native 协议和版本声明确认。兼容缓解模式在替换前可用于开发对照，但最终修复发布不能静默回退到已知有竞态路径。能力缺失时在启动 shell 前给出明确错误，不损坏已有会话/设置。
- REQ-008 **原生来源与打包**：原生组件来源、精确 revision/patch、许可证、校验和、协议版本和架构可追溯；从受控绝对路径装载，不搜索 cwd/PATH 中同名 DLL。Windows 开发和安装包使用同一受控能力，升级/回滚按完整版本集合进行。
- REQ-009 **可观察验收**：以原生事件流顺序不变量和真实终端内容共同验收，覆盖快拖、慢拖、跨防抖阈值、持续输出、实际尺寸确实多次改变、任意分片及长延迟；不允许“其实没 resize”通过测试。
- REQ-010 **分阶段交付**：先通过 G0 原生可行性和规格审查，再接入产品；最终只有自动化、真实 Windows 桌面与安装包验收全部通过才关闭本 bug。单纯调研、文档、升级 DLL 或示例测试通过不算实现完成。

## 推荐设计与 G0 门槛

推荐受控 native host 的**带尺寸边界的 framed output**。现有 host 的实际 resize 和 VtIo output 需要在共同同步域内产生完整事件序列。具体 ABI 在 plan 中，全部标记为拟议。

G0 必須证明 REQ-001，而不是只展示一个 resize completed 回调：审计所有旧输出缓存/异步 writer，覆盖外部请求与应用侧尺寸变化，验证锁顺序、失败原子性和长 VT 字符串。必须使用 pinned revision 构建原型，在 140/200ms 反例及原生随机压力测试下通过。

若只能获得 stock API 或无法建立共同序列，G0 判 FAIL；保留未完成状态并重新评估统一原生状态方案，不准退回计时法作为最终交付。此为技术门槛，不是新的用户许可流程。

## Acceptance

| ID | 对应需求 | 必须观察到的结果 |
| --- | --- | --- |
| AC-001 | REQ-001, REQ-010 | G0 的 native 事件轨迹证明所有 resize 边界由生产端排序，覆盖旧缓冲、并发输出和成功/失败路径；架构审查无“下游推断边界”。 |
| AC-002 | REQ-001, REQ-002, REQ-009 | 固定 seed 模型至少 10,000 次交错操作，延迟/分片/背压变化后同一逻辑轨迹最终 buffer、cursor、wrap、属性与零延迟基线相同；每个 Data 被恰好消费一次。 |
| AC-003 | REQ-001, REQ-003, REQ-009 | 真实 Windows 140ms resize / 200ms 输出延迟反例、16/60 与其他矩阵均保持 1 份欢迎语及正确提示符；另有实际提交至少 20 次尺寸变更的测试；输入 marker 正常。 |
| AC-004 | REQ-003, REQ-009 | 真实 cmd/PowerShell、持续编号输出、真正重复行、中文/emoji/长行、CSI/OSC/DCS 分片、alternate buffer/TUI 验证无额外重复/丢失/属性破坏，合法重复行原样保留。 |
| AC-005 | REQ-004, REQ-005 | 伪造控制字节始终为 Data；旧 epoch、错 seq、未知版本、越界 size/length、半帧、关闭重连均有确定结果，无状态串会话；仅 Data 触发原有协议观察。 |
| AC-006 | REQ-005, REQ-006 | writer 未挂载/页面隐藏时超过旧 256KiB 阈值仍不截断事件；背压/取消无死锁，native 队列≤8MiB、前端未消费数据≤4MiB（不含 xterm 正常 scrollback）；故障不应用未经确认尺寸。 |
| AC-007 | REQ-002, REQ-006, REQ-007 | 健康本机无人工延迟时，最后一个 resize intent 至对应事件消费 p95≤100ms（100 次，记录机器/负载）；暂停输出只延后提交，恢复后 latest intent 最终送达；Mac/Linux 原路径回归通过。 |
| AC-008 | REQ-007, REQ-008 | 缺失/篡改/错版本/错误架构 runtime 在启动 shell 前失败，cwd 放同名 DLL 不影响实际装载；Windows 开发、NSIS/MSI 干净安装、升级及整包回滚均可复验。 |
| AC-009 | REQ-010 | pnpm check、Rust 相关完整 gate、native 上游/补丁测试、Windows 原生打包通过；两轴窗口/分屏拖动、缩放/DPI、切换工作区目视复验完成，产出原始 trace 与结果。 |

## Behavior Delta

### ADDED
- REQ-001, REQ-004：native 生产端提供版本化、可信、按序的尺寸与输出事件。
- REQ-008：Windows 严格路径的运行时身份验证及打包验证。

### MODIFIED
- REQ-002：Windows 前端由时间驱动 fit 改为 native 事件驱动提交；保留 DOM 自由缩放，grid 随确认事件适配。
- REQ-005, REQ-006：新 Windows 流不再使用会丢前缀的 pending 字节缓存；等待、背压、失败及关闭显式建模。
- REQ-007：最终严格修复版本的能力缺失不再静默回到系统 ConPTY 缓解路径；给出启动错误，用户可整包回滚。

### REMOVED
- REQ-001：120ms 静默期作为 Windows 缓冲一致性依据。可保留可选测量合并优化，但正确性测试必须可将其关闭。

## 风险和回滚

主要风险是 native 输出路径覆盖不全、锁/背压死锁、双缓冲 reflow 差异、受控 DLL 长期维护和打包兼容性。G0 失败则不扩散接线。部署失败整包回滚到前版，新会话重新建立；不在活跃会话中切换 host、协议或解码器。回滚版本仍含已知缓解局限，发布记录必须说明。

## 规格质量审查（2026-09-04）

按 reviewing-spec-quality 单独复读审查，结果 **PASS WITH NOTES**，允许进入分阶段 planning，不表示 G0 通过或方案已实现。审查修正了以下风险：禁止仅在 Rust reader 贴标签；明确 native 扩展未存在；不把空串 write 或 API ack 当作生产端屏障；隐藏缓存不可截断；可信 framing 防止应用伪造；实际 resize 数量进入验收；最终发布无静默 legacy fallback。

REQ-001–010 均有 AC；Delta 均引用 REQ。未决 native 细节有明确 G0 产物/停止条件，不需要用户猜测技术实现。源材料中不可直接使用的进程内 SDK 没有写成现成依赖。范围不含未知的所有终端缺陷，但指定验收中任何丢行仍为失败。

## 下一步

执行 plan 的 TASK-001 / TASK-002（原生可行性），本轮仅交付文档。implementation 开始时再更新 active，全部验收前不归档。
