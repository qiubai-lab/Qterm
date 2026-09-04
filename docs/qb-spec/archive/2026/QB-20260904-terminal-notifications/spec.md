---
id: QB-20260904-terminal-notifications
type: design
tier: strict
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---

# Qterm 实验性终端通知

## 2026-09-04 已批准实施范围（优先于下方历史调研）

用户已批准落地 plan 并实施，明确总开关位于系统设置/高级、默认关闭、标为实验功能，终端顶部参照 OSC7 显示“通知”。本轮实现第一阶段 BEL/OSC9/OSC777、未读标记、基础后台系统通知。OSC99 与原生点击回调 REQ-008/009 明确留待后续，不是本轮验收。

REQ-010 / AC-010：总开关即时保存，默认及读取异常为关闭；关闭立即清除解析器/未读并停止通知；OSC7 开关独立。设置有实验标签和保存失败反馈，开启后已连接终端顶部出现“通知”，未读有可访问文本，关闭隐藏。独立 notifications.json，不迁移旧设置。

实现调整：在 epoch 验证后的实时输出入口使用有界终端控制序列观察器（仅识别 BEL/OSC9/777，跳过 DCS/APC/PM/SOS），不改写渲染字节。该位置在 writer/回放之前，避免通知依赖 xterm 异步回调和 DOM 生命周期。通过真实 xterm 对照和逐字节分割测试验证协议语义。解析器属于通知特性；不替换 xterm。

系统发送始终使用通用文案，不把远程标题/正文带到 OS；声音不主动播放；仅窗口失焦时发送。主窗口前台其他 Block 使用未读提示。原生发送返回值不表示 OS 已展示。

严格规格检查：PASS WITH NOTES。REQ-001–007、010 的行为和边界可测试，原生各平台实机结果按实际环境记录；REQ-008/009 后续范围明确。本轮不改认证或终端锁实现、不执行远程命令。新增独立设置文件及原生依赖采用 strict 验证。

以下保留原始调研作为决策背景；其中开关默认值、解析位置、阶段范围以本节为准。

本次交付是调研与设计，不是功能实现。以下产品默认值、阶段范围和模块名均为建议，尚未获批。研究基于 Qterm `8f3bad7`、项目安装的 xterm.js 6.0.0，以及 2026-09-04 查阅的官方文档/源码。未来涉及原生权限、设置格式或锁定边界的实施，应按最终范围重新评定实施 tier。

## 结论

推荐复用 xterm 公共 parser API 接收 BEL、OSC 9、OSC 777，通过统一注意力策略产生 Block/Workspace 未读标记和基础系统通知。OSC 99 和原生通知点击定位分别扩展。Qterm 不推断任务是否成功，也不根据普通输出停止、进程退出或 OSC 7 判断 Agent 回合完成。

首版建议叫“终端通知”，承诺“程序请求你关注”，不要把通用 BEL 文案写成“任务执行成功”。CLI 是否发出信号仍取决于其版本、配置、焦点判断或 hook。

## 已验证的项目事实

| 位置 | 事实及影响 |
| --- | --- |
| `src/terminal/TerminalPanel.tsx` | `acquireTerminalView` 创建/缓存 xterm；仅注册 OSC 7，没有通知 handler 或 `onBell` 订阅。应提取 view 生命周期模块，避免继续扩大入口文件。 |
| `src/workspace/WorkspaceShell.tsx` | 对所有 Workspace 渲染 Canvas，用 `visible` 区分前后台。后台工作区通常仍有 writer，可用现有 xterm 解析通知；这不等于原生 WebView 最小化时绝不节流。 |
| `src/workspace/useTerminalWorkspaceController.ts` | 本地 PTY 与 SSH 都进入 `deliverTerminalOutput`；无 writer 时缓冲，注册 writer 时回放。数据回调有 epoch 检查。 |
| `src/workspace/useWorkspaceRuntimeState.ts` | 已有按 Block 隔离的 runtime、epoch、writer ownership。通知状态应接入这个 runtime owner，不另建权威全局 store。 |
| `src/terminal/terminalViewRegistry.ts` | 已提供 `focusTerminalBlock`；可复用来处理应用内未读标记导航。 |
| `src-tauri/src/infrastructure/persistence/json_terminal_settings_repository.rs` | 现有 terminal.json v1 使用 `deny_unknown_fields`；直接追加字段会造成旧版本读回不兼容。 |
| `scripts/source-size-baseline.json` | TerminalPanel、WorkspaceShell、LayoutView 已在尺寸 baseline 中，不允许为此功能扩大上限。 |

现有终端锁仅遮挡操作，不暂停终端输出。通知必须尊重该隐私边界。运行时未读信息不进入 Workspace 持久化。

## 协议与 CLI 覆盖

| 输入 | 建议阶段 | 处理要求 |
| --- | --- | --- |
| BEL `0x07` | 第一阶段 | 接受 xterm `onBell`，生成无正文的 attention；声音和系统通知由产品策略决定。 |
| OSC 9 | 第一阶段 | 接收文本通知；先识别并排除 `9;4` 进度子协议及明确不支持的控制子命令。 |
| OSC 777 | 第一阶段 | 仅处理 `notify;title;body`；按前两个字段边界拆分，正文保留后续分号。 |
| OSC 99 | 第二阶段 | 按会话及 `i` 组装 `title/body`、处理 `d=0/1`；支持范围必须有能力查询与明确限制。 |
| OSC 7 | 保持现状 | 仅用于当前工作目录，通知开关与远程目录集成开关互不绑定。 |

OSC 9 的进度条与通知共用编号，不能见到 9 就弹窗。[iTerm2 协议](https://iterm2.com/documentation-escape-codes.html)

OSC 99 的正文可能分多段，且还有查询、关闭、激活回执、声音和图标等能力。第一阶段不宣称支持；第二阶段的能力回答只公布实际实现项，不把查询报文展示成消息，不把通知声明的 action 解释成可执行命令。[Kitty 协议](https://sw.kovidgoyal.net/kitty/desktop-notifications/)

| CLI | 第一阶段接入建议 | 仍需验证 |
| --- | --- | --- |
| Codex | 显式选择 `osc9` 或 `bel`；不要依赖自动终端识别。 | 所用版本的通知触发条件；窗口失焦与 Block 切换是否正确传达给 CLI。 |
| Claude Code | 使用 `preferredNotifChannel: terminal_bell`。 | 通知延迟及空闲条件；不能把 shell 补全铃声和任务完成自动区分。 |
| pi | 加载官方 `notify.ts` 扩展；普通分支使用 OSC 777。 | `WT_SESSION`/`KITTY_WINDOW_ID` 会使示例选择其他分支；若继承环境误判，应在扩展中显式选协议。 |
| Kimi Code | 按版本配置 Stop/Notification hook，由适配脚本发出通知。 | hook stdout/stderr 捕获、是否拥有 controlling TTY、Windows/SSH/tmux 路径；不承诺简单 printf 即可。 |

来源：[Codex 官方配置](https://learn.chatgpt.com/docs/config-file/config-advanced#notifications)、[Claude Code 终端配置](https://code.claude.com/docs/en/terminal-config#get-a-terminal-bell-or-notification)、[pi 官方示例](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/notify.ts)、[Kimi Hooks](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/hooks.html)。

本次查看的 Kimi CLI 源码 commit `86f136422a0aae6b217ea49e7ea1d2e8a1defcd2` 中，`hooks/runner.py` 捕获 stdout/stderr。该源码快照与最新改名后的文档可能存在版本差异；实施适配时应固定实际安装版本。Unix 向 `/dev/tty` 写入只作为有 controlling TTY 时的候选，不能作为跨版本、跨平台保证。[该版本源码](https://github.com/MoonshotAI/kimi-cli/blob/86f136422a0aae6b217ea49e7ea1d2e8a1defcd2/src/kimi_cli/hooks/runner.py)

## 方案比较

| 方案 | 优点 | 代价/限制 | 判断 |
| --- | --- | --- | --- |
| xterm 公共事件 + 应用策略 + 原生发送适配器 | 复用已有 VT 状态机；自然处理分块、BEL 结束符、本地/SSH | 依赖 WebView 执行及 view 生命周期；需要回放和 epoch 保护 | 推荐第一阶段 |
| 在 Rust 输出流旁解析通知 | 可脱离 view，在原生侧及时处理 | 另建 VT 状态机；必须区分 OSC/DCS/字符串内 BEL；与现有 parser 双重维护 | 仅当最小化实测不达标或未来引入无 view 后台会话时采用 |
| 为每个 CLI 做专用 hook/Agent API 集成 | 可得完成、审批、失败等明确语义 | 版本维护、远程传输及配置成本高；超出通用终端职责 | 可选工具适配层，不作为终端通知基础 |

推荐的数据路径：

```text
PTY / SSH bytes
  → 已有 epoch 验证与输出分发
  → xterm 有序 write / parser
  → 纯协议解码（BEL / OSC 9 / OSC 777）
  → attention 策略（目标、焦点、锁定、去重）
  → runtime 未读状态 → Block / Workspace 标记
  → 原生发送 adapter → 操作系统通知
```

CLI 没发信号时，接收端不能弥补。不要伪装 `TERM_PROGRAM=iTerm.app` 或设置 Kitty 标识来强制自动识别，这会启用尚不支持的其他终端能力，且 Qterm 的 macOS OSC 7 现有集成会使用 Apple_Terminal 标识。

## 第一阶段交互建议

以下默认值待产品确认：终端通知接收开启；桌面通知由设置显式启用；声音关闭；仅在 Qterm 不在前台时发送桌面通知；默认隐藏程序正文，仅展示 Qterm 提供的工作区/目标概要与“终端需要关注”。

| 场景 | 应用内标记 | 桌面通知 |
| --- | --- | --- |
| Qterm 前台，来源 Block 正在被操作，且无锁屏/遮挡对话框 | 不积累未读 | 不弹 |
| Qterm 前台，其他 Block 或 Workspace | Block 标记，Workspace 聚合 | 默认不弹，可选“来源终端未聚焦时” |
| Qterm 失焦或最小化 | 保留未读 | 启用后发送 |
| Qterm 终端锁定 | 保留未读，不展示正文 | 最多通用文案；不显示正文、目录或主机信息 |
| 通知权限不足、勿扰或发送不可用 | 保留未读 | 不重试轰炸，不声称已送达 |

以“应用窗口焦点 + 来源 Workspace/Block 活动状态 + 实际交互焦点 + 锁定/模态状态”计算 attention。持久化的 activeBlockId 不能独立代表用户正在看该终端。

Workspace 未读由其 Block 集合派生。进入 Workspace 不自动清除所有 Block 的未读；在解锁且前台时聚焦具体 Block，或明确点击该 Block 的标记才确认已读。不自动切换窗口，不在通知到达时抢焦点。

去重初始建议：同会话同协议同正文 5 秒内不重复弹；同会话桌面通知最多 2 秒一次，全局最多 5 秒 3 次，超额仍保留未读但不排队补发。先不做无依据的跨协议语义去重。参数进入具名常量和可控时钟测试，不散落魔法数。

## 生命周期、解析与性能边界

1. 事件携带 Qterm 生成的 `workspaceId/blockId/sessionEpoch`，不相信输出中的归属信息。按 epoch 而不是仅 `blockId:profileId` 绑定，因为同目标可重连。
2. 接收字节时与处理 parser 回调时都验证归属；xterm write 异步，旧数据排队后会话可能已变。新 epoch 的 reset/新数据必须位于明确的写入屏障之后，避免旧半条 OSC 与新会话拼接。
3. 为输出元数据增加 live/replay 和接收时间。缓冲回放仍渲染文本，但不作为新的系统通知来源；同一旧未读状态保留。跨回放/实时边界的分段序列也不得误报。
4. 不能在 `terminal.write` 前后同步切换一个 replay 布尔值：parser 回调发生得更晚。应由有序 write adapter 在 write completion 边界管理 epoch/source 上下文，并与 reset、dispose 一起测试。不能为此造成无限队列或显著降低吞吐。
5. handler 只做同步解码/入队，立即返回，不等待权限请求或原生调用。批量普通输出不触发 React setState。协议字符串不能用对每个 chunk 的正则扫描替代 VT 状态机。
6. 建议通知正文最大 4 KiB、标题 128 个 Unicode 字符，控制码/双向控制字符清理，纯文本渲染；超大 OSC payload 拒绝。该限制发生在 xterm 完成解析后，不是整个输出流的内存硬限制：xterm 当前通用 OSC 上限为 10,000,000，仍需压力验证，不能声称只会分配 4 KiB。
7. OSC 99 第二阶段按 session+id 设置有限组装缓存和超时；建议每会话最多 16 条未完成消息、每条 8 KiB、30 秒过期。不同会话的相同 `i` 不能合并。
8. xterm 已在启用 focus reporting 时发送 CSI I/O；先实测原生失焦、切 Workspace、进入 Files/对话框等路径，必要时补生命周期同步，不无条件注入焦点序列。Codex 的 always 配置仅是调试/适配手段。
9. SSH 原始序列沿现有终端通道到达本地，不新增网络服务。tmux 是否传递序列属于发送链路兼容测试，不承诺首版解包任意 DCS passthrough。

## 模块归属建议

| 模块（拟新增或提取） | 唯一主要职责 |
| --- | --- |
| `src/terminal/terminalView.ts` | 从 TerminalPanel 提取 xterm 创建、缓存、释放及有序写入生命周期；通过窄接口挂接协议适配器。 |
| `src/terminal/notifications/terminalNotificationProtocol.ts` | 已解析 OSC payload 的纯映射、子协议过滤、文本界限。 |
| `src/terminal/notifications/bindTerminalNotifications.ts` | xterm 公共 handler 订阅、释放及当前输出上下文绑定；不调用系统通知。 |
| `src/workspace/terminalAttention.ts` | 前后台/已读/锁定/限流纯规则。 |
| `src/workspace/useTerminalAttentionController.ts` | 使用已有 runtime owner 编排收到事件、确认已读和发送请求；不拥有第二套 session store。 |
| `src/lib/tauri/notifications.ts` | Qterm 通知 IPC DTO 与结果映射，隔离插件细节。 |
| Rust `commands/notification.rs` | 薄 DTO 边界，只接受受限文本及 Qterm 目标 token。 |
| Rust notification application / port / infrastructure | 用例与平台发送实现分离；不接收任意命令、图片 URL 或脚本路径。小切片只建必要层。 |
| notification settings repository | 独立设备偏好，优先新建 `device/notifications.json`，不扩写旧 terminal.json；缺失用默认，损坏保留原文。 |

Block/Workspace 展示只消费派生状态。现有 baseline 入口必须先按职责提取，不能涨行数上限。具体文件名在实施计划中确定；本草案不改变 Directory Map 或长期 context。

## 原生通知选型与重要限制

第一阶段可采用 Tauri notification 插件，封装在 Qterm adapter 后，提供“尝试发送”的基础能力。不要将 API 返回成功写成“通知已送达”。

本次读取插件 v2 桌面实现发现：权限接口直接返回 Granted；发送内部异步忽略底层 show 错误；只转发标题、正文、图标、声音，没有把目标 token 或点击回调交给底层。由此不能依赖通用 JS onAction API 实现三平台的精准定位。该结论是对本次源码的判断，实施前应锁定依赖版本再核实。[桌面实现](https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/notification/src/desktop.rs)

Windows 正式验收需安装包；开发态通知身份不能代表发布态。macOS 插件开发模式可能使用 Terminal 身份，即使 Qterm 已有独立 Dev.app 也不能假定身份正确，应分别测试开发与正式包。[Tauri 支持说明](https://v2.tauri.app/plugin/notification/)

设置页应提供“发送测试通知”和引导检查系统通知设置。发送不可用时保留应用内标记；原生权限未知要如实表示，不反复触发授权请求。

第三阶段如果要求点击定位，需独立平台适配评估：macOS UNUserNotificationCenter delegate/userInfo，Windows toast activation，Linux notification actions。按平台暴露 capabilities；不支持时只保留应用内导航。对激活 token 验证 epoch、目标存在性和锁定状态；旧通知不能聚焦重连后的新会话，点击不能绕过终端锁或向 shell 输入字符。

## 建议阶段与投入

这是工作量量级估计，不是交付承诺；假设单人开发，三平台均可测试。

| 阶段 | 可交付结果 | 估计 |
| --- | --- | --- |
| 0：验证切片 | 最小化/WebView 回调、焦点序列、正式包原生发送和身份；确定适配器能力 | 0.5–1.5 人日 |
| 1：基础通知 | BEL/9/777、未读、去重、锁定处理、设置、基础系统通知、CLI 配置指南、回放/重连保护 | 3–5 人日 |
| 2：协议扩展 | OSC 99 有界组装与能力查询、pi/SSH/tmux 兼容 | 1–2 人日 |
| 3：原生交互 | 平台点击回调、精确导航、关闭/替换等逐项能力 | 3–6 人日，平台差异可能增加 |

第 0 阶段若发现最小化持续暂停前端处理，先调整架构，不把无法及时提醒的行为发布为“后台通知支持”。第一阶段应用内标记导航可独立完成，不依赖原生点击回调。

## 草案需求与验收映射

| 需求 | 可观察验收及验证方式 |
| --- | --- |
| REQ-001：支持 BEL、OSC 9、OSC 777，保持 OSC 7 原行为 | AC-001：真实 xterm 的跨 chunk、BEL/ST 结束符输入只产生预期事件；OSC 9;4 不通知；OSC 7 目录同步回归测试通过。 |
| REQ-002：本地和 SSH 后台来源准确、旧会话/回放不误报 | AC-002：覆盖 hidden Workspace、无 writer 回放、目标切换、同目标重连、异步 write 后关闭及跨边界半条 OSC；事件只归属于当前 epoch，历史回放不新增系统通知。 |
| REQ-003：统一注意力、未读和限流策略 | AC-003：前台聚焦不弹，其他 Block/Workspace 保留标记，后台按设置发出；聚焦具体 Block 仅清其未读；固定时钟验证去重/限流且超额不补发。 |
| REQ-004：通知尊重锁定与内容边界 | AC-004：锁定时无正文/路径/主机披露；超长/控制码输入受限；通知不能执行命令、打开任意 URL、改变目标或绕过锁。 |
| REQ-005：基础系统通知可配置并有真实能力说明 | AC-005：测试通知可用；失败或被系统屏蔽时应用内未读不丢失；不将权限 Granted/发送返回值当送达证明；在正式平台包验证。 |
| REQ-006：保持终端吞吐与设置兼容 | AC-006：通知处理不等待 IPC、不引入逐 chunk React 更新；用同一 10 MiB 混合输出样本与基线比较，处理耗时中位数增幅目标不超过 10%；旧 terminal.json 不改写，新增设置缺失/损坏/未来版本路径有保护。 |
| REQ-007：提供可复现的 CLI 适配说明 | AC-007：记录实际 CLI 版本，分别验证 Codex 显式协议、Claude bell、pi 扩展；Kimi 只发布经过相应 OS/版本验证的 hook，不宣称未测试平台兼容。 |
| REQ-008：第二阶段 OSC 99 支持边界可查询 | AC-008：分片 title/body 合成一次，同 id 不跨会话；超时/超限清理；查询只声明实际能力，查询和关闭请求不变成正文通知。 |
| REQ-009：第三阶段原生点击不误定位 | AC-009：三平台逐项验证实际能力，关闭目标/旧 epoch/锁定状态不能误操作；不支持平台明确降级。 |

实施前需再细化的验证：第 0 阶段每个目标平台失焦/最小化后，用实际 PTY 定时输出通知测量接收延迟；首版目标是在非休眠且系统允许通知时，Qterm 接收至提交 OS 请求不超过 1 秒。OS 弹出时间受系统控制，不作为 Qterm 可保证指标。

第 1 阶段完成后运行相邻行为测试和 `pnpm check`；有 Rust 变更时运行 fmt/clippy/test。因为引入原生依赖，应做正式包验证，Windows 需安装后测试。UI 验收保留截图。此处均为未来验收安排，不表示本次已经执行。

## 本次已做的验证

- 只读检查 Qterm 输出、view、runtime、设置和锁定边界。
- 用项目安装的 xterm.js 在 Node 中直接实例化 Terminal，注册 `onBell` 和 OSC 9/99/777 handlers，通过 write callback 等待处理完成。
- 分两段发送 `OSC 777;notify;Pi;Ready BEL`：收到一次完整 OSC 777，没有额外 bell。
- 再发送独立 BEL：收到一次 bell。
- 发送 `OSC 9;4;1;50 ST`：收到 payload `4;1;50`，证明需要 Qterm 显式排除。
- 发送两条 OSC 99 title/body：收到两个独立 payload，证明需应用层组装。
- 未安装原生依赖，未发送实际系统通知，未运行真实 CLI 任务，未执行三平台端到端测试。

## Behavior Delta

本次仅增加设计文档，不改变运行行为。以下是后续实施的候选 Delta：

### ADDED

- REQ-001、REQ-002：来自本机或远端程序的终端注意力信号接收与会话归属。
- REQ-003、REQ-004：尊重焦点和锁定的未读标记、去重与内容约束。
- REQ-005、REQ-006：基础原生发送与独立设备偏好。
- REQ-007：CLI 适配指南。
- REQ-008、REQ-009：后续阶段的 OSC 99 和按平台验证的点击定位。

## 质量检查、未决项与下一步

研究阶段轻量检查通过：选项、证据/推断、阶段边界、REQ/AC 均已对应；没有把未来原生测试或 CLI 配置试验写成已验证事实。无需在本次研究中执行严格实施审查。

待确认的产品选择是桌面通知默认开关、正文隐私默认值、是否必须首版支持原生点击定位；本草案已给出推荐，因此不阻塞调研交付。后台 WebView 和平台通知能力是第 0 阶段技术验证项。

下一步：以用户选定的阶段和默认策略收敛正式实施计划；若用户要求原生点击、权限/锁定能力或设置迁移成为首版范围，重新选择实施 tier 和必要审查。当前保持 draft，不实施、不归档、不更新长期产品偏好。

## Completion

2026-09-04：本轮批准的实验通知范围已实现并验证，规格/计划归档。平台与 CLI 实机覆盖限制见 plan 的 Verification Evidence / Residual Risk。
