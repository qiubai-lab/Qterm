---
id: QB-20260821-terminal-target-picker
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

让用户通过紧凑的连接选择器优先访问最近使用的连接，并通过分组二级菜单定位其余连接；最近记录在程序重启后仍然保留。

## Scope

- 选择器一级浮层显示最多 6 条全局最近连接，按最后选择时间倒序、自动去重。
- 最近记录由终端、文件和网络窗口共享，并写入 `workspaces.json`。
- 一级浮层底部显示非空连接分组及“未分组”；hover、点击或键盘均可打开二级菜单。
- 二级菜单根据视口空间左右翻转、限制高度并独立滚动。
- 搜索时隐藏最近/分组层级，直接显示扁平匹配结果。
- 保留本地入口和“管理连接…”固定入口。

## Constraints

- 兼容现有 schema v5 的 `workspaces.json`，读取时安全迁移到 v6，不覆盖无法识别的数据。
- 最近记录不包含本地终端或本机文件，仅保存 profile ID，不保存认证信息、凭证或连接输出。
- hover 不是唯一入口；必须支持点击、焦点、方向键和 Escape 逐层关闭。
- 沿用现有 portal、视口定位、减少动画与减少透明度支持，不新增依赖。

## Non-Goals

- 不新增收藏、手动置顶、最近记录清除按钮或单独的历史管理页面。
- 不改变连接、分组、凭证或认证的持久化模型。
- 不记录连接成功率、连接时间或命令历史。

## Acceptance

- 每次显式选择远程 profile 后，该连接成为最近第一项；重复选择只移动位置，最多保存 6 个唯一 ID。
- 最近记录跨程序重启保留；v5 工作区文件加载后得到空最近列表并按 v6 保存。
- 默认一级浮层只直接列出本地入口、最近 6 条、分组入口及管理入口，不展开全部连接。
- hover、点击、焦点或右方向键可打开分组二级菜单；左方向键或 Escape 返回一级浮层。
- 二级菜单不超出视口，空间不足时向左展开，长列表独立滚动。
- 搜索仍可按名称、主机、用户名匹配，并显示扁平结果与无结果状态。

## Acceptance To Verification

- reducer 测试覆盖去重、排序、上限和忽略本地目标。
- Rust 领域、IPC DTO 和 JSON 仓储测试覆盖 v6 校验、往返及 v5 迁移。
- TerminalTargetPicker 测试覆盖最近列表、分组 hover/点击/键盘、搜索和选择。
- 样式测试覆盖二级菜单 fixed 定位、翻转和独立滚动。
- `pnpm check` 与 Rust fmt/clippy/test 覆盖完整质量门禁。

## Open Questions

无。用户确认最近连接需跨程序重启持久化。

## Recommended Approach

采用工作区文档 v6 保存 `recentProfileIds`。相比 localStorage，这能复用现有原子写入、校验和错误处理，并让前后端模型保持一致；相比新增独立历史仓储，本次只有 6 个 UI 偏好 ID，无需扩大持久化边界。一级菜单保持最近连接和分组入口，二级菜单仍使用 portal，以避免 Block 裁剪和视口溢出。

## Next Skills

- `writing-qb-plans`（Strict）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `qterm-interface-design`
- `verifying-before-completion`

Directory Map: not needed；现有模块职责和入口位置不变。
