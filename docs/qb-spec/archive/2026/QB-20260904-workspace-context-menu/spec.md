---
id: QB-20260904-workspace-context-menu
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 工作区右键批量关闭
用户授权实施。保持工作区切换动效及现有单个关闭按钮行为。
- REQ-001 / AC-001：右键标签或键盘菜单键打开菜单，基于右键目标和当前标签顺序提供关闭其他、关闭左侧、关闭右侧。没有目标则禁用；打开菜单不切换工作区。
- REQ-002 / AC-002：所有菜单关闭操作都需一次确认，无论活动会话是否为零；一个批次只弹一个对话框，列出目标名称、数量与会话数量；取消不执行关闭。
- REQ-003 / AC-003：确认冻结目标 ID，执行前重新检查仍存在的目标；统一 closeSessions 成功后原子移除，保留基准工作区。保留当前页若未被关闭，否则选中基准页。异步执行单飞、失败显示错误并保留布局供重试。
- REQ-004 / AC-004：菜单可键盘导航/Escape关闭，屏幕边缘防溢出，点击外部/滚动/窗口失焦关闭。锁定或已有模态时不打开；批量确认期间阻止工作区快捷键穿透。新建或重排不扩大已确认集合。
## Behavior Delta
### ADDED
REQ-001 至 REQ-004：工作区右键菜单及一次性批量关闭流程。
## Constraints / Quality
复用现有会话清理和 DialogFrame，不改 IPC/schema。新增规则与展示归 workspace，WorkspaceShell 保持组合入口且不超过 source-size 基线。standard 验收闭合，无阻塞问题。
