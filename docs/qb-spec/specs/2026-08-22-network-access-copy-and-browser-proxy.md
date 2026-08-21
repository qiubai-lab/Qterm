# Network Access Copy And Browser Proxy

## Goal

让用户从每条网络实例快速取得语义准确、可以直接选择或复制的访问端点，并能在 Windows 上从运行中的 SOCKS5 实例启动一个明确使用该代理的独立 Chrome 或 Edge 浏览器实例。

## Scope

- 本地转发和远程转发网络实例显示常驻“复制图标 + 复制”按钮；SOCKS5 使用“小浏览器图标 + 代理”按钮，明确区分浏览器代理能力。
- 点击复制按钮打开紧凑访问弹窗；地址既可通过按钮写入剪贴板，也可由用户手动选择复制。
- 本地转发只提供“本地可访问地址”复制字段，并在字段上方说明该入口会自动转发到服务器目标；远程转发只提供“远程可访问地址”复制字段，并说明该入口会自动转发到本地目标。
- SOCKS5 展示带 `socks5://` scheme 的连接字符串，并在下方展示实验性浏览器代理区域。
- 浏览器代理区域提供默认开启的“代理本地与内网地址”开关；开启时取消 Chromium 对 localhost、回环和链路本地地址的隐式代理绕过。
- Windows 浏览器代理首期支持 Google Chrome 和 Microsoft Edge；弹窗显示浏览器检测、未安装、可启动、启动中、成功和失败状态。
- 浏览器启动使用 Qterm 管理的独立用户数据目录，避免复用或污染用户日常浏览器 Profile。
- 只有 SOCKS5 listener 已实际可用时才启动代理浏览器；浏览器启动后由用户独立管理，停止规则或关闭 Qterm 不强制结束浏览器进程。

## Constraints

- 浏览器代理明确标记为实验性功能，仅支持 Windows 桌面版和 Chrome/Edge。
- Chrome/Edge 使用 SOCKS5 代理、远程 DNS 约束和独立 `user-data-dir` 参数；不承诺扩展、WebRTC 或所有非 URL 浏览器组件都不会直连。
- “代理本地与内网地址”只向后端传递布尔选择；`--proxy-bypass-list=<-loopback>` 由可信 Rust adapter 固定生成。关闭时保留 Chromium 的 localhost/链路本地绕过，常规 RFC1918 内网地址仍按 SOCKS5 代理处理。
- 不经 Shell 拼接命令；后端只接受固定浏览器枚举和规则标识，浏览器可执行文件及参数由可信 Rust 代码生成。
- `0.0.0.0`、`::` 等监听通配地址不得直接作为建议访问地址；IPv6 地址必须使用方括号格式。
- 远程转发的外部可访问性仍受 SSH `GatewayPorts`、服务器监听地址和防火墙影响，弹窗不能将建议地址表述为已保证可访问。
- 复用现有 `DialogFrame`、`Icon`、剪贴板插件、颜色令牌和紧凑暗色界面，不引入 UI、图标或进程启动依赖。
- 不改变网络规则持久化 schema、Local/Remote/SOCKS5 转发语义或 SSH session 生命周期。

## Non-Goals

- 不支持 Firefox、Brave、Chromium、Vivaldi 或其他浏览器。
- 不支持 macOS、Linux、移动平台或远程启动服务器上的浏览器。
- 不修改系统代理，不复用用户现有浏览器 Profile，不安装浏览器扩展。
- 不提供浏览器进程停止、强制退出、运行进程管理或自动关闭能力。
- 不承诺代理所有 UDP、WebRTC、浏览器扩展或浏览器后台组件流量。
- 不增加代理认证、SOCKS4、UDP ASSOCIATE、代理连通性网站或本地状态 Web 服务。
- 不使用 `--app=data:` 页面作为代理提示机制。

## Acceptance

1. 本地与远程实例常驻显示“复制图标 + 复制”，SOCKS5 常驻显示“小浏览器图标 + 代理”；按钮无需悬停即可发现，具备名称相关的可访问标签、标题、键盘焦点和稳定布局，不影响现有 ON/OFF 开关与右键菜单。
2. 本地转发弹窗只显示并可复制“本地可访问地址”，字段上方说明会转发到哪个服务器目标；远程转发只显示并可复制“远程可访问地址”，字段上方说明会转发到哪个本地目标。目标地址不是第二个复制字段。
3. SOCKS5 弹窗显示并可复制 `socks5://host:port`，地址字段为只读、可聚焦并支持用户手动选择复制。
4. 地址派生正确处理主机名、IPv4、IPv6、`localhost`、`0.0.0.0` 和 `::`；远程通配监听使用连接 Profile 主机生成带风险说明的建议地址，远程回环监听保持服务器回环语义。
5. 复制成功、复制失败、浏览器检测中、未安装、不可启动、启动中、启动成功和启动失败均有文字状态；条件反馈使用预留区域，不改变弹窗尺寸。
6. SOCKS5 浏览器区域显示“实验性”标识和能力边界说明；非 Windows 平台不显示可用启动操作，Firefox 不出现在当期支持列表。
7. Windows 检测到 Chrome 或 Edge 时可从实际可用的 SOCKS5 listener 启动对应独立浏览器实例；未安装、规则未运行、listener 不可达或进程启动失败时不会伪报成功。
8. 浏览器启动不经过 Shell，不接受前端提供的可执行文件路径或任意参数，并使用 Qterm 本地数据目录下的浏览器专用 Profile。
9. 关闭访问弹窗恢复到触发复制按钮的焦点；Escape、Tab 焦点限制、最小窗口尺寸、减少动效和减少透明度设置保持可用。
10. 现有规则创建、编辑、删除、启动、停止、跨 Network Block 锁定和列表滚动行为不回归。
11. “代理本地与内网地址”开关默认开启、具备原生 switch 语义和明确的远程 localhost 说明；开启时浏览器参数包含固定 `<-loopback>` 规则，关闭时不包含该规则，且不同选择使用不同隔离 Profile，避免复用运行中的浏览器进程而忽略新参数。

## Acceptance To Verification

- 1、2、3、5、6、9、10：`NetworkPane` 和新访问弹窗的 Testing Library 测试，配合 `appStyles.test.ts` 样式契约与既有网络界面回归。
- 4：独立地址派生单元测试覆盖 local/remote/SOCKS5、通配地址和 IPv6 矩阵。
- 7、8：Rust 单元测试覆盖 Chrome/Edge 探测优先级、白名单浏览器 DTO、参数构造、独立 Profile 路径、listener 探测和失败映射；Windows 实机冒烟验证负责证明真实浏览器可启动。
- 11：访问弹窗测试覆盖默认开启与手动关闭；前端 IPC 测试覆盖布尔字段名；Rust DTO 与参数构造测试覆盖固定规则、关闭分支和无任意 bypass 字符串输入。
- 全部验收：运行前端 `pnpm check`、Rust `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings`、`cargo test --all-targets --all-features` 和 `git diff --check`。

## Open Questions

无阻塞问题。首期平台和浏览器范围已确定为 Windows、Google Chrome 与 Microsoft Edge。

## Recommended Approach

方案一是只实现复制弹窗，成本最低但不能满足当期浏览器代理目标。方案二是在前端直接调用浏览器路径或通用 opener，改动较少，但无法安全限制命令、可靠传递启动参数或隔离现有 Profile。推荐方案三：访问地址保持为前端可测试的只读派生，Windows 浏览器探测、listener 验证、独立 Profile 路径和无 Shell 进程启动由专用 Rust adapter 负责，Tauri command 只暴露固定浏览器枚举和结构化结果。该方案在不改变网络领域模型的前提下提供明确的信任边界，也便于后续单独扩展平台或浏览器。

## Next Skills

- `writing-qb-plans`（Standard）
- `checking-architecture-boundaries`
- `protecting-critical-behavior`
- `qterm-interface-design`
- `verifying-before-completion`
- `updating-directory-map`（新增浏览器启动 command / infrastructure adapter 后更新现有模块职责）

Project Context: not needed；Windows Chrome/Edge 首期范围是本任务局部产品决定，不改变长期产品目标或既有网络领域规则。
