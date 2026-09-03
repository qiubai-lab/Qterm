---
id: QB-20260903-connection-manager-selection-motion
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: [QB-20260824-connection-manager-theme-hover]
---

# 连接管理主题分组与选择动效

## Goal

让连接管理侧栏的分组颜色明确跟随当前主题，并让连接选择、连接编辑切换和新建连接拥有连续、柔和且可感知的空间反馈。

## Scope

- 调整连接分组标题、计数与拖放状态的主题语义色。
- 为主选中连接增加在可见连接行之间移动的单一选中承载面。
- 为切换已有连接和进入新建连接状态提供不同的编辑区入场反馈。
- 覆盖 reduced-motion、亮色与赛博主题，并保护现有多选、拖放、右键和表单状态行为。

## Non-Goals

- 不修改主题全局 palette、连接字段、持久化、SSH、凭证或 IPC 契约。
- 不改变分组展开/折叠、拖放排序、多选和保存语义。
- 不引入动画依赖或跨功能通用组件。

## Requirements

- REQ-001：连接分组使用当前主题的 accent 语义色；赛博主题下必须消费赛博青色 accent，而非硬编码黄色或暗色字面量。
- REQ-002：普通单选切换连接时，单一选中承载面应从当前主连接平滑移动到目标连接；初次加载不应从错误位置滑入，多选附加项仍可辨识。
- REQ-003：切换已有连接时，右侧编辑内容应提供短距离横向淡入反馈，字段内容与所选连接立即一致。
- REQ-004：从已有连接进入“新建连接”时，右侧编辑内容应使用区别于普通切换的轻微上移/缩放淡入反馈。
- REQ-005：动效只使用 transform 与 opacity，快速操作不锁定交互；reduced-motion 下移除空间位移并退化为短淡入或静态切换。
- REQ-006：现有连接草稿、保存、分组、多选、拖放、右键菜单、键盘语义和底部操作栏布局保持不变。

## Behavior Delta

### ADDED

- REQ-001：分组获得由主题 accent 驱动的视觉层级。
- REQ-002：主连接选中态在列表行之间连续移动。
- REQ-003：已有连接编辑页切换获得明确的内容入场反馈。
- REQ-004：新建连接获得独立的编辑页入场反馈。
- REQ-005：新增动效具备 reduced-motion 降级。

### MODIFIED

- REQ-006：连接切换由输入值瞬时替换改为状态立即更新并伴随非阻塞视觉反馈，其他行为保持兼容。

## Acceptance

- AC-001（REQ-001）：主题样式契约证明分组使用 `--accent`/`--accent-bg`，且 Cyberpunk 的 `--accent` 为青色。
- AC-002（REQ-002、REQ-006）：组件测试证明列表只有一个移动主选中承载面，切换后目标主连接状态正确，多选与现有语义不被替换。
- AC-003（REQ-003、REQ-006）：切换两个已有连接后，编辑区重放 switch 动效且字段显示目标连接。
- AC-004（REQ-004、REQ-006）：从已有连接点击新建后，编辑区重放 create 动效并显示空白新建表单。
- AC-005（REQ-005）：样式测试证明两类编辑动效和列表移动只使用允许属性，并在 reduced-motion 下取消空间位移。
- AC-006（REQ-006）：连接管理聚焦回归、主题契约、源码尺寸及完整前端检查通过。

## Assumptions

- “对应主题色彩”指复用各主题现有 accent 语义；不新增用户可配置的分组颜色。
- 滑动承载面表达当前主编辑连接；Command/Ctrl 附加选择仍以静态次级选中表面表达。

## Quality Check

目标、非目标、主题边界、主选中与多选语义、快速切换和 reduced-motion 均有闭合验收，无需独立严格审查。

## Open Issues

无。

## Verification

- AC-001：`connectionManagerMotion.test.ts` 与 `themeStyles.test.ts` 证明分组消费主题 accent，Cyberpunk accent 为 `#00ddeb`。
- AC-002～AC-004：`ConnectionDialog.test.tsx` 证明单一主选中承载面随目标更新，已有连接使用 switch 动效，新建连接使用 create 动效，字段与目标状态一致。
- AC-005：motion CSS 契约证明只过渡 transform/opacity，并提供 reduced-motion 纯淡入降级。
- AC-006：聚焦 104 项测试通过；`pnpm check` 通过（98 个 Vitest 文件、829 项测试及 13 项 Node 测试，ESLint、TypeScript、Vite build、source-size 全部成功）；`git diff --check` 通过。

## Residual Risk

- 未录制原生 Tauri WebView 动画视频；DOM 行定位、主题 token、方向状态与 CSS 动效契约由自动化覆盖。
- Vite 保留项目既有的大 chunk 非阻塞警告，与本次连接管理动效无关。
