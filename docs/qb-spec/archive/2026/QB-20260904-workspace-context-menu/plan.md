---
id: QB-20260904-workspace-context-menu
type: feature
tier: standard
status: archived
created: 2026-09-04
updated: 2026-09-04
supersedes: []
---
# 实施计划
## Scope / Design
workspaceClose.ts 负责范围选择、单关闭描述及批量纯状态变换；WorkspaceTabStrip.tsx 组合标签栏、菜单与确认流程；独立菜单/对话框负责展示。复用 runtime.closeSessions 清理所有 block 类型，不复制会话所有权。
## Tasks
- [x] 规则、reducer 原子关闭与边界测试。
- [x] 标签右键/键盘菜单、单次确认、失败恢复和忙碌保护。
- [x] 接入 Shell、更新目录图、聚焦回归后 pnpm check。
## Acceptance To Verification
AC-001/003：纯规则/reducer测试（左右顺序、保留一个、目标过期、活动页）。AC-002/004：组件测试确认次数、取消、零会话、异步重复点击/失败、键盘、禁用及菜单事件。既有 Shell/App 回归保护单关闭及工作区切换。
## Documentation
更新 Directory Map 的工作区菜单入口。维持 Qterm 紧凑菜单、危险确认样式、焦点回收和 reduced-motion。真实桌面未验证时明确记录。

## Verification Evidence
2026-09-04：pnpm check 通过（113 个测试文件、880 项测试，脚本测试、ESLint、TypeScript、Vite build）。随后新增菜单异步模态清理、外部关闭、锚点消失与 App 集成覆盖：workspaceClose + WorkspaceTabStrip 10 项、workspaceContextMenu 1 项通过，相关 ESLint 与 pnpm build 再次通过。git diff --check、source-size 通过，无 ratchet 提醒；WorkspaceShell 基线从 811 降为 807。
AC-001：左右范围按排列测试、禁用、右键不切换、Shift+F10、箭头导航和 Escape 覆盖。AC-002：零连接确认、一次确认多个目标、取消无副作用、单飞、失败重试覆盖。AC-003：批量 reducer 保留锚点/活动页、新建不扩大集合、锚点过期覆盖。AC-004：点击外部/滚动/锁定/异步弹出模态清理、真实 Shell 确认期间快捷键拦截覆盖。现有锁定界面仍允许工作区快捷键，其回归通过。
已有单个关闭按钮保持原行为，工作区切换动画未修改。源码层面检查主题 token、菜单定位和焦点路径；未进行真实桌面视觉验收。会话关闭失败时可能已有部分连接断开，布局保留并可重试，不能回滚已断开的连接。
