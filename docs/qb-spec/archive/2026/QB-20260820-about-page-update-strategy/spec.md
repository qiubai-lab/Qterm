---
id: QB-20260820-about-page-update-strategy
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

将帮助页改造成可信、紧凑的 Qterm 项目信息入口，让用户能确认项目身份、作者、源码地址、当前安装版本和更新能力状态。

## Scope

- 移除帮助页中的快捷键说明。
- 展示项目名称、作者、项目地址、运行时应用版本、许可证和产品简介。
- 提供由用户手动触发的 GitHub Latest Release 检测。
- 发现新版本时只提示并打开固定的 Qterm Releases 页面，由用户自行下载。

## Constraints

- 保持 Qterm 既有深色工作台视觉语言、DialogFrame 行为和无障碍约束。
- 当前唯一版本源是 `src-tauri/Cargo.toml`；页面必须读取 Tauri 应用元数据，不复制硬编码版本。
- 当前发布流水线只上传普通安装包；本功能不得下载或执行远程资产。
- 远程响应只提供版本提示，下载入口必须是代码内固定的 Qterm Releases URL。

## Non-Goals

- 本次不安装 Tauri Updater，不生成签名、下载、安装或重启应用。
- 本次不显示或使用 GitHub API 返回的资产下载地址与远程 release notes。
- 本次不增加启动时后台检查或检测频率缓存。
- 快捷键文档仍由 README 等用户文档承担。

## Acceptance

- 帮助入口和对话框明确呈现为“关于 Qterm”。
- 页面不再出现快捷键设置或操作指南。
- 应用内显示的版本来自 Tauri 运行时元数据；浏览器开发模式有明确降级状态。
- 更新区域覆盖初始、检查中、已是最新、发现更新和失败状态。
- 发现更新时可通过系统默认浏览器打开固定 Releases 页面；没有更新时不提供下载入口。
- 网络或响应格式失败不得误报“已是最新版本”。
- GitHub 项目页可从内容中访问。
- 页面在紧凑窗口、键盘导航与 reduced-motion 下保持可用。

## Acceptance To Verification

- adapter 测试验证正常、跨位数版本、异常 tag、HTTP 失败和网络失败。
- 组件测试验证检测状态、重复点击保护、固定下载入口和快捷键内容移除。
- WorkspaceShell 测试验证工具栏入口名称。
- 样式测试与 `pnpm check` 验证布局契约、类型、Lint、测试和构建。

## Open Questions

- GitHub 当前 Latest tag 与安装资产版本不一致，需要在下一次正式发布前修复；本功能不会自动下载该资产。

## Recommended Approach

采用通知型 GitHub Latest Release 检测：只读取 `tag_name` 并与 Tauri 运行时版本做严格的稳定版三段式比较。远程响应不能决定跳转地址，系统浏览器只允许打开代码内固定的 `https://github.com/qiubai-lab/Qterm/releases/latest`。未来若需要应用内下载安装，应在 adapter 后替换为 Tauri Updater，而不改变页面状态模型。

## Next Skills

- `writing-qb-plans`
- `checking-architecture-boundaries`（隔离 GitHub transport DTO、项目 DTO 与 UI 状态）
- `protecting-critical-behavior`（版本比较、异常响应和并发检查）
- `verifying-before-completion`
- Project Context: not needed，本次不改变长期产品或架构边界。
- Directory Map: not needed，本次不移动模块或入口。
