# Web Files / Git / Network 验收

2026-11-01，Linux x86_64，mise Node 24 / pnpm 11 / Rust 1.97.1。浏览器 Block 按用户决定暂缓，入口保持禁用。

## 自动验证

- `pnpm check`：259 个测试文件通过，1 个跳过；1,516 个测试通过，2 个跳过。ESLint、TypeScript、生产构建及脚本检查通过。
- `pnpm test:web`：10 个测试文件、26 个测试通过。覆盖原 Git/Network 会话恢复映射、档案不匹配跳过、上传路径及一次性句柄/扫描失败。
- `pnpm build:web`、源码规模检查：通过，无 ratchet reminder。
- Rust workspace：core 268 通过 / 6 忽略，protocol 15 通过；server 全量 31 通过，随后新增 orphan 工具恢复测试单独通过（合计 32 项）。workspace clippy、桌面 cargo check/clippy、双方 rustfmt 通过。桌面 `cargo test --all-targets --all-features --locked` 89 项通过。
- `scripts/test-server-blocks.py`：原生和容器的本地嵌套上传、空目录、从根目录定位上传、70 文件连续上传、路径穿越拒绝、文件/目录下载及一次性票据；Git 初始化、状态、暂存、差异、提交、历史、分支及未知请求字段拒绝通过。
- `scripts/test-server-blocks-ssh.py`：真实 OpenSSH/SFTP 嵌套目录上传、空目录和 tar 下载；远端 Git 提交/历史；local/remote/SOCKS5 三类转发的实际 TCP 回声；活动规则删除拒绝；退出再登录后原 session ID 与三条监听保留、重新接入、停止及删除通过。
- 原生 `test-server-{local,retention,takeover,live}.py` 回归通过。容器 retained/takeover 回归通过；非 root、只读根文件系统下的 Blocks 验收通过。
- CI 已增加 Windows/macOS 原生 Blocks 验收。本机未执行 Windows/macOS 的系统级测试。

## 页面验证

使用 BetterWright 的独立 profile、随机端口与临时配置进行实测，未复用开发服务或用户凭证。

- 同一桌面工作台中查看本地仓库、切换工作区、刷新后读取同一仓库。
- 本地 Files 显示上传文件/文件夹菜单及实际上传后的目录。
- 真实 SSH 的 Network Block 在 API 退出、浏览器重新登录、刷新后仍显示运行状态；刷新后 TCP 回声仍可收发。
- Git 的原 SSH 会话在锁定凭证库后重新接入并读取仓库。
- 网络访问弹窗明确标注服务主机端点；Web 隐藏原生代理浏览器启动按钮。
- 找回尚未保存布局的 Files/Git/Network 会话时，补上工作区必需的终端节点，避免返回无效布局；单元测试验证重复恢复幂等。

截图见本目录 `blocks-files.png`、`blocks-git.png`、`blocks-network.png`、`blocks-network-access.png`。

## 部署边界

目录下载为 tar，不包含符号链接；浏览器文件夹选择器可能遗漏空目录，目录拖放支持空目录。原生本地 Git 依赖服务账户 PATH 和认证配置，容器已包含 Git/OpenSSH。监听端口位于服务主机/容器或 SSH 远端，Docker 需发布端口。服务退出会结束内存会话，持久化的网络规则不会自动启动。
