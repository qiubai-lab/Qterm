---
id: QB-20260819-connection-summary-and-password-eye
status: archived
archived: 2026-09-02
legacy: true
---
# 连接摘要与密码眼睛图标 Task Spec

Status: Complete (2026-08-19)。

## Goal

连接列表以连续、易读的地址摘要展示目标信息，并使用用户熟悉的眼睛图标控制密码可见性。

## Scope

- 连接 item 第二行连续显示 `username@host:port`，端口不再被推到行末。
- 第二行末尾显示当前认证方式：密码、私钥或 SSH Agent。
- 密码显示/隐藏按钮使用睁眼/闭眼图标，加载期间保持禁用反馈。
- 保留“显示密码/隐藏密码/正在显示密码”可访问名称。

## Constraints

- 长地址可截断，但认证方式保持可见。
- 不改变密码读取、解锁或保存逻辑。
- 图标复用项目统一线条图标组件。

## Non-Goals

- 不修改连接 item 高度、profile 数据结构或认证方式文案体系。

## Acceptance

1. item 地址作为单个连续字符串渲染，例如 `root@127.0.0.1:22`。
2. 地址末尾展示与 `authPreference` 对应的认证方式。
3. 密码按钮无可见文字，隐藏状态显示眼睛，显示状态显示闭眼图标，可访问名称保持正确。
4. 现有密码按需恢复与隐藏行为不回归。

## Acceptance To Verification

- 1、2、3、4：`ConnectionDialog` 组件测试。
- 布局与按钮尺寸：CSS 样式契约测试。
- 全量：`pnpm check`。

## Open Questions

无。

## Recommended Approach

方案 A 是继续保留多段地址并调整 flex，仍容易在窄宽度下把端口拆开。方案 B 是把地址合并成一个截断单元、认证方式固定在末尾；采用方案 B。眼睛图标扩展现有 `Icon` 联合类型，保持全局线条风格。

## Next Skills

- `writing-qb-plans`（Standard）
- `verifying-before-completion`
- Project Context: not needed
- Directory Map: not needed

## Verification Evidence

- 聚焦测试：2 个文件、29 项测试全部通过。
- `pnpm check`：通过；23 个测试文件、99 项测试成功，ESLint、TypeScript 与 Vite 生产构建成功。
- Project Context 与 Directory Map：未更新；本次仅调整现有组件的展示结构与图标资产。
