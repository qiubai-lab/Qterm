---
id: QB-20260904-macos-notification-delivery
type: bugfix
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
---
# macOS 通知交付修复

用户授权修复。系统 usernoted 拒绝 Qterm Dev 的 LegacyConnection 请求；旧插件权限接口恒返回 Granted、异步发送错误被忽略。

- AC-001：macOS 使用 UNUserNotificationCenter 与实际 bundle identity，未授权时请求 Alert 权限，拒绝时返回可见错误。
- AC-002：等待系统提交回调，不把队列提交视为横幅展示；失败保留应用内未读并显示设置反馈。
- AC-003：不阻塞主线程；保留开关与提交串行、后台抑制、限流与通用正文。
- AC-004：Rust/前端相关检查、原生打包；可用实机验证授权及提交，不能观察横幅时明确记录。

Behavior Delta：macOS 原生 adapter 替换旧通知插件发送路径；其他平台保持现状。独立设置 schema 不变。首次通知可能弹系统授权，不代替用户选择授权。系统响应等待有 30 秒上限。

补充根因：usernotificationsd 显示客户端签名 identity 为 Qterm-哈希、请求 identity 为 com.qiubai.qterm。codesign 确认 linker-signed 且 Info.plist not bound。AC-001 包含开发 runner 对完整 bundle ad-hoc 签名，以及本地 macOS bundle signingIdentity=-；不添加私有 entitlement。

AC-003 补充：优先使用 Tauri 窗口焦点事件，浏览器运行时才回退 document.hasFocus；覆盖 WebView 焦点值滞后原生失焦的场景。
