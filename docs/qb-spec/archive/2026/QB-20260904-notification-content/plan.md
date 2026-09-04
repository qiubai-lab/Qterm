---
id: QB-20260904-notification-content
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
---
# 计划

1. AC-001/003：前端根据实时工作区来源构造通知，原生适配器接收已裁剪内容。
2. AC-002/004/005：独立偏好与设置行，后端发送用例再次裁剪正文，串行保存与发送。
3. 验证：前端来源/正文默认与切换测试；Rust默认隐私、开关与文本边界测试；pnpm check、Rust fmt/clippy、macOS打包；更新说明与目录索引。

## 验证与交付

AC-001/002/003：前端测试覆盖默认来源与隐藏正文、开启正文后的 OSC777 标题/正文、总开关切换保留正文偏好。pnpm check 通过：106 测试文件、858 用例，以及脚本测试、lint、TypeScript、Vite、source-size。

AC-002/004：Rust 通知相关 6 用例通过，覆盖独立文件默认关闭与保存、后端正文隐藏/开启/再次关闭、控制字符与长度限制；fmt 与 all-targets/all-features Clippy 通过。

AC-005：沿用 busy 单飞与失败反馈，已有主设置读写失败测试通过。正文设置保存仅在 IPC 成功后提交本地值。

文档：更新 terminal-notifications.md 与 Directory Map；既有设置行样式复用，无目录边界扩张。macOS 原生 API 的横幅交付证据沿用前一变更；本轮内容由前端参数断言与 Rust 原生端口捕获验证，不宣称已逐平台人工查看正文。CLI 未发正文时仍只能使用通用提醒。

macOS `pnpm tauri build --bundles app` 通过，已生成签名应用包。变更完成并归档。
