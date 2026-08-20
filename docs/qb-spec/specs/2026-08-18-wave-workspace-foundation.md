# Wave 风格工作区基础重构 Task Spec

## Status

Superseded in part on 2026-08-18 by `2026-08-18-flat-workspace-tabs.md`：Terminal Block、工具轨和布局能力保留，Workspace Switcher 与内部 Tab 层已由顶部 Workspace 标签取代。

## Goal

把现有单页面 SSH MVP 重构为以终端画布为核心的桌面工作台：用户通过独立 Workspace Switcher 管理工作区，通过顶部 Tab Bar 组织任务，并在每个 Tab 中同时运行、分割和调整多个 Terminal Block；连接、文件、设置和帮助只在需要时从右侧工具轨打开。

## Scope

- 建立稳定的 `Workspace → Tab → TerminalBlock` 前端与持久化模型。
- 使用独立 Workspace Switcher 创建、切换、重命名和删除工作区；工作区自动持久化，不引入 Wave 的临时/手动保存语义。
- 顶部 Tab Bar 支持创建、切换、重命名、关闭和拖动排序 Tab。
- Tab 画布默认包含一个 Terminal Block，并支持显式水平/垂直分割、拖动分割线、焦点切换、单块最大化和关闭。
- Terminal Block 独立拥有 session、host-key prompt、错误、xterm 实例和传输上下文；多个 SSH 会话可以并行运行。
- 切换 Workspace 或 Tab 时活动会话继续运行，终端输出和 xterm buffer 必须保留。
- 删除固定左侧连接列表和固定右侧连接/SFTP 面板；终端画布占满 Tab Bar 与右侧工具轨之间的全部区域。
- 右侧工具轨保持约 44–52 px，提供连接、文件传输、设置和帮助图标；点击后打开与触发图标存在空间关联的弹窗或非阻塞浮层。
- 连接管理弹窗复用现有 profile CRUD，并允许把连接启动到当前 Terminal Block；SFTP 弹窗只作用于当前已连接 Block。
- 使用更高对比度的深色 token、系统字体、清晰焦点状态、工具提示和键盘操作。
- 工作区、Tab、布局树和 profile 引用写入带 schema version 的应用数据；密码、口令、session id、终端输出和私钥正文禁止持久化。重启后恢复布局，但 Terminal Block 为未连接状态。
- 关闭活动 Terminal Block/Tab/Workspace 时展示受影响的活动会话数量，并在确认后逐一关闭会话。

## Constraints

- 保持 Tauri 2、React、TypeScript、xterm.js、Rust/russh 技术基线。
- Rust `SshSessionManager` 已支持多 session；重构必须复用现有 session-id command surface，不复制 SSH 协议逻辑到前端。
- 布局第一阶段采用可序列化的二叉 split tree；不直接复制 Wave 的通用 Widget n-tree。
- 布局状态使用 reducer/domain helpers 管理，不继续堆入单体 `App.tsx`。
- 隐藏 Tab/Workspace 不得卸载或丢弃活动 xterm runtime；只有显式关闭 Block 才终止对应 session。
- 拖动分割线和 Tab 排序必须即时跟随指针；弹窗使用无过冲、可打断的短动画，并为 `prefers-reduced-motion`、`prefers-reduced-transparency` 和 `prefers-contrast` 提供降级。
- 工具轨图标必须有可访问名称、tooltip、键盘焦点和至少 32×32 px 的点击区域。
- 默认窗口 1040×720 下，一个 Terminal Block 是视觉主体；在 720×520 最小窗口下不得出现页面级横向滚动。

## Non-Goals

- 原基础切片不要求 Terminal Block 拖动重排；实施时已连续交付第二切片，支持边缘 split 和中心交换。
- 不实现 Web、AI、文件预览、系统监控等非 Terminal Widget；模型保留未来扩展位置，但不提前建设通用插件系统。
- 不实现 Wave 的临时 Workspace、手动 Save Workspace、多窗口 Workspace 占用状态或 durable remote session。
- 不保存终端历史，不在应用重启后自动重连 SSH。
- 不新增 SSH Agent、`~/.ssh/config`、目录扫描或凭据持久化。
- 不完整复刻 Wave 的视觉、快捷键或内部 n-tree 算法。

## Acceptance

1. 应用启动后终端画布占据主区域，旧的固定左右管理面板不再存在；右侧仅保留窄工具轨。
2. 用户可以创建并切换至少两个 Workspace，每个 Workspace 可以创建、重命名、排序和关闭多个 Tab。
3. 每个 Tab 可以创建至少四个 Terminal Block，支持横向/纵向分割、分割线 resize、焦点切换、最大化/恢复和关闭。
4. 两个或更多 Block 可以同时连接不同 SSH profile；输入、输出、状态、host-key prompt 和错误不会串到其他 Block。
5. 切换 Tab 或 Workspace 后后台命令继续运行；返回时可以看到切换期间产生的输出，布局和焦点保持稳定。
6. 连接管理、SFTP、设置和帮助从工具轨按需打开；关闭弹窗后焦点返回触发按钮，Escape 可以关闭非破坏性弹窗。
7. 重启应用后 Workspace、Tab、布局比例、名称和 profile 引用恢复；所有 Block 显示未连接，持久化文件中不存在密码、口令、session id 或终端内容。
8. 关闭含活动会话的 Block、Tab 或 Workspace 会给出准确影响范围；确认后所有相关 session 被关闭，取消则不改变会话或布局。
9. 默认窗口和最小窗口均无页面级溢出；键盘可完成 Workspace/Tab 切换、Block 聚焦和主要弹窗操作；降低动态效果设置下不执行大范围滑动或弹簧位移。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 全屏画布与工具轨 | 1040×720、720×520 浏览器/Tauri 截图和 DOM 尺寸检查；确认旧固定面板选择器不存在。 |
| Workspace/Tab CRUD | reducer/domain 单元测试、持久化 round-trip 测试和组件交互测试。 |
| 多 Block split/resize | layout tree 属性测试，覆盖 split、resize、maximize、close 后树压缩；指针交互组件测试。 |
| 多 SSH 会话隔离 | 两个本机 sshd session 并行集成测试；每个 channel 输出断言只进入对应 pane。 |
| 切换后继续运行 | 在非活动 Tab 运行延迟输出命令，切回后断言输出和 xterm buffer 未丢失。 |
| 工具弹窗 | 键盘、Escape、focus return、ARIA label 和当前 Block 作用域组件测试。 |
| 安全持久化 | schema/恢复测试和敏感字段拒绝测试；扫描 fixture 确认无 secret/session/output 字段。 |
| 关闭生命周期 | 活动 session 计数、取消、确认和级联幂等 close 回归测试。 |
| 可用性与无障碍 | 默认/最小窗口视觉冒烟、键盘流程、reduced-motion/contrast CSS 检查。 |

## Open Questions

无阻塞问题。第一阶段按“Workspace 自动持久化、切换不终止会话、Block 拖动重排后续实现”推进。

## Recommended Approach

采用自有的可序列化二叉 split tree，而不是立即实现 Wave 的通用 n-tree 或引入控制布局模型的重量级组件库。Workspace 和 Tab 元数据由纯 reducer 管理，Terminal runtime registry 以 `blockId` 关联独立 xterm writer、session id 和事件 sink；React 只渲染和编排，不把高频终端字节写入全局状态。

实施分为两个连续切片：本 spec 先完成壳层、Workspace/Tab、多会话 Block、显式 split/resize、生命周期和持久化；第二个 spec 再加入 Block header 直接拖动、落点占位、树重排和速度连续的动效。这样可以先验证多会话隔离和隐藏视图输出保留，再承担复杂拖放风险。

## Next Skills

- `writing-qb-plans`：为本 spec 选择风险级别并把每条 acceptance 映射到实施步骤。
- `checking-architecture-boundaries`：拆分 workspace domain、terminal runtime registry、dialogs 和 persistence adapter，避免回到单体 App 状态。
- `protecting-critical-behavior`：优先保护多会话事件隔离、隐藏视图输出、布局树变换、安全持久化和级联关闭。
- `verifying-before-completion`：执行前端交互、真实 sshd 多会话、视觉/键盘、Rust 和打包门禁。
- `updating-directory-map`：实现后新增 workspace/layout/dialog 模块并改变 `App.tsx` 入口职责，需要刷新结构索引。
