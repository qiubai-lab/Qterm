---
id: QB-20260903-connection-group-motion
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

## Goal and scope

让连接管理的未分组和命名分组展开、收起柔和且迅速。用户已直接要求实施动效。范围为前端分组内容的展示生命周期、选择背景对齐和回归验证。

## Requirements

- REQ-001: 分组内容展开约 180ms、收起约 140ms，从当前高度过渡并略微淡入淡出；连续反向操作遵循最新意图。
- REQ-002: 收起立即禁用内容交互，结束后卸载内容。不得复发复制连接后残留滚动条或列表宽度跳变。
- REQ-003: 动画期间保持选中项可辨识及其他分组位置同步，结束恢复现有移动选择背景，保留编辑内容和业务选择。
- REQ-004: 减少动态效果、键盘触发和不支持 Web Animations 的环境立即切换；组件卸载取消未完成动画。

## Acceptance

- AC-001 (REQ-001): 两类分组均有短时高度过渡；中途反向时不从端点重播，旧完成回调不能关闭重新打开的分组。
- AC-002 (REQ-002): 复制末尾连接后首次收起，内容移除且 scrollHeight 恢复实际内容高度；宽度稳定，收起中内容 inert。
- AC-003 (REQ-003): 选中下方分组时展开上方分组，选择背景最终与目标行重合；当前连接编辑字段保持。
- AC-004 (REQ-004): 减少动态效果/键盘/无 animate 时不启动空间动画；卸载和反向取消均无过期状态写入。

## Constraints and decision

沿用 qterm-interface-design 和 ENGINEERING_STYLE_SPEC 的主题与模块边界。父 dialog 保持权威展开和选择状态；独立 presentation 组件只拥有动画存在期。无 IPC、持久化、数据模型或依赖变更。

采用可取消的 Web Animations 高度过渡。仅 transform 无法平滑移动后续分组，单纯 CSS 淡出则仍会造成布局跳变；因此只对分组容器短时动画 height，文字保持原尺寸。避免把所有收起内容长期挂载。

## Behavior Delta

### MODIFIED
- REQ-001: 从即时插入/移除分组内容改为短时、可中断过渡。
- REQ-002: 收起中保留仅用于退出动画的 inert 内容，结束卸载；滚动范围不被透明装饰撑大。
- REQ-003: 分组动画期间使用行内选择背景，避免悬浮装饰越过裁剪边界。

### ADDED
- REQ-004: 动效降级、取消和卸载清理行为。

## Quality and risks

轻量质量检查通过：所有需求有直接验收；范围和权限明确。主要风险为反向操作的过期回调、退出内容交互与绝对定位背景撑大滚动范围。无阻塞项，无长期偏好更新。

## Verification

- AC-001: 实际组件逐帧高度从 480px 平滑收至 0，再从 0 展开至 480px；55ms 后反向从约 47px 接续至 480px。相邻取消与退出生命周期测试通过。
- AC-002: 复制后收起，scrollHeight/clientHeight 均为 280px，组标题宽度始终 194px；退出尾帧保持裁剪，未出现滚动范围回弹。命名/未分组复制回归均通过。
- AC-003: 选中下方连接，展开上方分组后 row/indicator top 均为 604px；键盘收起后同步为 156px、滚动高度即时为 280px。布局变化直接跟随，新选择保留滑移动画。
- AC-004: 减少动态效果、无 API、键盘与卸载取消测试通过；浏览器键盘切换无活跃动画。
- pnpm check 通过：840 项 Vitest、13 项脚本测试、源码尺寸、ESLint、TypeScript 与 Vite build。随后补充同一行布局变化回归；相关 41 项测试、针对性 ESLint、类型与尺寸检查通过。
- DIRECTORY_MAP 已补充分组 presentation 生命周期 owner；父 dialog 维持既有尺寸预算。
- 浏览器使用 Windows Chromium 的实际组件验证页；未进行原生 macOS/Linux 手工验证。构建仅有已有的大 chunk 提示，无失败。
