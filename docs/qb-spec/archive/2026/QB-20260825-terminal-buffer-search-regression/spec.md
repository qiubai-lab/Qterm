---
id: QB-20260825-terminal-buffer-search-regression
status: archived
archived: 2026-09-02
legacy: true
---
## Goal

终端搜索能够在当前 xterm 缓冲区中找到肉眼可见的普通文本，并正确显示匹配计数和当前结果。

## Scope

- 修复 SearchAddon 与 xterm 运行时组合导致的缓冲区搜索失效。
- 增加使用真实 xterm 缓冲区和真实 SearchAddon 的回归测试。
- 保留现有搜索入口、方向导航、焦点恢复、配色和交互。

## Constraints

- 搜索继续使用 xterm 公共 addon/API，不读取私有 DOM 或内部缓冲结构。
- 不覆盖工作区中既有的终端 P0 交互改动。
- SearchAddon 高亮与结果计数所需的 proposed marker/decoration API 只在 Qterm 创建的终端实例上显式开启。

## Non-Goals

- 不新增正则、全词或大小写选项。
- 不重做搜索浮层视觉设计。
- 不改变终端缓冲区的持久化或生命周期规则。

## Acceptance

- 写入真实 xterm 缓冲区的 `This system has been minimized` 可被 `system` 搜索命中。
- 默认搜索保持大小写不敏感，并能返回正确的结果数量。
- TerminalPanel 现有的增量搜索、上一个/下一个、关闭清理和焦点恢复行为不回归。
- `pnpm check` 通过。

## Acceptance To Verification

- 真实缓冲区命中与计数：运行 `src/terminal/terminalSearch.test.ts`。
- 搜索交互不回归：运行 `src/terminal/TerminalPanel.test.tsx`。
- 前端完整性：运行 `pnpm check`。

## Open Questions

- 无。

## Recommended Approach

保留与 xterm 6.0.0 同源的 SearchAddon 0.16.0，在 Terminal 构造时显式允许官方 addon 用于高亮和结果计数的 proposed API，并用真实缓冲区集成测试锁定组合。备选方案是自行遍历公开 buffer API，但会重复官方搜索逻辑、增加宽字符与换行处理风险，因此不采用。

## Next Skills

- `writing-qb-plans`
- `protecting-critical-behavior`
- `verifying-before-completion`
- Directory Map: not needed；没有目录、模块边界或入口变化。

## Verification Evidence

- 修复前：真实 Terminal + SearchAddon 0.16.0 在带 decorations 搜索时抛出 `You must set the allowProposedApi option to true to use proposed API`。
- 聚焦回归：`pnpm exec vitest run src/terminal/terminalSearch.test.ts src/terminal/TerminalPanel.test.tsx --reporter=verbose`，2 个文件、27 项测试通过。
- 完整质量门禁：`pnpm check` 通过；ESLint、59 个测试文件/472 项测试、TypeScript 与 Vite production build 全部通过。
- `git diff --check` 通过（仅输出工作区既有 LF/CRLF 提示）。
- 浏览器辅助点测在本地页面刷新后被浏览器 URL 安全策略阻止；未绕过该策略，真实依赖与完整自动化验证已覆盖核心验收。
