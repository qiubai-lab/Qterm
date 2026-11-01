# Web 工作台独占接管验收 — 2026-11-01

## 行为与边界

- 占用属于整个工作台的浏览器页面；进程仍由 retained session 注册表持有。
- 登录校验密码只生成限时确认票据，取消不撤销旧登录、不锁定凭证库。
- 明确确认后原子更换所有者，撤销旧页面的 HTTP / WebSocket 访问并停止其自动重连；保持终端、工作区和已同步文件草稿。现有凭证库锁定和传输取消规则继续适用。
- Cookie 与页面恢复凭证分开；每次文档加载生成独立身份。复制标签页必须确认接管，原页面刷新可恢复。断开宽限约 30 秒，确认票据有效期 120 秒；并发确认只有一个成功。
- 不提供只读模式、在线列表或悬浮组件。接管不回滚已被接受的操作，未同步的最后一次编辑不能保证保留；服务重启仍会结束内存运行状态。

## 自动验收

- `pnpm check`：源码大小、ESLint、前端测试、TypeScript 和桌面前端生产构建。
- `pnpm test:web`、`pnpm build:web`：Web 身份生命周期、接管对话框、旧请求响应隔离、终端传输与浏览器生产构建。
- Rust workspace 格式、单元测试及 Clippy：登录不驱逐、共享 Cookie 隔离、刷新宽限、票据过期/并发、HTTP 伪装 Upgrade 不能绕过页面凭证。
- `scripts/test-server-takeover.py`：独立临时服务，覆盖占用检测、取消、重复标签、确认接管、旧 HTTP/WS 拒绝、竞争确认拒绝、相同 PTY ID/环境变量/布局/草稿与刷新恢复。
- `test-server-local.py`、`test-server-retention.py`、`test-server-live.py`：Linux 本地 PTY、文件、SSH/SFTP、输出流控和保留状态回归。
- Docker 构建及 `test-server-{local,retention,takeover}.py --container`：相同运行时验收。
- Windows/macOS 原生 CI 已增加 takeover 脚本；本次本地环境没有执行这两个系统。

## 实际浏览器

使用 BetterWright 两个独立 profile，连接仅回环可访问的临时服务和随机测试密码。先在 A 打开本地终端设置环境变量，刷新后保留；B 登录出现确认，取消后 A 继续可用；B 再登录并明确接管，原终端内容及环境变量仍在，A 保持原工作台挂载并显示“连接已被接管”阻断弹窗；Esc 不关闭提示，点击“确认”才返回登录页。确认后 B 仍能输入命令，说明确认没有退出新连接。截图已逐张检查。

- [接管确认](takeover-confirmation.png)
- [接管后相同终端与环境变量](takeover-retained-terminal.png)
- [旧页面等待确认的弹窗](takeover-replaced-notice.png)
- [旧页面确认后登录页](takeover-disconnected.png)

## 被接管后确认退出

`useServerAccess` 在收到撤销时立即停止连接、清理页面凭证并进入 `replaced` 状态；后续认证失败或旧回调不能跳过确认。`ServerApp` 保持同一工作台挂载并设置 `inert`，共享 DialogFrame 提供焦点约束和不可自动关闭的确认弹窗。确认只改变本地页面状态，不调用服务端退出接口。新增相邻测试覆盖工作台不重新挂载、背景不可交互、确认前不出现登录表单、Esc/遮罩不退出和普通认证失效仍直接回登录。
