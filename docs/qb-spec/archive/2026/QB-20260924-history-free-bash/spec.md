---
schema: 1
id: QB-20260924-history-free-bash
type: feature
tier: standard
status: archived
created: 2026-09-24
updated: 2026-09-24
supersedes: []
---

# 实验性无历史 Bash 会话

用户已批准评估中的受控 Bash 方案，并要求在高级设置增加实验功能开关。范围为 Qterm 启动的 Bash，不承诺服务器审计、其他程序日志或嵌套 Shell 无痕。

## Requirements

- REQ-001：高级设置新增“无历史 Bash 会话”开关，默认关闭、即时持久化、实验功能标签、保存失败反馈；旧设置兼容。
- REQ-002：新建及重连的终端读取启动策略；已有会话不改变。SSH 与支持 Bash 的本地 Unix 会话从启动起不读取或收集用户历史、不修改已有历史文件，跳过用户启动配置。
- REQ-003：OSC 7 和目录恢复独立工作，初始化不经交互输入、不执行原历史删除逻辑；初始化确认前禁止交互，失败/超时不降级。
- REQ-004：会话成功后呈现明确的无历史提示；不支持的本地平台、远程启动失败给出明确错误。普通会话、文件/Git 会话保持原行为。

## Acceptance

- AC-001 [REQ-001]：设置 UI 与持久化测试覆盖默认、开启、关闭、独立更新及保存失败，实验标签可见。
- AC-002 [REQ-002, REQ-003]：真实 Bash/PTY 验证普通、多行命令和 OSC Hook 均不进入 history；退出与中断不改变预置历史；目录包含特殊字符仍按字面恢复。
- AC-003 [REQ-003, REQ-004]：握手覆盖跨 chunk、超时、关闭、输出上限；失败不进入 Connected；OSC 开/关两种模式验证。
- AC-004 [REQ-002, REQ-004]：连接参数及本地适配测试保护模式隔离、普通会话兼容与不支持平台错误；pnpm check、Rust fmt/clippy/test 通过。

## Behavior Delta

### ADDED
- REQ-001：高级设置新增实验性无历史会话偏好。
- REQ-002：连接启动时选择独立受控 Bash 策略。
- REQ-003：新增受控初始化握手，并保留 OSC 7 可选目录同步。
- REQ-004：成功提示与失败关闭，不静默降级。

## Implementation plan

规则与固定 Bash 脚本归 domain/history_free_shell；启动/握手归 SSH 与 local infrastructure 的独立模块。设置复用现有 TerminalSettings 仓储及 DTO；UI 复用 settings-row/switch/experimental-tag。新模块保持源码大小门禁；已有大文件仅接线，测试按能力分离。

1. 设置模型、兼容存储与 UI。
2. 受控 Bash 启动、OSC/目录初始化与有界握手。
3. SSH/本地会话接线、失败处理及会话提示。
4. 行为测试、真实 Shell 验证、完整工程检查、使用说明与归档。

## Evidence

- AC-001：`SettingsDialog.historyFree.test.tsx` 覆盖默认关闭、实验标签、即时保存、恢复、关闭、OSC 独立性和保存失败/busy；与原设置测试一起 13 项通过。仓储测试覆盖旧 schema v1 无新字段时默认关闭且不重写，以及新偏好往返；DTO 测试覆盖布尔类型和默认输出。
- AC-002：Windows 开发机用 Git Bash + 真实 ConPTY 运行 `QTERM_TEST_BASH=D:/SDK/Git/bin/bash.exe cargo test history_free -- --include-ignored`，7 项通过，其中真实 Shell 用例执行 OSC 开/关 × 正常退出/kill 四组合，验证多行/普通命令无内存历史、用户 rc 未加载、特殊目录按字面恢复及预置 history 不变。
- AC-003：内存 SSH 服务端通过真实 SSH transport 验证普通路径兼容、无历史路径仅 exec、不使用默认 Shell/探测、两个 OSC 状态、分片握手、拒绝/关闭/超时不降级、取消期间禁止输入且取消不报失败。`cargo test shell_startup` 3 项通过，覆盖跨块、输出上限、不同会话标记以及命令原样回显不能冒充 ready。本地握手单测覆盖输出保留/标记移除和提前 EOF。
- AC-004：`pnpm check` 通过（1106 前端测试通过、2 skipped；17 脚本测试通过；lint、TypeScript、production build、source-size 均通过）。Rust 全量 `cargo test --all-targets --all-features` 308 passed / 5 ignored；随后新增的握手加固、取消、设置 DTO 测试与相关真实 Bash 用例均通过定向重跑。最终 `cargo clippy --all-targets --all-features -- -D warnings`、`cargo fmt --check`、source-size 和 diff whitespace 检查通过。最后仅 OSC 说明文字更新后重跑设置测试、ESLint 和 production build 通过。
- UI：通过浏览器渲染实际 SettingsDialog/主题样式，以内存 IPC fixture 进行界面验证；窄窗口独立滚动、实验标签、开关及保存反馈无溢出，未改真实用户偏好。
- 环境范围：当前机器为 Windows；验证了本地不支持时明确拒绝及 Git Bash 真实 PTY。Linux/macOS 本地适配器尚未进行原生实机测试；未运行依赖外部 OpenSSH 服务端的既有 ignored 用例，也未构建安装包。本功能未改变打包/原生依赖。
- 已补充 `docs/history-free-bash.md` 和 Directory Map；未修改长期 context、未提交或发布。
