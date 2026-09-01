---
id: QB-20260901-git-change-preview-overview-ruler
tier: standard
status: archived
created: 2026-09-01
updated: 2026-09-01
---

# Git 更改预览差异概览尺计划

## Implementation Tasks

- [x] 添加概览标记、ARIA、导航行为、短文件隐藏和主题滚动条契约的失败测试。
- [x] 实现 chunk 几何映射、视口滑块和点击/拖动/键盘导航。
- [x] 增加主题化原生滚动条与概览尺样式、辅助功能媒体查询。
- [x] 用真实浏览器验证长文件定位、拖动、主题与现有双栏滚动不变量。
- [x] 运行聚焦测试和项目级检查。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| AC-001 | 模型测试与真实浏览器 marker 几何 |
| AC-002 | 键盘模型测试与真实浏览器点击、拖动、Home/End |
| AC-003 | 样式契约与 dark/light/cyberpunk computed style |
| AC-004 | 短文件浏览器检查与辅助功能媒体查询样式契约 |
| AC-005 | 相关 Vitest、浏览器滚动不变量、`pnpm check`、`git diff --check` |

