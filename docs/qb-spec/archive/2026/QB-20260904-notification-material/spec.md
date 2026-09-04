---
id: QB-20260904-notification-material
type: design
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 通知浮层与标题动效重设计
用户指定 Apple Design 技能并授权重新设计，结合既有 Qterm 紧凑视觉规范。
- REQ-001 / AC-001：移除通知工作区黄色背景，仅标题轻柔持续呼吸与静态未读圆点，选中态保持独立。
- REQ-002 / AC-002：紧凑材质浮层呈现图标、通知类型、来源、正文、查看动作；短距离淡入缩放，无弹跳，不阻塞输入。
- REQ-003 / AC-003：保留 4 秒关闭、悬停/焦点暂停、合并、点击定位、正文隐私开关和关闭不已读。支持减少动效、减少透明度与增强对比度。
## Behavior Delta
### MODIFIED
REQ-001：替换黄色未读背景及旧文字动效。
REQ-002：重新组织气泡层次和材质，不改变投递规则。
### ADDED
REQ-003：增加减少透明度及增强对比度视觉回退。
## Quality
标准验收闭合。只改通知域展示，不扩展协议、设置或 native 层。
