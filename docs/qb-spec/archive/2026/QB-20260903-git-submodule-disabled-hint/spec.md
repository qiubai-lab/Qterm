---
id: QB-20260903-git-submodule-disabled-hint
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

# Submodule 不可选择原因提示

## Goal

当 Git 仓库树中的 Submodule 暂时或持续不可选择时，直接向用户说明原因及下一步处理方式，避免节点看似可用但点击无反馈。

## Approval

用户于 2026-09-03 明确要求：禁用节点在鼠标移入时显示红色气泡，说明情况并帮助用户解决问题。

## Scope

- 为未初始化、引用冲突、配置异常、状态不可读取的 Submodule 提供具体修复建议。
- 为 Git 操作进行中和远程连接未就绪提供暂时禁用说明。
- 鼠标悬停与键盘聚焦均显示同一说明；气泡使用 portal、视口感知定位与主题危险色。
- 补全节点和选择按钮的禁用、描述关联语义。

## Non-Goals

- 不改变 Submodule 是否可选择的领域判定。
- 不自动初始化、修改 `.gitmodules`、解决 Gitlink 冲突或重连 SSH。
- 不改变分支、同步、变更数量和仓库操作按钮的行为。

## Requirements

- REQ-001：每个不可选择原因必须映射为明确、可执行的用户说明，包括未初始化、引用冲突、五类配置/读取问题、操作进行中和远程未连接。
- REQ-002：不可选择节点在鼠标悬停选择区域或键盘聚焦时必须显示说明气泡，离开或失焦后关闭。
- REQ-003：气泡必须挂载到 `document.body`，根据视口空间在节点上方或下方显示并保持水平安全边距，不能被仓库列表裁剪。
- REQ-004：气泡必须使用 `--danger`、`--danger-bg` 等主题语义色，包含图标与文本，支持 reduced motion，并通过 `role="tooltip"`、`aria-disabled`、`aria-describedby` 提供辅助技术语义。
- REQ-005：可选择节点以及既有 pointer/keyboard 选择、展开和行级操作行为必须保持兼容。

## Behavior Delta

### ADDED

- REQ-001、REQ-002、REQ-003、REQ-004：不可选择的 Submodule 获得带解决建议的主题红色 hover/focus 气泡。

### MODIFIED

- REQ-004：全局 busy 或远程未连接时，仓库节点的禁用语义从静默忽略选择提升为显式 `aria-disabled` 和原因描述。

## Acceptance Criteria

- AC-001 [REQ-001]：纯模型测试覆盖所有 Submodule 固有原因和两个暂时原因，且可选节点不返回说明。
- AC-002 [REQ-002, REQ-004]：组件测试证明不可选择节点 hover 与 focus 显示 `role="tooltip"`，离开与失焦关闭，并具有正确 ARIA 关联。
- AC-003 [REQ-003, REQ-004]：组件与样式测试证明气泡 portaled 到 body，定位包含上下 placement 与水平钳制，颜色只使用语义 token，并提供 reduced-motion 降级。
- AC-004 [REQ-005]：既有仓库树和 Submodule 测试保持通过，可选择节点仍能由鼠标与键盘切换。

## Architecture Boundary Decision

- `gitRepositoryContext.ts` 继续拥有选择可用性与用户原因的纯派生。
- 新的 feature-local hint 组件只拥有浮层测量、portal 和展示生命周期。
- `GitRepositoryTree.tsx` 只连接节点事件、ARIA 与气泡，不调用 Tauri，也不新增权威状态。
- Rust、IPC、Git snapshot DTO 和 Workspace persistence 均不变。

## Quality Check

- 所有原因、触发方式、关闭方式、定位、主题、无障碍和兼容行为均有可观察验收。
- 改动跨纯模型、presentation、CSS 与测试，使用 standard tier；不涉及安全、schema 或公共 API。
- 无阻塞歧义。

## Open Issues

- 无。

## Verification Evidence

- AC-001：`gitRepositoryContext.test.ts` 覆盖未初始化、引用冲突、五类配置/读取异常、操作进行中、远程未连接及正常可选状态。
- AC-002：`GitRepositoryTree.test.tsx` 证明 hover/focus 均显示红色提示，pointer leave/blur 后关闭，禁用点击不触发选择。
- AC-003：气泡通过 portal 挂载到 `document.body`；样式测试覆盖 fixed 定位、视口宽度约束、上下 placement、危险色 token 与 reduced-motion。
- AC-004：仓库树及 Submodule 集成回归通过；完整 `pnpm check` 通过 93 个 Vitest 文件/811 项测试、13 项 Node 测试、lint、typecheck 和生产 build。
- 结构：原因派生、展示组件和树接线保持分层；源码尺寸检查零提醒，未改变后端、IPC、持久化或模块入口。
- 备注：Vite 仍报告既有主 chunk 超过 500 kB 的非阻塞 warning；本改动未新增依赖或独立大体积 chunk。
