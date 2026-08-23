> 实施状态（2026-08-23）：已落地。Dark 保持默认，新增 Light 预设、独立 appearance 持久化、启动引导、设置页预览/保存/回滚，以及 DOM/native/xterm/CodeMirror 同步。后续视觉回归已将文字层级、图标、Block chrome 与 scrollbar 抽为两主题共同契约，修复 Light 终端黑色滚动轨道并为常规小字建立 4.5:1 对比度门；其余遗留 feature 原始暗色值继续由 root-scoped 兼容层隔离并受 raw-color budget 约束。

## Goal

Qterm 提供 Dark 与 Light 两种内置主题。既有 Dark 外观、默认行为和终端配色保持兼容；用户可在系统设置中预览、保存并跨重启恢复 Light 主题，WebView、xterm、CodeMirror 与原生窗口 chrome 保持同一主题。

## Scope

- 仅提供 `dark`、`light` 两个受控预设，Dark 为缺省值。
- 在系统设置新增“外观”分类，以可访问的单选主题卡展示两个预设。
- 选择时即时预览；成功保存后提交为当前主题，关闭或保存失败时恢复最后一次已保存主题。
- 把主题作为设备级 appearance setting 持久化，并通过 Settings snapshot/窄更新 IPC 读写。
- 应用启动时在 React 首次渲染前读取并应用主题；读取失败或值无效时安全回退 Dark。
- 同步根 DOM theme、CSS `color-scheme`、Tauri 原生窗口 theme、全部存活 xterm 实例和 CodeMirror surface。
- 完成剩余 feature raw color 的语义 token 迁移，并新增 Light token preset。

## Constraints

- 当前 Dark 主题的计算值和视觉层级不得有意改变。
- theme state 由 application theme boundary 拥有，不进入 Workspace context、layout reducer 或 persistence。
- appearance 数据与 security settings 分离，不能因为新增主题而清除、迁移或重写现有安全设置。
- IPC 只接受封闭枚举 `dark | light`，appearance 文件不包含路径、凭据或其他敏感字段。
- 不新增 UI、状态管理、CSS-in-JS、主题或动画依赖。
- 保持 reduced-motion、reduced-transparency、increased-contrast 和键盘 focus 契约。

## Non-Goals

- 不提供系统自动模式、日出日落、定时切换或跟随 OS。
- 不允许用户编辑颜色、导入主题、安装主题包或选择 accent。
- 不同步云端或跨配置根复制主题。
- 不重设计既有 Dark 主题、组件布局、字体、圆角或动效。
- 不为主题切换修改 Workspace、SSH、credential、profile 或 session 领域模型。

## Acceptance

- A1：无 appearance 文件、文件缺失或读取失败时使用与当前一致的 Dark 主题。
- A2：设置页只展示 Dark/Light 两个预设；鼠标与键盘可选择，选中状态不只依赖颜色。
- A3：主题选择即时作用于应用；取消/关闭或保存失败恢复已保存主题；保存成功后跨重启保持。
- A4：一次主题变更同步 DOM root、原生窗口、已有和新建 xterm、CodeMirror，不出现同屏混合主题。
- A5：Light 下 app chrome、Workspace、dialogs、Terminal、Files、Network、Settings/About 的正常、hover、selected、disabled、focus、success/error 状态可辨识，并满足小字号文本对比要求。
- A6：Dark 的关键 token 与代表性计算值保持既有基线；feature CSS 不再新增未登记的原始颜色。
- A7：appearance persistence 严格拒绝未知字段和未来 schema，保留损坏/未来文件；不触碰 `settings.json` 安全策略。
- A8：公开 IPC 只增加 `appearance` snapshot 和窄 `settings_update_appearance`，不改变既有 security/general DTO 行为。

## Acceptance To Verification

- A1/A3/A7：Rust appearance repository/application/command tests 覆盖缺失、round-trip、损坏、未来版本、失败不覆盖和 security 文件不变；SettingsDialog 测试覆盖 preview、rollback、save、save failure。
- A2：Testing Library 验证 radio group、键盘选择、可访问名称和选中状态。
- A4：theme controller、native adapter、terminal registry 与 editor CSS 契约测试；手工切换检查 cached terminal。
- A5：两主题代表性页面视觉检查、WCAG 对比扫描或等价取样记录，以及 reduced transparency/contrast/manual keyboard 检查。
- A6：Dark token snapshot/关键 computed-style 对比和 feature raw-color guard。
- A8：Rust DTO serialization/deny-unknown tests 与 `src/lib/tauri/settings.test.ts`。

## Open Questions

无阻塞问题。规划假设主题是当前配置根下的设备级偏好，设置页采用即时预览、显式保存和关闭回滚语义。

## Recommended Approach

采用独立 `device/appearance.json` schema v1，并由现有 Settings snapshot 聚合返回。相比前端 `localStorage`，它保持 Rust settings 为唯一持久化真相并可同步原生窗口；相比升级现有 `settings.json`，它不会让外观能力触发安全设置迁移或重置。

前端建立 App-level ThemeProvider/controller：启动 bootstrap 先应用已保存主题，运行期负责 preview/commit/restore，并通过窄 window adapter 与 terminal registry 同步 imperative renderer。CSS 使用相同 semantic contract 下的 Dark/Light 两组 preset，feature 仅消费语义 token。

## Next Skills

- `writing-qb-plans`：Strict plan，因为涉及新增持久化 schema、IPC、启动流程和全局视觉迁移。
- `checking-architecture-boundaries`：确保 theme 不进入 Workspace，appearance persistence 与 security settings 分离。
- `protecting-critical-behavior`：先保护默认 Dark、preview rollback、持久化失败和 cached renderer refresh。
- `verifying-before-completion`：执行前端/Rust全量门和两主题手工视觉矩阵。
- `maintaining-project-context`：实现后更新长期 theme/persistence 决策。
- `updating-directory-map`：实现新增 theme controller、appearance repository/port 后更新目录地图。
