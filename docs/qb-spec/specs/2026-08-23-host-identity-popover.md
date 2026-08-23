# 主机身份概要与复制入口

状态：已实现并验证

## 背景

工作区 Block 顶部会展示远程连接的 `username@host`，但当前信息仅供阅读：缺少可发现的 hover/focus 反馈，也无法直接复制目标主机地址。连接信息同时存在于普通直连和保留连接路由进度两条渲染路径，分别增强会造成行为与主题样式分叉。

## 目标

- Dark、Light、Cyberpunk 均为活动远程主机身份提供清晰、克制且主题可控的强调。
- 远程主机身份在 hover、键盘 focus 和展开状态下具有一致反馈。
- 点击主机身份打开紧凑概要浮层，展示连接名称、用户名、主机、端口和完整 SSH endpoint。
- 浮层提供一个明确的“复制主机地址”动作，复制纯 `host`/IP，便于粘贴到其他工具。
- 普通直连与连接路由完成态复用同一个组件和同一套交互。

## 非目标

- 不编辑连接配置，不复制密码、密钥或其他凭证。
- 不在本地终端或未连接状态展示主机概要入口。
- 不改变目标选择器、连接流程或路由进度业务状态。

## 交互与可访问性

- 触发器使用原有等宽小字外观，hover/focus 扩大可发现的视觉热区，但不改变 Block header 高度。
- 浮层使用 portal 和 fixed 定位，始终限制在视口内；窗口 resize/scroll 时重新定位。
- 点击外部或按 Escape 关闭；Escape 关闭后焦点回到触发器。
- 浮层使用 `role="dialog"` 和可读标题；复制成功或失败通过 `role="status"` 反馈。
- 窄 Block 下允许隐藏直连路径的主机身份，保持工具栏操作可用。

## 主题契约

- `--block-active-endpoint-text` 是活动主机身份文字色的唯一主题入口。
- Dark 与 Light 使用各自 accent；Cyberpunk 使用 danger red，延续已采纳的活动主机身份规则。
- hover/focus/展开状态由该 token 与共享 control/floating 语义色混合生成，不引入主题专属 selector。
- 浮层使用 `--floating-material`、`--floating-border`、`--floating-shadow`；复制按钮使用共享 primary action。

## 验收标准

- A1：三种主题的活动远程主机信息不再使用 dim；Dark/Light 为 accent，Cyberpunk 为 danger。
- A2：普通直连和连接路由完成态都渲染同一个可点击主机身份组件。
- A3：点击后概要信息完整，复制动作只写入 profile 的 `host`。
- A4：外部点击与 Escape 可关闭，键盘 focus 可见，浮层不会越出视口。
- A5：本地或未连接目标保持原有非交互详情展示。
- A6：组件测试覆盖打开、复制、反馈、关闭；主题与 CSS 合约测试覆盖共享语义角色。
