## Goal

将帮助页改造成可信、紧凑的 Qterm 项目信息入口，让用户能确认项目身份、作者、源码地址、当前安装版本和更新能力状态。

## Scope

- 移除帮助页中的快捷键说明。
- 展示项目名称、作者、项目地址、运行时应用版本、许可证和产品简介。
- 为更新检测保留静态占位区域，不提供任何更新相关操作。
- 评估正式版本检测与应用内更新的安全实现路径。

## Constraints

- 保持 Qterm 既有深色工作台视觉语言、DialogFrame 行为和无障碍约束。
- 当前唯一版本源是 `src-tauri/Cargo.toml`；页面必须读取 Tauri 应用元数据，不复制硬编码版本。
- 当前发布流水线只上传普通安装包，尚无 updater 签名、签名产物或 `latest.json`。
- 不把直接请求 GitHub Latest Release API 描述为安全的应用内更新机制。

## Non-Goals

- 本次不安装 Tauri Updater、不生成或管理签名私钥。
- 本次不改造发布流水线，不下载、安装或重启应用。
- 快捷键文档仍由 README 等用户文档承担。

## Acceptance

- 帮助入口和对话框明确呈现为“关于 Qterm”。
- 页面不再出现快捷键设置或操作指南。
- 应用内显示的版本来自 Tauri 运行时元数据；浏览器开发模式有明确降级状态。
- 更新区域明确说明功能仍在规划，不误报“已是最新版本”，也不提供检查、下载或跳转发布页操作。
- GitHub 项目页可从内容中访问。
- 页面在紧凑窗口、键盘导航与 reduced-motion 下保持可用。

## Acceptance To Verification

- 组件测试验证元数据、版本成功/失败状态、链接和快捷键内容移除。
- WorkspaceShell 测试验证工具栏入口名称。
- 样式测试与 `pnpm check` 验证布局契约、类型、Lint、测试和构建。

## Open Questions

- 启用正式自动更新前，需要项目维护者确定并安全保管长期 updater 私钥。
- macOS 与 Windows 的操作系统级代码签名/公证是否同步启用，应在发布改造任务中决定；它与 Tauri updater 的内容签名不是同一层。

## Recommended Approach

推荐使用官方 Tauri 2 Updater + GitHub Releases 静态 `latest.json`：应用内只通过 updater 插件检查、验证签名和安装；CI 使用受保护 secret 中的私钥生成 updater artifacts、`.sig` 和跨平台清单。第一阶段仅提供手动“检查更新”，新版本可用时展示版本与说明，再由用户明确触发下载/安装。

不推荐直接调用 GitHub Releases REST API：它可快速比较 tag，但缺少 Tauri 的强制签名校验、平台包选择和安全安装链路，只适合“跳转发布页”的通知型实现。自建动态更新服务支持灰度、渠道和回滚，但当前项目规模下增加了不必要的服务运维成本。

参考：[Tauri Updater 官方文档](https://v2.tauri.app/plugin/updater/) 与 [Tauri GitHub 发布流水线](https://v2.tauri.app/distribute/pipelines/github/)。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`（运行时版本读取的成功/失败状态）
- `verifying-before-completion`
- Project Context: not needed，本次不改变长期产品或架构边界。
- Directory Map: not needed，本次不移动模块或入口。
