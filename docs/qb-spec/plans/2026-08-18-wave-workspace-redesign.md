# Wave 风格 Workspace/Tab/Terminal Block 完整重构计划

## Status

Completed on 2026-08-18; navigation model later superseded by `2026-08-18-flat-workspace-tabs.md`. 多会话 runtime、全屏 shell、工具弹窗和 Block 布局能力继续保留，Workspace Switcher 与内部 Tab 已移除。

## Background

现有 MVP 已具备 profile、SSH、host-key、PTY 与 SFTP，但前端只有单份 session/terminal state，并以固定左右面板挤压终端区域。已确认长期界面层级为独立 Workspace Switcher、Workspace 内 Tab Bar、Tab 内多个 Terminal Block。本轮交付基础模型和 Block 拖动重排两个连续切片。

## Requirement

- 终端画布占满工作区主区域，管理能力收束到右侧窄工具轨与弹窗。
- 建立 `Workspace → Tab → Terminal Block`，支持多 SSH 会话并行且互不串流。
- 支持 Workspace/Tab CRUD、Tab 排序、Block 横纵分割、resize、最大化、关闭和拖动重排。
- 切换 Workspace/Tab 时活动会话与 xterm 输出继续保留。
- 版本化持久化 Workspace/Tab/layout/profile 引用，禁止秘密、session id 和终端内容落盘。
- 提供高对比暗色、键盘/焦点、降低动态效果和空间一致的弹窗动效。

## Non-Goals

- 不实现 Web/AI/file-preview widget、通用插件系统或多窗口 workspace 协调。
- 不实现 Wave durable sessions、终端历史持久化或重启自动重连。
- 不改变密码/私钥/host-key 安全策略，不新增 SSH Agent 或 OpenSSH config。
- 不复制 Wave 完整 n-tree；只实现适合终端的二叉 split tree。

## Architecture Impact

- `src/app/App.tsx` 降为组合根，不再拥有所有业务状态。
- `src/workspace/model.ts` 定义 Workspace/Tab/Block/persisted model；`layout.ts` 负责纯树变换；`reducer.ts` 负责工作区动作。
- `src/workspace/WorkspaceProvider.tsx` 编排持久化与 UI state，但不接收终端高频字节。
- `src/terminal/TerminalBlock.tsx` 每个 block 创建独立 xterm 与 session callbacks；隐藏 workspace/tab 保持 mounted，仅改变可见性。
- `src/components/dialogs/` 负责 profile/connection、SFTP、settings、help 和 destructive-confirm UI。
- Rust 新增 workspace domain/application/repository/commands，沿 `commands -> application -> domain/ports <- persistence` 方向实现版本化 JSON。
- Block 拖放以纯 layout action 表达；Pointer/Drag adapter 只计算 drop target，不直接修改树。

## Domain Model Impact

- `WorkspaceDocument { schemaVersion, activeWorkspaceId, workspaces }`
- `Workspace { id, name, activeTabId, tabs }`
- `WorkspaceTab { id, name, activeBlockId, layout }`
- `LayoutNode = TerminalLeaf | SplitNode(direction, ratio, first, second)`
- Persisted terminal leaf 只包含 `blockId` 和可选 `profileId`。
- Runtime-only `TerminalRuntime` 包含 sessionId、status、host-key prompt、transfer 与 xterm writer，不可序列化。
- 树规则：ratio 限制 0.15–0.85；关闭 leaf 后压缩单子树；移动 block 不复制/丢失 leaf id；每个文档至少保留一个 workspace/tab/block。

## API Impact

新增 Tauri commands：

- `workspace_load`
- `workspace_save`

workspace DTO 拒绝未知字段和任何 secret/session/output 字段。现有 session/profile/transfer commands 保持兼容，由 block runtime 按 sessionId 调用。

## Database Impact

不引入数据库。新增 app-data `workspaces.json`，`schemaVersion: 1`，使用原子替换；损坏或未知版本不得覆盖原文件。保存动作由前端 reducer 的低频结构变更触发，不保存终端字节或暂态连接状态。

## Implementation Tasks

### 1. Workspace domain 与持久化保护

- 先写 layout split/close/move/resize/maximize 不变量测试。
- 先写 Rust workspace schema、敏感字段拒绝、unknown version、原子 round-trip 测试。
- 实现 Rust domain/repository/application/commands 与前端 IPC client。

### 2. Workspace/Tab 状态与多终端 runtime

- 实现 reducer：workspace/tab/block CRUD、排序、split、ratio、focus、maximize、move。
- 建立 block-scoped runtime state，替代 App 中 singleton session/writer/host-key/transfer state。
- 所有 workspace/tab canvas 保持 mounted；隐藏区域不触发 resize，重新激活后 fit。
- 实现父级关闭的 active-session 影响统计和确认后级联 close。

### 3. 全屏 shell 与工具弹窗

- 构建 Workspace Switcher、Tab Bar、Terminal Canvas、Utility Rail。
- 连接管理弹窗复用 profile CRUD；连接进入 active block。
- SFTP 弹窗绑定 active connected block；设置/帮助弹窗提供现阶段可用信息。
- 删除固定左右面板，建立高对比暗色 tokens、focus-visible、tooltip 和 reduced-* media rules。

### 4. Split、resize、最大化与键盘

- 递归渲染二叉布局；分割线 Pointer Events 1:1 更新 ratio，结束后持久化。
- Block header 提供 split horizontal/vertical、maximize、close、connection status。
- 实现 workspace/tab/block 常用键盘导航和 Escape/focus return。

### 5. Tab 与 Block 拖放

- Tab 原生 pointer drag 排序，保持当前 tab identity。
- Block header pointer drag 使用 capture、10px hysteresis、drag preview 和五向 drop zones。
- drop 时调用纯 `moveBlock`；边缘落点创建 split，中心落点交换 leaf。
- 拖动中只变更 transform/overlay，结束时一次性提交树；reduced-motion 下关闭位移动画。

### 6. 文档与最终验证

- 更新 README、安全模型、task spec 状态、长期 context 与 Directory Map。
- 执行前端、Rust、真实 sshd 多 session、视觉/键盘、audit 和 release bundle 门禁。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 全屏终端与窄工具轨 | 1040×720、720×520 浏览器截图与 body scroll 尺寸；旧 sidebar/inspector DOM 不存在。 |
| Workspace/Tab CRUD/排序 | reducer 测试、组件交互测试、workspace JSON round-trip。 |
| 多 Block split/resize/maximize/drag | layout property-style tests、pointer interaction tests、视觉拖放冒烟。 |
| 多 session 隔离 | 两 block callbacks 单测；真实 sshd 同时连接/输出测试。 |
| 隐藏视图继续输出 | 切换 tab/workspace 后注入输出，切回检查 xterm 内容。 |
| 工具弹窗作用域与焦点 | RTL 测试 connection/SFTP active block binding、Escape 和 focus return。 |
| 安全持久化 | Rust unknown/sensitive schema tests、文件内容断言，无 secrets/session/output。 |
| 关闭生命周期 | reducer impact count 与 session close mock，取消/确认/幂等路径。 |
| 视觉与可访问性 | browser smoke、键盘流程、media query 检查、axe-like role assertions。 |

## Test Plan

- 关键测试优先：layout tree 不变量、workspace schema、multi-block event isolation、hidden output retention、级联关闭。
- 前端：Vitest + RTL 测 reducer、layout、shell、dialogs、drag drop 和 session adapter 编排。
- Rust：workspace domain/repository/commands，保持现有 46 项 SSH/SFTP 测试并扩展多 session integration。
- 手工：1040×720/720×520、拖动/中断、分割 resize、tab/workspace 切换、键盘、reduced motion。
- 最终：`pnpm check`、`cargo fmt --check`、`cargo test --all-targets`、ignored local sshd、Clippy、audit、`pnpm tauri build`。

## Rollback Plan

- 新 shell 与 workspace modules 不改变现有 profile/session/transfer IPC；可回滚前端入口恢复单终端 UI。
- `workspaces.json` 与 `profiles.json`/`known-hosts.json` 分离；回滚不删除或迁移后两者。
- schema v1 未知版本失败且保留原文件；不做破坏性自动降级。
- 每次关闭 session 仍走现有幂等 command，布局回滚不会留下不可控 Rust session。

## Risks

- 隐藏但 mounted 的多个 xterm 增加内存；验证至少 8 个 block，后续再引入休眠策略。
- Channel callback 与 block 卸载/移动存在 race；runtime 以稳定 blockId 注册并在显式 close 时注销。
- Pointer drag 与 xterm 文本选择冲突；仅 block header 启动 drag，并设置 hysteresis。
- 多层 split resize 可能产生不可用尺寸；ratio clamp 且小尺寸下允许 block 内容裁切，不允许页面溢出。
- 父级关闭可能漏关 session；关闭影响从 layout leaf 集合计算并测试。
- 持久化频繁写盘；只在结构动作完成后保存，resize/drag 结束时提交。

## Documentation Updates

- `README.md`：Workspace/Tab/Block 操作与快捷键。
- `docs/security-model.md`：workspace persistence 字段白名单与多 session 边界。
- `docs/qb-spec/specs/2026-08-18-wave-workspace-foundation.md`：完成状态和偏差。
- `docs/qb-spec/context/*`：保持已接受层级和布局决策。
- `docs/qb-spec/DIRECTORY_MAP.md`：实现后记录 workspace、terminal、dialogs 新边界。
