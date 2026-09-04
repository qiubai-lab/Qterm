---
id: QB-20260904-macos-notification-delivery
type: bugfix
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
---
# 实施计划

1. AC-001：macOS adapter 使用 UserNotifications，查询/请求权限，等待提交完成。
2. AC-002/003：端口返回通知错误、IPC worker 执行并串行设置、前端显示失败且保留未读。
3. AC-004：相关自动化检查、macOS 打包、实机验证与文档更新。

核心策略仍属于 NotificationService；Cocoa 对象仅存活于原生 worker，回调仅传递状态值。没有跨模块共享原生对象。

## 验收证据

- AC-001：UserNotifications adapter、bundle 完整签名已实现；codesign 显示开发版 identifier=com.qiubai.qterm.dev、release identifier=com.qiubai.qterm，Info.plist 已绑定。release `codesign --verify --strict` 通过。11:23:49 系统日志明确 `Entitlement check success: matching bundle identifiers`。
- AC-002：用户在系统弹窗允许授权；11:24:04 日志 `didGrant: 1 hasError: 0`、`Added notification request: hasError: 0`、usernoted `Presenting ... as banner`。真实本地 PTY → OSC9 → 后台 → OS 横幅交付已确认；临时 Workspace 5 已删除。
- AC-003：新增原生权限错误传播测试与前端原生失焦回归；Rust 通知相关 4 个测试、fmt、all-targets/all-features Clippy 通过。设置读写与发送移入阻塞 worker，保留串行策略。等待 Cocoa 回调最多 30 秒。
- AC-004：pnpm check 一轮完整通过（焦点回归加入前）；最新全量 856/857 通过，未改动 GitChangePreview 语法异步加载用例在并行构建期间超时，独立重跑该文件及通知 provider 全部 14 项通过；未放宽测试超时。ESLint、source-size、TypeScript/Vite 与脚本测试通过。macOS app 打包通过；无公证凭据，本地 ad-hoc 签名不是 Developer ID 公证分发。

## 范围与残余风险

macOS 端到端展示由系统日志证实；开发版签名验证通过，Qterm Dev 的授权独立于 Qterm，首次仍需用户允许。Windows/Linux 路径未变且未实机复验。未覆盖系统勿扰、授权弹窗超过 30 秒、用户后续撤销授权的全部 UI 组合；这些情况下保留未读并提示错误。没有添加私有 entitlement，没有修改用户系统通知数据库。未替换 /Applications 的已安装应用。
