---
id: QB-20260903-connection-group-motion
type: feature
tier: standard
status: archived
created: 2026-09-03
updated: 2026-09-03
supersedes: []
---

## Requirement and scope

对应同 ID spec 的 REQ-001 至 REQ-004。只调整连接管理分组展示。

## Affected files and design

- connection/ConnectionGroupContent.tsx 及相邻测试：唯一的分组动画存在期 owner，输入 expanded/children，输出裁剪与 inert 内容；结束卸载，反向测量当前高度再取消旧动画。
- ConnectionDialog.tsx：只接入两个分组内容出口，不增加业务状态；遵守已有 685 行尺寸 ratchet。
- connection/useConnectionManagerMotion.tsx：排除 inert 目标并观察分组高度变化，保持选择背景测量正确。
- connectionDialog.css：局部裁剪、选择背景回退和主题样式。
- DIRECTORY_MAP.md：补充局部 presentation owner。

边界检查：业务选择、复制和持久化继续归父 dialog/现有 adapter；动画组件不读取 profile 或调用 Tauri。新组件目标小于 120 行，不增加通用抽象。

## Implementation tasks

- [x] 实现局部分组过渡与取消清理；接入命名/未分组。
- [x] 同步选择背景测量、裁剪及退出时交互屏蔽。
- [x] 新增相邻取消/反向/降级测试，保留复制收起回归。
- [x] 浏览器验证实际组件及滚动几何，执行 pnpm check。
- [x] 更新目录图、记录验证并归档。

## Acceptance to verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | ConnectionGroupContent tests + browser midpoint/reversal measurements |
| AC-002 | ConnectionDialogCopy tests + browser scrollHeight/width after copy/collapse |
| AC-003 | ConnectionDialog tests + browser selection alignment across moving groups |
| AC-004 | Component tests for reduced motion, keyboard, missing API, cancellation/unmount |

## Documentation updates

只记录本次模块 owner 和验收证据，不写入长期风格偏好。验证通过后普通归档。
