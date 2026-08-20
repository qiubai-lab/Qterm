# 连接配置分栏与删除保护 Task Spec

Status: Complete (2026-08-19)。连接配置已按信息类型分栏，删除保护、名称回退与私钥表格滚动均已实现。

## Goal

让连接配置弹窗聚焦于配置管理：按信息类型组织字段，保护删除操作，并确保大量本地私钥不会撑高弹窗。

## Scope

- 移除弹窗内“连接当前终端”及“断开”操作。
- 将“连接信息”和“认证方式”拆分为两个可切换的 Tab。
- 将“删除”和“保存配置”统一放置在编辑区右下角。
- 删除已保存连接前显示二次确认弹窗。
- 保存时若名称仅为空白，则以去除首尾空格后的主机作为名称。
- 扫描到的本地私钥使用固定高度、内部滚动的语义表格展示。

## Constraints

- 保留选择或保存配置时，将其同步为当前终端 Block 目标连接的现有行为。
- 密码保险库、私钥选择和 SSH Agent 的认证语义不变。
- 名称回退在调用 profile IPC 前完成，后端仍负责最终数据校验。
- Tab 需要暴露标准 `tablist`、`tab` 和 `tabpanel` 语义。

## Non-Goals

- 不改变终端实际连接流程或认证协议。
- 不改变连接列表、密码管理器或后端 profile 数据结构。
- 不新增私钥递归扫描或排序规则。

## Acceptance

1. 弹窗中不再出现“连接当前终端”或“断开”按钮。
2. “连接信息”展示名称、主机、端口和用户名；“认证方式”展示认证选择与对应字段。
3. 删除与保存位于编辑区右下角，删除在保存左侧。
4. 点击删除先出现包含连接名称的确认弹窗；取消不删除，确认后才调用删除。
5. 名称为空或仅空白时，保存请求中的名称等于去除首尾空格后的主机。
6. 私钥扫描结果以表格展示；结果容器高度固定并在内容超出时内部滚动。

## Acceptance To Verification

- 1、2、4、5、6：`ConnectionDialog.test.tsx` 组件测试覆盖可见内容、Tab 切换、确认流程、保存参数及扫描结果表格。
- 3、6：`appStyles.test.ts` 断言底部操作区对齐和私钥表格容器的固定高度/滚动规则。
- 全部：运行 `pnpm check`。

## Open Questions

无。

## Recommended Approach

在 `ConnectionDialog` 内增加局部 Tab 与删除确认状态；保存前构造规范化的 `ProfileInput`；将私钥结果改为带固定滚动容器的原生表格。删除即时连接分支后同步精简无用的运行时与凭据加载依赖。

## Next Skills

- `writing-qb-plans`（Standard）
- `protecting-critical-behavior`
- `verifying-before-completion`
- Project Context: not needed（局部弹窗行为，未形成跨任务领域规则）
- Directory Map: not needed（无目录或模块边界变化）
