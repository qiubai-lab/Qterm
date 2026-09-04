# Windows ConPTY 缩放一致性调研

日期：2026-09-04。关联：[spec](../specs/QB-20260904-conpty-ordered-resize.md)、[plan](../plans/QB-20260904-conpty-ordered-resize.md)。

## 结论与证据等级

当前 120ms 防抖不是根治。公开的 stock ConPTY resize API 没有向调用方提供“旧输出结束、新尺寸输出开始”的可靠边界。推荐研究并实现**生产端生成的有序尺寸事件协议**：边界必须产生于受控原生 console host 内部，再由 Rust 和 xterm 顺序消费。此扩展是本项目拟议设计，不是现有 ConPTY API；尚未做出原型，必须通过 plan 的 G0 可行性门槛。

“彻底修复”在这里有明确范围：消除本次**旧尺寸输出跨越新尺寸解析**的竞态；不能据此宣称修复 Windows 所有终端兼容性问题。宽字符、reflow、备用屏幕等若在验收工作负载中仍丢行或错位，仍阻止交付，不能以时序修好为由忽略。

## 本仓库已证实事实

- Windows 26100.9168、portable-pty 0.9.0、xterm 6.0.0，真实 `cmd.exe /d` 输出接入 xterm，无需模拟 shell 字节就可复现。
- 旧调度在 16ms 尺寸变化、60ms 输出延迟下出现 14 份欢迎语；120ms 防抖在相同条件下只提交一次连续拖动的最终尺寸，结果为 1 份。
- 修复后的同一个 probe，改成每 140ms 改变尺寸、200ms 输出延迟，产生 **36 份欢迎语、234 行缓冲，退出码 1**。这是新的必过反例，不是未证实的理论风险。
- `terminalLayout.ts` 的 write 空串回调只排空已送入 xterm 的队列；`resizeScheduler.ts` 的 Promise 仅覆盖 IPC 返回，二者都看不到仍在 native/pipe 中的重绘。
- `local_session.rs` 目前的尺寸命令和输出 Channel 分离；`pty.rs` 的 reader 与 resize 独立运行；读到字节后再贴 generation 无法确定字节产生时的尺寸。
- `useTerminalWorkspaceController.ts` 在未挂载 writer 时会按 256KiB 丢弃较早 pending 字节。有序 resize/data 协议不能直接复用这种截断策略，否则尺寸事件或半条 VT 会丢失。

复现命令（已有例程，Windows 仓库根目录）：

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --example conpty_resize_probe
$env:PROBE_OUTPUT_DELAY = '200'
node scripts/conpty-resize-probe.mjs fixed 140
```

## 一手资料

访问日期均为 2026-09-04。Microsoft Terminal main 阅读快照为 `093e49e29a9f806ff83025c49be5d0c970673b00`（commit 日期 2026-09-03）。它是调研快照，不是拟上线版本。

| 来源 | 可支持的结论 | 不可从中推导的结论 |
| --- | --- | --- |
| S1：[ResizePseudoConsole 文档](https://learn.microsoft.com/en-us/windows/console/resizepseudoconsole)；[winconpty 实现](https://github.com/microsoft/terminal/blob/093e49e29a9f806ff83025c49be5d0c970673b00/src/winconpty/winconpty.cpp) | `_ResizePseudoConsole` 向 signal pipe 写入 resize packet；成功返回不是前端消费完重绘的确认。 | 给 Rust resize 命令返回值加一个 epoch 就有了输出边界。 |
| S2：[PtySignalInputThread.cpp](https://github.com/microsoft/terminal/blob/093e49e29a9f806ff83025c49be5d0c970673b00/src/host/PtySignalInputThread.cpp) | `_DoResizeWindow` 在 console lock 下调用实际尺寸变更，启动前还会暂存 early resize。这里是候选接入点之一。 | 只改这个入口就一定覆盖应用自身、备用屏幕和全部尺寸变化路径。 |
| S3：[VtIo.cpp](https://github.com/microsoft/terminal/blob/093e49e29a9f806ff83025c49be5d0c970673b00/src/host/VtIo.cpp) | Writer/Submit、`_back`/`_front`、overlapped output 等仍需审计；边界必须与所有输出生产路径共同排序。 | 调用 `_flushNow` 就等于接收端完成解析。 |
| S4：[In-process ConPTY 设计](https://github.com/microsoft/terminal/blob/093e49e29a9f806ff83025c49be5d0c970673b00/doc/specs/%2313000%20-%20In-process%20ConPTY.md) | 微软指出异步 resize、不同 reflow 和双缓冲会导致失同步，提出减少/消除双重状态的方向。 | 文档中的 callback API 已经是可直接依赖的稳定 SDK。该文档明确含未完成设计。 |
| S5：[PR #17510](https://github.com/microsoft/terminal/pull/17510)、[问题 #19621](https://github.com/microsoft/terminal/issues/19621) | 上游已做过 VT 直通/翻译重构，但仍有 resize CPR 打断 DCS/APC 的报告；后一问题在调研时为 Open。 | 最新二进制自动保证所有输出顺序；自行向 VT 流插入 OSC/DSR 标记天然安全。 |
| S6：[xterm write API](https://xtermjs.org/docs/api/terminal/classes/terminal/#write) | write 回调可作为前端已提交数据的解析边界。 | 它能确认尚未收到的 native 输出，或保证已经绘制一帧。 |
| S7：[VS Code resize debouncer](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/terminal/browser/terminalResizeDebouncer.ts) | 其防抖区分横向 reflow 成本与纵向更新，是性能调度参考。 | 复刻它即获得跨进程一致性证明。 |
| S8：[Windows Terminal v1.24.11911.0](https://github.com/microsoft/terminal/releases/tag/v1.24.11911.0) | 调研日 stable release；官方 asset 包含 `Microsoft.Windows.Console.ConPTY.1.24.260710001.nupkg`，可作为对照和补丁基线候选。 | 已在 Qterm 上验证通过。本轮未下载、执行或集成该包。 |

## 方案比较

| 方案 | 能否建立生产端边界 | 成本与处置 |
| --- | --- | --- |
| 增大防抖、等待输出空闲、write 回调、仅串行 IPC | 不能 | 已有实测反例；只可保留为兼容缓解，不能成为最终方案。 |
| Rust reader 加 mutex/epoch，在 resize 返回后插入事件 | 不能 | 原生异步生产仍在锁外。会把旧输出错误归到新尺寸；拒绝。 |
| DSR/CPR、shell echo nonce、扫描重绘/CSI 8t | 没有足够契约 | shell 输入并非 control pipe 的同序屏障；控制序列还可能来自应用或处于半条 DCS 中；不作为正确性依据。 |
| 单纯升级/旁加载官方 ConPTY | 尚无保证 | 必须作为 G0 对照测试；能降低旧重绘问题，但无边界证明不能独立满足验收。不能以 OS build 冒充旁加载 runtime 版本。 |
| **受控 native host + 私有 framed output，输出与 resize 共用序列** | **可设计；待原型证明** | 推荐。保留 xterm 与原生 shell，需维护小范围 native 补丁、版本化 ABI、Windows 打包与测试。 |
| 统一的原生终端状态实现/进程内 ConPTY callback 集成 | 架构上更彻底 | 对 renderer/VT/Console API 的替换范围明显更大，相关 SDK 不可假定可用。推荐路径 G0 失败时再单独重塑需求。 |
| 固定 PTY 尺寸、清屏、文本去重、切换 WSL/SSH | 绕过功能或破坏数据 | 不满足用户的 Windows 本地终端需求，排除。 |

## 推荐方案的正确性依据

目标原生事件流：`Hello(size0) → Data(size0) → ResizeCommitted(size1) → Data(size1) → ...`。

1. 受控 host 在**实际尺寸变更与输出生产的共同同步域**内确定边界，先封存旧输出，再提交实际尺寸事件，再发布新尺寸输出。未完成的 native 写缓冲也必须保持这个顺序。任何 native 尺寸变化都必须覆盖。
2. 数据与控制采用私有二进制 envelope。同一原生出口先包装 Data payload，应用打印任意字节都只能成为 payload，不能伪造控制事件。不能在普通 VT 中插一个“看起来罕见”的字符串。
3. Rust 验证帧与序号，通过同一个有序 Channel 传递。前端串行处理 Data/write 完成回调和 Resize/terminal.resize；DOM 测量只产生 desiredSize，不自行改变已提交的终端尺寸。
4. 若上述边界成立，有限传输延迟、分片和消费速度只影响何时应用事件，不改变顺序。该推论解决本次跨尺寸解析竞态；仍需要实际 buffer/reflow 对照验收。

关键区别：`seq` 必须在**生产端**赋予。仅把下游两个本来没有共同顺序的队列合并，并不能补出正确的原生发生顺序。

## 未完成验证与停止条件

本轮完成的是源代码调研、现有反例分析和规格设计；未完成 native 扩展或严格同步原型。尤其尚未证明所有旧 writer、resize 失败、Console API 尺寸改变、长 VT 控制串和锁释放路径都能满足边界。

G0 必须给出可运行原型、锁/输出路径审计、锁定 native revision、可重放事件记录及反例通过结果。若做不到，记录技术阻塞并停止产品接线；不能换成更长 sleep 后宣称完成。无需为此停止本轮文档交付或请求泛化批准。
