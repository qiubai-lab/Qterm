# Network Rule Type Onboarding

## Goal

用户创建网络规则时，能先通过清晰的流量方向说明理解 SOCKS5、本地转发和远程转发的差异，再进入对应配置表单。

## Scope

- 点击网络窗口创建入口后，先打开包含 SOCKS5、本地转发、远程转发三个入口的模式选择弹窗。
- 每个入口同时展示名称、方向标签和一条面向用户的用途说明。
- 选择模式后进入对应配置弹窗；创建表单固定使用已选类型，不再要求用户从术语下拉框开始理解。
- 新建配置表单的“返回选择”、右上角关闭和 Escape 都返回模式选择；只有关闭模式选择弹窗才取消本次创建。
- 编辑现有规则仍直接进入配置弹窗，不增加模式选择步骤，也不允许改变规则类型。

## Constraints

- 复用 `DialogFrame`、现有图标和 Qterm 紧凑暗色界面语言，不引入 UI 或动画依赖。
- 不改变 Network domain、持久化格式、运行时状态或 Tauri IPC。
- 选择和返回必须支持键盘焦点、Escape 与既有弹窗焦点恢复规则。

## Non-Goals

- 不增加新的转发类型、向导式端口探测、自动生成规则名称或网络拓扑图。
- 不改变 Local、Remote、SOCKS5 的既有技术语义和校验规则。
- 不改变编辑规则时的类型不可变约束。

## Acceptance

1. 点击创建图标先显示三个可聚焦的类型入口，而不是直接显示配置表单。
2. 三个入口用直白句式分别解释：SOCKS5 在本地启动代理，让浏览器或应用通过服务器访问网站或内网；本地转发开放本地端口并连接服务器可访问的目标；远程转发开放服务器端口并连接本地可访问的目标。
3. 选择 SOCKS5 后配置表单默认端口为 1080 且不显示目标地址/端口；选择 Local 或 Remote 后显示目标配置并保留既有默认值。
4. 新建配置表单通过“返回选择”、右上角关闭或 Escape 返回选择页；编辑现有规则直接进入配置表单、类型保持不可变，关闭或 Escape 仍直接退出编辑。
5. 选择弹窗在窄窗口下可用，入口具有 hover、pressed、focus-visible 和 reduced-motion 状态。

## Acceptance To Verification

- 1、2、4：`NetworkPane` 组件测试覆盖创建入口、三种说明、按钮/关闭/Escape 返回，以及编辑直达和退出。
- 3：`NetworkRuleDialog` 测试覆盖显式初始类型、SOCKS5 字段裁剪和默认端口。
- 5：`appStyles.test.ts` 覆盖选择布局、控制尺寸、焦点与 reduced-motion；运行 `pnpm check`。

## Open Questions

- 无阻塞问题。文案采用准确的流量方向描述，避免“穿透到服务器”被误解为服务实际部署位置发生变化。

## Recommended Approach

采用独立的紧凑类型选择弹窗，再挂载类型固定的 `NetworkRuleDialog`。相比在单个表单中维护内部步骤，这一方案让选择职责、配置职责和编辑职责保持分离，焦点与取消行为也更容易验证。

## Next Skills

- `writing-qb-plans`（Standard）
- `qterm-interface-design`
- `protecting-critical-behavior`
- `verifying-before-completion`

Directory Map: not needed；本次不改变目录或模块边界。
