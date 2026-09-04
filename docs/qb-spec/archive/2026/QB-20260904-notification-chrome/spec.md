---
id: QB-20260904-notification-chrome
type: design
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 通知标签与工作区色彩
用户明确要求实施本次局部视觉调整。
- REQ-001 / AC-001：非选中未读工作区整块背景和名称使用主题色呼吸；赛博使用 selection-marker 亮黄背景与 danger 红名称，其他主题使用相应 token；保留 3 秒 × 3 次及 reduced-motion，选中边框不变。
- REQ-002 / AC-002：终端通知和 OSC7 合并为单个 `osc` 标签；任一能力启用且已连接时显示，全部关闭或断开时隐藏；保留未读点击与目录等待/异常状态。
- REQ-003 / AC-003：悬停及键盘聚焦显示紧凑浮层，仅列已启用能力及短说明，BEL 明确是响铃信号而非 OSC；支持 Escape 关闭，避免终端容器裁切。
## Behavior Delta
### MODIFIED
REQ-001：底部红色弱光改为整块主题色背景及名称呼吸。
REQ-002、REQ-003：两个独立标签改为统一协议标签及紧凑说明。
## Constraints / Quality
不改协议解析、设置或通知投递。通知域组件拥有展示，LayoutView 只传目录状态。标准需求闭合，无阻塞。
