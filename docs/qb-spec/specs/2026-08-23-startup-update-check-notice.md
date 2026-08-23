> 实施状态（2026-08-23）：已落地。新增独立更新偏好 schema/IPC、默认关闭的关于页受控开关、StrictMode 单次启动检测，以及“关于”按钮 5 秒主题色呼吸提示；前后端全量质量门已通过。

## Goal

Qterm 允许用户在“关于”页启用启动时自动检测更新。检测在后台安静完成；仅当发现更高稳定版本时，让右侧“关于”入口以当前主题强调色短暂呼吸提示，不增加浮层。

## Scope

- 在“关于”页检测更新组件中，于手动“检测更新”按钮之前增加设备级开关。
- 开关状态持久化，并在下次启动读取；默认关闭，避免未经选择的启动网络请求。
- 启用后，每次应用 shell 启动只执行一次现有 GitHub Latest Release 检测。
- 仅 `available` 结果触发“关于”按钮提示；`latest` 与失败结果保持静默，不阻断 Workspace 启动。
- “关于”按钮使用当前主题 `navigation-accent` 呼吸 5 秒；按钮可访问名称包含新版本号，点击后打开“关于”页并立即停止提示。
- 手动更新检测流程、Release 打开行为与 Homebrew 指引保持不变。

## Constraints

- 更新偏好属于 application/device setting，不进入 Workspace 文档、外观设置或安全设置。
- 启动检测复用 `src/lib/updateCheck.ts`，UI 不自行请求 GitHub、解析 SemVer 或打开任意 URL。
- 使用独立、严格、版本化的更新偏好文件；损坏或未来版本文件不得被覆盖，并安全回退为关闭。
- 工具轨提示不增加气泡或改变轨道宽度；仅动画颜色/阴影，reduced motion 下退化为静态主题强调。
- 开关必须具有 `switch` 语义、可见焦点、忙碌与失败反馈；不能只靠颜色表达状态。
- 不新增网络、状态管理或动效依赖。

## Non-Goals

- 不自动下载、安装或强制打开 Release 页面。
- 不提供更新频率、跳过版本、渠道或 prerelease 设置。
- 不在一次运行中周期轮询，也不在手动检查失败时弹出全局错误。
- 不把通知做成阻塞弹窗、系统通知或长期红点。

## Acceptance

- A1：默认关闭；用户启用后跨重启保持，关闭后不再进行启动检测。
- A2：更新偏好使用独立 `device/updates.json` schema v1；严格拒绝未知字段/未来版本并保留原文件。
- A3：启动检测每次挂载最多一次，且只有设置成功读取为启用时才调用；读取、网络与解析失败均不影响工作区。
- A4：发现新版时，“关于”按钮按当前主题强调色呼吸 5 秒，且无额外气泡；点击按钮打开“关于”并停止提示。
- A5：已是最新版时不显示提示；手动检测仍按现有弹窗显示完整结果和错误。
- A6：开关位于手动按钮之前，支持键盘与 screen reader，持久化期间禁用；保存失败恢复原值并给出局部反馈。
- A7：提示在 Dark、Light、Cyberpunk 三个主题中只消费语义 token，不引起工具轨或图标位置抖动；reduced motion 下不播放呼吸动画。
- A8：IPC 仅增加 `updates` snapshot 与窄 `settings_update_updates`，不改变 security、appearance、Workspace 或更新检查 transport 的语义。

## Acceptance To Verification

- A1/A2/A8：Rust domain/repository/application/DTO 测试与 TypeScript settings bridge 测试。
- A3/A4/A5：WorkspaceShell Testing Library 测试，mock settings/update adapter 并使用 fake timers。
- A6：HelpDialog 交互测试覆盖 switch 语义、保存成功/失败及 disabled 状态。
- A7：CSS contract 测试与三主题人工检查，验证绝对定位、opacity-only 动画和 reduced-motion。

## Recommended Approach

采用独立 `UpdateSettings` domain model、repository port 与 `device/updates.json` adapter，由既有 SettingsService 聚合进 snapshot。相比 `localStorage`，它保持 Rust settings 为持久化真相；相比塞进 `appearance.json`，它不会把网络行为误归为视觉偏好，也不会扩大安全设置 schema。

`WorkspaceShell` 作为应用交互组合边界，在首次读取设置后编排一次静默检测，并只保存可展示的 `latestVersion` 通知状态。“关于”页作为受控设置编辑器调用窄 IPC；更新解析、超时与 Release URL 继续由既有 update adapter 拥有。

## Open Questions

无阻塞问题。按低打扰原则采用默认关闭、单次启动检测、5 秒按钮呼吸生命周期；按钮点击后打开“关于”页，方便用户继续手动查看与更新。
