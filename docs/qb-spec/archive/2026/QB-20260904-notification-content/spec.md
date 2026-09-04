---
id: QB-20260904-notification-content
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
---
# 通知来源与可选正文

用户采纳显示来源与正文开关方案。AC-001：默认系统通知标题显示终端名称与工作区；AC-002：高级设置新增正文开关，默认关闭、持久化、主开关关闭时不可操作且保留偏好；AC-003：开启时传递 OSC9 正文或 OSC777 标题/正文，BEL/空内容回退通用提醒；AC-004：后端按已保存偏好裁剪正文，过滤控制与双向字符，标题128字符/正文1024字符；旧通知文件兼容；AC-005：保存失败保留选择与反馈。

正文偏好独立保存到 device/notification-content.json（schema1，enabled表示正文展示），不改旧 notifications.json。系统横幅及锁屏可能显示用户开启的内容；来源始终显示。不从普通终端输出抓取完整回答。
