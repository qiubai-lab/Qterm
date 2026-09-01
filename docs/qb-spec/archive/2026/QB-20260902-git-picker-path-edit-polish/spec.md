---
id: QB-20260902-git-picker-path-edit-polish
type: bugfix
tier: standard
status: archived
created: 2026-09-02
updated: 2026-09-02
supersedes: []
---

# Git picker path edit polish

## Goal

修复远程 Git 目录选择器路径编辑态的异常外框，并让取消动作与目录行信息层级符合 Qterm 的主题语义和文件管理 Block 交互。

## Scope

- 路径编辑态复用文件管理 Block 的透明输入、无外框和底部 focus 线。
- 当前 picker 的取消按钮使用共享 theme danger variant，禁止硬编码主题颜色。
- 移除目录行尾部的箭头及其保留列。
- 将“取消按钮使用主题 danger 语义”的用户批准偏好写入仓库 `qterm-interface-design` skill 及规范 reference。

## Non-goals

- 不批量重写仓库内所有既有取消按钮。
- 不改变路径编辑、目录选择、双击/Enter 打开或元数据展示行为。
- 不新增主题 token 或组件依赖。

## Observed Behavior

- picker 路径进入编辑后，path shell 和 input focus 样式叠加，出现双重、偏移的高亮外框。
- 取消按钮仍为 neutral secondary，未表达用户指定的主题 danger 色。
- 目录行尾箭头重复表达可打开语义，造成无价值噪声。

## Requirements

- REQ-001：路径输入必须与文件管理 Block 使用同一视觉模型：透明背景、无边框/圆角/外层发光，仅保留一像素主题 focus 底线。
- REQ-002：picker 取消按钮必须使用共享 `danger` variant，并由当前主题的 `--danger` / `--danger-bg` 渲染；赛博主题不得硬编码色值。
- REQ-003：目录行尾箭头及对应空白网格列必须移除，名称、权限、修改时间三列保持对齐。
- REQ-004：现有路径键盘编辑、目录选择/打开、错误回退和元数据展示行为必须保持不变。
- REQ-005：仓库 `qterm-interface-design` skill 必须记录：与正向主操作并列的显式取消按钮使用共享 theme danger outline 语义；不可硬编码具体主题色，filled danger 仍仅用于不可逆确认。

## Acceptance

- AC-001 [REQ-001, REQ-004]：样式契约证明 path shell 无 border/background glow，input 与文件 Block 一致使用透明背景和 focus 底线；编辑/Escape 回归通过。
- AC-002 [REQ-002]：组件测试证明取消按钮具有 `ui-button--danger`，共享样式继续引用 `var(--danger)`，赛博主题定义可被解析。
- AC-003 [REQ-003, REQ-004]：目录行不再渲染 trailing arrow，三列 grid 契约和目录打开回归通过。
- AC-004 [REQ-005]：repository skill 与 reference 包含聚焦、非重复的主题取消按钮规则，skill quick validation 通过。
- AC-005 [REQ-001, REQ-002, REQ-003, REQ-004]：picker 聚焦测试与 `pnpm check` 通过。

## Behavior Delta

### MODIFIED

- REQ-001：路径编辑态从双层 focus surface 改为文件管理 Block 的单底线输入。
- REQ-002：picker 取消按钮从 neutral secondary 改为 theme danger outline。
- REQ-003：目录行从三列加箭头列改为纯名称、权限、修改时间三列。
- REQ-005：仓库 UI skill 增加用户批准的主题取消按钮偏好。

## Root Cause

picker feature-local CSS 同时给 editing shell 设置 border/box-shadow，并给 input 设置独立控件尺寸与背景，没有复用文件管理 Block 的 path form/input contract。

## Quality Check

缺陷、目标、不变量、长期偏好边界与验收闭合；没有阻塞实现的歧义。

## Verification Evidence

- AC-001、AC-002、AC-003、AC-005：`pnpm vitest run src/git/GitRepositoryPickerDialog.test.tsx src/git/gitStyles.test.ts`，35 项通过。
- AC-004：skill validator 首次受 Windows 默认 GBK 解码阻塞；使用 `python -X utf8` 重跑后输出 `Skill is valid!`。
- AC-001 至 AC-005：`pnpm check` 通过，包括 ESLint、79 个测试文件共 701 项测试、TypeScript 与 Vite 生产构建。
- 受影响文件 `git diff --check` 通过，仅有仓库换行转换提示。
- Skill diff 已审阅：保留既有 file-browser selection 规则，只增量加入用户批准的 theme danger cancel 规则。

## Completion

- 2026-09-02：实现、验证并按标准流程归档。
- 用户明确批准的长期偏好已写入 repository `qterm-interface-design` skill 和规范 reference。
- 不涉及模块或目录结构变化，无需更新 Directory Map。

## Residual Risk

- 未进行桌面 Tauri 实机截图回归；CSS 契约、组件行为、主题 token、完整前端测试与生产构建均已覆盖。
- Vite 保留仓库既有的大 chunk 提示，不影响本次验收。
