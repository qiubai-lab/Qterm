# WKWebView 原始 localhost Origin：独立 OpenSSH 实测

2026-10-29 结论：**受限的第一方 HTTP 开发预览可行；尚不能作为 Qterm 默认的通用浏览方案。**

本目录是独立验证程序，不参与 Qterm 编译，也没有修改当前浏览器实现。它验证的是之前的实验方案：临时替换 `+[WKWebView handlesURLScheme:]`，注册 HTTP Scheme Handler 后立即恢复原方法。页面继续使用真实 `http://localhost:3000`，不是仅把地址栏显示成 localhost。

## 运行

在 macOS 的已登录图形会话中，安装 Command Line Tools、Python 3 和系统 OpenSSH 后运行：

```sh
python3 scripts/macos-web-origin-probe/run.py --evidence /tmp/qterm-origin-ssh-evidence.json
```

本次环境为 macOS 26.5；未验证其他系统版本。`127.0.0.1:3000` 必须空闲，测试会主动绑定它作为误连探针，占用时直接失败，不会终止现有服务。其他监听端口自动分配。

程序生成临时主机密钥、客户端密钥和固定 known_hosts，启动两套独立 sshd/SSH 连接。禁用密码和 SSH agent，不读取用户 SSH 配置，不修改 hosts、系统路由、系统代理或证书信任。结束时关闭进程和监听器，删除临时目录。临时 WebKit 规则列表使用专用名称，不访问 Qterm 的持久化存储。

原始报告写入 `--evidence` 指定位置；包含测试 Cookie 和请求记录，不包含私钥或控制通道令牌。已检入的 [evidence.json](evidence.json) 是本次实测摘要。

## 实际链路

- HTTP：WKWebView 原始 URL → 每个连接自己的 Handler/CookieOwner → 带随机令牌的本地 HTTP 网关 → `ssh -D` → 独立 sshd → 对应测试服务。
- WebSocket：页面保留原始 Origin；JS 将 WS 目标改为 `.qterm-tunnel.invalid` → 每个 WKWebsiteDataStore 自己的 SOCKS 网关 → 握手恢复 Host、从对应 WKHTTPCookieStore 获取最新 Cookie → SSH → 对应测试服务。
- 经典/模块 Worker：Handler 根据 `Sec-Fetch-Dest` 在 Worker 脚本前注入同一个 WS 映射器；Worker URL 保持不变。
- 两个浏览环境同时使用 `http://localhost:3000`，拥有独立 WKWebsiteDataStore、HTTP Handler、CookieOwner、网关和 SSH 连接。

两个模拟远端服务位于同一台机器、不同实际端口。本次证明了真实认证/SSH 转发和连接级隔离，**不是两台远端机器各自绑定 3000 的测试，也不是 Qterm 现有 russh 后端的集成测试**。

## 已观察到的结果

A/B 各 21 项检查通过，共 42 项，另有 6 个生命周期/兼容性场景记录。

| 验证项 | 结果 |
| --- | --- |
| 页面真实 Origin / secure context | `http://localhost:3000` / true |
| HTTP POST | 远端 Host、Origin、body 和连接身份正确 |
| Set-Cookie / document.cookie | 原生存储与 HTTP 往返同步；JS 写入也可发送 |
| HttpOnly | HTTP/WS 可使用，页面 JS 不可见 |
| Cookie 范围 | Path 与路径边界、外域排除、过期、Max-Age 删除、多条 Set-Cookie 均通过 |
| credentials: omit | 不发送 Cookie，也不接收 Set-Cookie |
| Secure Cookie | 测试适配器保守地不在 HTTP 上传输，不代表已复现浏览器对 localhost 的全部特例 |
| 页面 WebSocket | 正确的 Host、Origin、HttpOnly/JS Cookie；文本、二进制、1000 关闭及 reason 通过 |
| 经典 / 模块 Worker | HTTP POST 与 WebSocket 均经过对应 SSH，Origin 和 Cookie 正确 |
| A/B 并发 | Cookie、localStorage、HTTP/WS 目标身份独立 |
| 同一存储新建页面 | 复用 A 的 Cookie |
| 清理 A 的 Cookie | A 清空，B 保留 |
| 切断 A 的 SSH | 已打开 WS 以 1006 关闭；新 WS 失败；HTTP 502；B 的 HTTP 仍正常 |
| 恢复 A 的 SSH | A 的 HTTP 回到 A 服务 |
| 未改写的页面 / Blob Worker WS | 被规则阻止；本机探针收到 0 请求 |
| 严格 CSP `connect-src 'self'` | 改写后的 WebSocket 被拒绝，是已确认的兼容性障碍 |

SSH 日志分别确认 A/B 的 `Accepted publickey`。Python 断言同时检查远端 Host、跨连接 Cookie、生命周期结果和本机误连记录。CSP 的“blocked”是负向验证通过，**不是该网站兼容通过**。Blob Worker 的“blocked”同理：没有误连，但它的 WebSocket 功能不可用。

## 对 Qterm 的判断

**可以保留为实验模式候选。** 对第一方 HTTP、相对 URL、无严格 WS CSP、普通脚本 Worker 的开发应用，已经验证原始 Origin、常用 Cookie 登录状态和实时通信链路可以共同工作。此前 Vite HMR 的本地验证为独立证据，本轮没有重新把 Vite 接到 SSH，也没有把真实业务登录系统当作已验证。

**默认通用方案仍然 no-go，原因如下：**

1. 注册 HTTP Handler 依赖运行时替换，绕过 WebKit 明确的 API 限制。恢复方法后本机可用，不构成未来 macOS 版本的兼容承诺。[WebKit API 声明](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebViewConfiguration.h)与[实现](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/UIProcess/API/Cocoa/WKWebViewConfiguration.mm)均拒绝原生 scheme 的 Handler 注册。
2. WS 仍需别名。页面 Origin 保住了，但 `WebSocket.url` 等可观察值变化；`connect-src 'self'` 实测失败。自动放宽 CSP 会改变站点策略，本测试没有这么做。
3. Blob Worker 没有经过脚本响应注入，只能阻止其裸 localhost WS。SharedWorker、ServiceWorker、嵌套 Worker 和其他新建 JS 上下文尚未完整覆盖。
4. Cookie 适配器仅限第一方 localhost。SameSite 的跨站上下文、第三方/分区 Cookie、前缀约束、HTTPS 与 Secure 的 localhost 特例、重启持久化均未验证。多条 Cookie 的简单案例通过，不等于完整 RFC/浏览器兼容解析。
5. HTTP 当前整包缓冲。SSE、大文件上传/下载、取消竞态、重定向链、认证挑战、压缩边界及长期运行尚未验证。URLSession 自动重定向已禁用，避免传输层脱离 SSH 路由。
6. 本轮只覆盖限定的 localhost 地址和 WS 规则，不是完整网络隔离审计；Qterm 原有 IPv6、其他 loopback 写法及 WebRTC 保护仍需保留并回归。

若下一阶段接入 Qterm，应把 CookieOwner 绑定到现有 store 标识，把 HTTP 与 WS 传输绑定到现有 profile 的 SSH 生命周期；连接变更时清楚界定存储与路由复用。当前 `Store.swift` 已按标识管理 WKWebsiteDataStore，但 `tunnel.rs` 只做 SOCKS 目的地址改写，**还没有本实验中的 HTTP Handler、WS 握手 Host/Cookie 处理**。

测试中的 Python 网关和 CookieBroker 是观察装置，不应直接打包进入产品。生产实现应使用内部 native/Rust 通道、请求与连接身份校验、大小/超时限制和可取消流式传输；不要让访客页面获得读取 HttpOnly Cookie 的 IPC。仅校验 WebSocket Origin 不能把本地测试监听器变成安全边界。

如果要求“任何 localhost 开发应用均无需配置、透明兼容”，本方案当前不满足要求。若允许受限实验模式，应先完成 Qterm 后端集成回归及上述关键边界，再决定开放范围。

## 验证与文件职责

- 原生验证命令：通过，42 项检查及生命周期断言通过；CSP 保留为已知不兼容项。
- `pnpm check`：通过；247 个测试文件通过、1 个跳过，1485 项 Vitest 通过、2 项跳过，40 项 Node 测试通过；构建有现有 chunk 大小提示。
- `pnpm check:source-size`：通过，无基线增长。
- 未修改 Rust/生产原生代码，未执行桌面打包，也不声称生产集成已通过。

`ssh_fixture.py` 管理真实 SSH；`origin_server.py` 提供 HTTP/RFC6455 观察端；`gateway.py` 只经 SSH 传输。`CookieOwner.swift` 负责测试 Cookie 策略，`HTTPHandler.swift` 负责 HTTP，`CookieBroker.swift` 提供测试控制通道。`Registration.m` 单独封装非受支持的注册步骤。`checks.js` 和 `main.swift` 执行浏览器及生命周期场景，`run.py` 汇总远端证据并判定。
