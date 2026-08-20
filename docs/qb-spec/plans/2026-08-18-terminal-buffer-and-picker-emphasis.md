# 终端缓冲保留与连接选择器强调实施计划

Status: Complete (2026-08-19)

## Requirement

Plan Level: Standard。改动覆盖 xterm 生命周期所有权、回归测试和标题栏交互样式，但不改变后端或持久化模型。

## Scope

复用布局重排前后的终端 view 并重新设计连接选择器；不持久化 buffer、不修改 split 数据结构、不调整 PTY/SSH 协议。

## Affected Files

- `src/terminal/TerminalPanel.tsx`
- `src/components/Icon.tsx`
- `src/terminal/TerminalPanel.test.tsx`
- `src/workspace/LayoutView.tsx`
- `src/workspace/TerminalTargetPicker.tsx`
- `src/workspace/TerminalTargetPicker.test.tsx`
- `src/app/app.css`
- 本 task spec 与 plan

## Design

- TerminalPanel 模块拥有按 `blockId + target` 标识的 view registry；view 包含 xterm、FitAddon、输入订阅和挂载 DOM。
- React effect 每次挂载更新 view 的 write callback、把既有 xterm element 移入新容器并建立新的 ResizeObserver。
- cleanup 先注销当前容器 writer/observer，再延迟销毁；若同 session key 在延迟结束前重新挂载则取消销毁。
- 选择器触发器使用单个胶囊按钮，名称区域弹性居中，下拉图标区固定宽度并用边界/底色强化 affordance。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 缓冲不因分割丢失 | mock xterm 生命周期测试与桌面多屏输出分割检查。 |
| 正确销毁 | fake timer 测试断言重排不 dispose，最终卸载后 dispose。 |
| 选择器清晰居中 | Testing Library 可访问性断言、浏览器 rect/style 测量和截图。 |
| 交互完整 | click/Escape/外部关闭测试，CSS reduced-motion 检查。 |
| 完整性 | `pnpm check` 与 `git diff --check`。 |

## Test / Verification

1. 先增加 TerminalPanel 重排失败测试，确认旧实现创建两个 xterm 并销毁第一个。
2. 实现 view registry 和延迟销毁，再验证同 session key 重挂载复用。
3. 调整选择器 DOM/CSS 并扩展交互测试。
4. 运行聚焦测试、完整前端检查和真实页面/桌面视觉验证。

## Documentation Updates

完成后更新 task spec 状态；无需 Project Context 或 Directory Map 更新。
