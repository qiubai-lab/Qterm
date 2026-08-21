# Network Access Copy And Browser Proxy Plan

## Requirement

为 Local、Remote、SOCKS5 网络实例提供常驻访问复制入口和语义准确的紧凑弹窗，并为 Windows、macOS、Linux 上运行中的 SOCKS5 规则提供实验性的独立 Chrome/Edge 代理启动能力。

## Scope

- 增加三种规则共用的访问地址派生、访问弹窗和逐项剪贴板反馈。
- 调整网络实例尾部布局以容纳带文字的常驻操作：Local/Remote 使用“复制图标 + 复制”，SOCKS5 使用“小浏览器图标 + 代理”，同时保持开关和现有右键菜单行为。
- 为 SOCKS5 弹窗提供 Windows、macOS、Linux Chrome/Edge 检测与启动状态。
- 将公共浏览器代理逻辑与三个 OS adapter 分离，并增加自动化保护。
- 不修改网络规则 schema、SSH 转发实现、系统代理或浏览器进程生命周期。
- 不支持 Firefox、移动平台或 Chrome/Edge 以外的浏览器；Linux 不支持 Snap、Flatpak、Chromium 和非官方浏览器包。

## Affected Files

- `src/network/NetworkPane.tsx`
- `src/network/NetworkPane.test.tsx`
- `src/network/NetworkAccessDialog.tsx`（新增）
- `src/network/NetworkAccessDialog.test.tsx`（新增）
- `src/network/networkAccess.ts`（新增地址派生）
- `src/network/networkAccess.test.ts`（新增）
- `src/lib/tauri/browserProxy.ts`（新增）
- `src/lib/tauri/browserProxy.test.ts`（新增）
- `src/workspace/LayoutView.tsx`
- `src/components/Icon.tsx`（仅当 Chrome/Edge 无法以现有 browser 图标和文字区分时做最小扩展）
- `src/app/app.css`
- `src/app/appStyles.test.ts`
- `src-tauri/src/commands/browser.rs`（新增）
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/infrastructure/browser/mod.rs`（由现有单文件迁移公共逻辑）
- `src-tauri/src/infrastructure/browser/windows.rs`
- `src-tauri/src/infrastructure/browser/macos.rs`
- `src-tauri/src/infrastructure/browser/linux.rs`
- `src-tauri/src/infrastructure/mod.rs`
- `src-tauri/src/lib.rs`
- `src-tauri/Cargo.toml`（为现有 Windows crate 启用所需注册表 API feature）
- `docs/qb-spec/DIRECTORY_MAP.md`

## Design

### Frontend interaction

- `NetworkPane` 只保存当前打开的访问规则，并把当前连接 Profile、规则运行状态和跨窗口锁定状态传给 feature-local `NetworkAccessDialog`。
- 列表项网格扩展为“状态、正文、访问操作、开关”；Local/Remote 操作使用现有 `copy` 图标和“复制”文字，SOCKS5 使用现有 `browser` 图标和“代理”文字，并保留动态 `aria-label`、稳定点击区域和焦点恢复。
- `NetworkAccessDialog` 使用标准宽度或紧凑扩展宽度的 `DialogFrame`：上部为地址卡片，下部仅对 SOCKS5 渲染实验浏览器区域。地址使用只读 input，使鼠标选择、键盘全选和手工复制可用。
- 每项复制直接复用 `@tauri-apps/plugin-clipboard-manager`；一个固定高度 `aria-live` 状态槽展示复制或启动结果，不因消息出现而改变弹窗几何。
- 浏览器按钮保持 Chrome、Edge 固定顺序。检测中与启动中禁用相关操作；未安装按钮保留但禁用。SOCKS5 未运行或跨窗口 listener 尚不可确认时，展示明确不可启动原因。

### Address derivation

- `networkAccess.ts` 从 `NetworkRule` 和 `ConnectionProfile` 纯函数派生展示标签、原始配置端点、建议复制值和警告，不把展示模型写回 IPC 或持久化模型。
- 通用端点格式化对 IPv6 加方括号；本地/SOCKS 通配监听规范化到本机回环地址。
- Local 只输出可复制的本地 listener，并生成一句包含服务器侧 target 的转发说明；Remote 只输出可复制的服务器 listener，并生成一句包含本地 target 的转发说明。target 不作为第二个可复制入口。
- Remote 的具体绑定地址按原值显示；绑定通配地址时用 Profile host 生成“建议服务器访问地址”并附带 `GatewayPorts` / 防火墙提示；绑定服务器回环地址时不替换成 Profile host。
- SOCKS 连接字符串只使用浏览器所在本机可连接的 listener 地址，格式为 `socks5://host:port`。

### Native browser boundary

- `commands::browser` 定义固定 `chrome | edge` 枚举、浏览器状态 DTO 与结构化 IPC 错误；拒绝未知字段和未知浏览器值。
- command 不接受 executable、参数数组或 Profile 路径。平台 adapter 根据可信浏览器枚举探测安装位置：Windows 使用 App Paths 与标准目录，macOS 使用固定 Bundle ID 与 LaunchServices，Linux 仅接受 PATH 或官方安装位置中解析到 Google / Microsoft `/opt` 安装根的原生可执行程序，并在 AppImage 环境中移除只指向 Qterm AppDir 的动态库路径后启动外部浏览器。
- 浏览器启动 command 只接受 `ruleId + browser`。后端从 `NetworkState` 重新读取规则、拒绝非 SOCKS5 类型、自行规范化本地 listener 地址，并执行一次无认证 SOCKS5 greeting 探测；只有返回成功协商时才允许启动。这样既支持规则在另一个 Network Block 中运行，也不信任前端提供 endpoint。
- Chrome/Edge 参数由 adapter 固定生成：SOCKS5 proxy、DNS resolver 规则和 Qterm 管理的 `user-data-dir`。使用 `std::process::Command` 直接传参，不调用 Shell。
- 浏览器数据目录位于 Qterm 机器本地数据根下，按浏览器与规则建立稳定隔离目录；不得进入用户可迁移配置根。已存在同一隔离实例时返回明确状态，不覆盖或删除用户日常浏览器数据。
- 浏览器进程不纳入 Network session 级联关闭；规则停止后只在 Qterm 中说明浏览器可能失去网络，不主动结束外部进程。

### Architecture boundary decision

- 地址文案与可复制值是视图派生，归前端 network feature，不进入 Rust domain。
- 浏览器安装探测与进程启动是 OS adapter；SOCKS 探测、参数和 Profile 目录是共享基础设施逻辑，统一归 `infrastructure::browser`。
- Tauri command 只负责 DTO 校验、调用 adapter 和错误映射，不承载路径探测或命令参数规则。
- 不新增 application service 或 domain model：该能力不改变网络规则决策、持久化或 SSH 运行时，只消费已经存在的 SOCKS listener。
- 不建立通用外部进程框架；当前只有两个受控浏览器消费者，专用 adapter 更清晰且攻击面更小。

## Acceptance To Verification

- A1 常驻复制按钮与既有列表行为兼容：先更新 `NetworkPane.test.tsx`，断言按钮可发现、键盘可用、开关与右键菜单不回归；`appStyles.test.ts` 断言尾部列和最小宽度。
- A2/A3 三类弹窗与复制：新增弹窗测试，断言准确标签、只读可选择字段、逐项复制、成功/失败状态和焦点恢复。
- A4 地址边界：先写 `networkAccess.test.ts` 表驱动用例，覆盖主机名、IPv4、IPv6、localhost、两个通配地址、remote loopback 和 remote wildcard。
- A5/A6 状态与实验范围：组件测试覆盖固定反馈槽、Windows/非 Windows、检测中、未安装、规则停止、启动中、成功和失败；断言不渲染 Firefox。
- A7 真实启动条件：Rust 测试覆盖 listener 不可达、平台标识、Linux 原生路径筛选和固定启动参数；Windows、macOS、Linux 实机分别启动 Chrome/Edge 并确认使用当前 SOCKS listener。
- A8 信任边界：Rust DTO 反序列化测试拒绝未知浏览器、可执行路径和参数字段；adapter 参数构造测试确认无 Shell、独立 Profile 和固定代理参数。
- A9 可访问性与布局：组件测试覆盖 Escape/Tab/焦点恢复；样式契约覆盖固定反馈区域、窄宽度、focus-visible 与 reduced-motion/reduced-transparency。
- A10 回归：运行既有 NetworkPane、NetworkRuleDialog、WorkspaceProvider 和 appStyles 测试，再执行全量前后端检查。

## Test / Verification

1. 先增加地址派生、弹窗交互、IPC DTO 和浏览器参数构造失败测试，确认旧实现不能满足验收。
2. 运行聚焦前端测试：`pnpm exec vitest run src/network/networkAccess.test.ts src/network/NetworkAccessDialog.test.tsx src/network/NetworkPane.test.tsx src/app/appStyles.test.ts`。
3. 运行聚焦 Rust 测试：`cargo test --all-features browser`。
4. 运行 `pnpm check`。
5. 在 `src-tauri/` 运行 `cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `cargo test --all-targets --all-features`。
6. 运行 `git diff --check`。
7. Windows、macOS、Linux 桌面冒烟检查 Chrome 与 Edge：已安装/未安装检测、运行中 SOCKS 启动、停止规则拒绝、独立 Profile、代理出口和 DNS 行为。Linux 额外覆盖 `.deb` / `.rpm` 与 AppImage 宿主；Snap / Flatpak 明确显示为未检测。外网出口/DNS 验证仅作为手工证据，不进入不稳定的自动化测试。

## Documentation Updates

- 当前 task spec 与 Standard plan 记录当期范围和实验边界。
- 新增浏览器 command / infrastructure adapter 后更新 `docs/qb-spec/DIRECTORY_MAP.md`。
- 无需更新长期 `PRODUCT_SPEC`、`ARCHITECTURE_SPEC` 或 `DECISIONS`；若未来扩展为跨平台、系统级或受管理浏览器能力，再单独形成长期架构决定。

## Test Protection Decision

- 地址规范化、remote 通配派生、浏览器白名单、启动参数和 Profile 路径属于易回归的数据转换与安全边界，必须测试先行。
- 真实注册表/App Paths 和浏览器进程无法在所有 CI 环境稳定提供，使用可注入的探测/启动边界做自动化测试，Windows 实机启动作为补充证据。
- 视觉层级和浏览器品牌识别以组件/样式契约加人工检查保护，不引入截图基线依赖。

## Follow-up: Local And Private Address Proxy Toggle

- 在 SOCKS5 浏览器区域增加默认开启的“代理本地与内网地址”开关；该状态仅作用于当前弹窗启动的浏览器，不写入网络规则持久化。
- 前端 IPC 只增加 `proxyLocalAddresses: boolean`，后端 DTO 继续拒绝未知字段和任意浏览器参数。
- 开启时由 browser adapter 固定加入 `--proxy-bypass-list=<-loopback>`；关闭时不加入。两种模式使用不同的隔离 Profile key，确保已运行的 Chromium 实例不会吞掉新的启动参数。
- 自动化覆盖默认开启、关闭分支、IPC 字段映射、Rust DTO 安全边界与两种参数集合；完整验证命令保持不变。
