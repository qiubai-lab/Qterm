# Web runtime 验证记录

日期：2026-11-01。环境：Ubuntu 24.04 x86_64、mise Node 24 / pnpm 11.0.8 / Rust 1.97.1、Docker 29。

## 自动检查

| 检查 | 结果 |
| --- | --- |
| `pnpm check` | 252 个测试文件通过、1 个跳过；1495 个测试通过、2 个跳过。脚本测试 39 通过、1 跳过。ESLint、TypeScript、桌面前端构建通过 |
| `pnpm test:web` | 5 个测试文件、10 个测试通过，覆盖 HTTP、WebSocket、传输取消、主机密钥确认及连接编辑 |
| `pnpm build:web` | 通过；容器内重新执行并构建最终静态资源 |
| `pnpm test:demo` | 13 个测试文件、40 个测试通过 |
| `make fmt-check` | 两个 Rust workspace 均通过 |
| 共享 workspace 测试 | core 268 通过、6 个环境依赖测试忽略；protocol 7 通过；server 12 通过 |
| 桌面 Rust 测试 | 97 通过 |
| 两个 Rust workspace Clippy | `--all-targets --all-features -- -D warnings` 均通过 |
| 源码体积检查 | 通过，0 个 ratchet reminders |
| Linux 桌面打包 | `pnpm tauri build --debug --bundles deb` 通过，生成 `Qterm_0.6.0_amd64.deb` |
| Docker 多阶段构建 | `qterm-server:local` 构建通过，最终镜像约 89 MB，运行身份 `10001:10001` |
| Compose 配置 | `docker compose config --quiet` 通过 |

网络环境无法直连 Docker Hub，验证时通过镜像源取得官方基础镜像并校验摘要；Cargo 使用外置临时镜像配置，经 BuildKit secret 注入。仓库不固化该镜像源或开发机配置。

## 真实服务验收

`scripts/test-server-live.py` 在临时目录创建独立 OpenSSH、密钥、登录哈希和数据目录。分别以本地二进制和 Docker 内二进制完成：

- 未登录拒绝访问、HTTP / WebSocket Origin 校验。
- 恢复文件下载后确认才能初始化，服务端生成并加密存储 SSH 密钥。
- SSH 终端收发与窗口尺寸变更；首次主机密钥确认、持久化及密钥变化拒绝。
- 不确认消费终端输出时，超出缓冲上限明确返回 `outputOverflow`。
- SFTP 文本编辑、旧版本冲突、上传、下载及下载票据单次消费。
- 传输取消先于注册时仍拒绝启动，非所属会话拒绝访问。
- 退出清理 WebSocket、重启保留配置与 known-hosts，凭证库重启后保持锁定。

容器验收使用非 root、只读根文件系统、32 MiB tmpfs、移除全部 capabilities、no-new-privileges、256 PID / 1 GiB / 2 CPU 限制。该脚本的容器包装仅为连接宿主机回环 SSH 测试服务使用 host network；正式 Compose 使用独立网络和回环端口映射。

另外启动最终镜像，通过映射的 HTTP 端口完成浏览器登录、工作区显示、退出回到登录页；容器健康检查为 `healthy`。

## 浏览器证据

使用 BetterWright 检查 Chromium 1440 × 900 页面，并查看截图确认布局：

- [真实 SSH 终端与 SFTP 工作区](workbench.png)
- [连接管理](connections.png)
- [最终容器镜像提供的工作区](container-workbench.png)

浏览器验证包含凭证解锁、主机密钥确认、终端命令输出与远程文件列表。数据和凭证均为本次临时测试创建。

## 验证边界

本次未实测 Windows/macOS 打包、ARM64 镜像、HTTPS 反向代理部署或长期负载；Linux 桌面验证为 debug deb 构建。Vite 仍报告大于 500 kB 的 chunk 提示，构建成功。功能边界及部署方法见 [Web 运行时文档](../../../server-runtime.md)。

## 密码配置简化追加验证

同日新增 `QTERM_PASSWORD_FILE`，接受手动填写的明文密码或完整 Argon2id 哈希；旧 `QTERM_PASSWORD_HASH_FILE` 保留为严格的哈希入口。默认 Make / Compose 使用 `.server-secrets/password`，密码准备不再依赖编译。

- 服务端 15 项测试全部通过，包括新增文件格式、保留空格、源文件不改写及无效/重复配置测试。
- 服务端 Clippy（全部 targets/features、拒绝 warning）、workspace 格式检查及源码体积检查通过。
- 通过真实 `make dev-server` 分别使用明文文件、哈希文件和旧哈希入口启动：正确密码登录成功，错误密码被拒绝，源文件内容不变。
- 真实 SSH/SFTP 验收脚本通过，覆盖原有认证、主机密钥、文件传输与重启行为。
- 重新构建 `qterm-server:local`，使用实际 Compose 配置分别以明文和哈希 secret 登录成功。仅测试端口通过临时 override 改为回环随机端口；测试容器和测试卷已清理。

## 桌面界面复用与本地终端追加验证

同日移除独立 Web 工作台/连接与凭证弹窗，ServerApp 直接使用桌面的 WorkspaceShell 和管理组件。登录页单独保留；浏览器退出替代原生窗口控制。新增服务账户本地 PTY、本地文件、持久化设置和完整凭证工作流。

- 完整 `pnpm check`：1495 项前端测试通过、2 项跳过；脚本测试 39 通过、1 跳过；ESLint、TypeScript、桌面前端构建通过。Web 适配器及恢复文件确认测试 10 项通过。
- 共享 core 268 项、protocol 7 项、server 原有及新增工作流 19 项通过（包含恢复轮换专项）；桌面 Rust 97 项通过。
- 两个 Rust workspace 格式检查及 Clippy（全部 targets/features、拒绝 warning）通过；源码体积检查通过。最后的本地会话错误提示调整另以 26 项 WorkspaceProvider、51 项 WorkspaceShell 和 10 项 Web 测试回归通过。
- Demo 40 项测试、站点构建和桌面/演示资源隔离检查通过。
- Linux 原生 `scripts/test-server-local.py`：真实 PTY、初始目录、输入输出、resize、HTTP 文件修改在终端可见、Origin/未登录拒绝、退出关闭 Shell/前台进程、显式关闭通过。
- `scripts/test-server-live.py`：原有真实 SSH/SFTP、指纹、输出流控、文件传输、退出及持久化行为继续通过。
- 更新后的 Docker 镜像 `qterm-server:local` 构建通过；非 root、只读根文件系统、丢弃 capabilities 下的 `scripts/test-server-local.py --container` 通过。主目录位于持久化 `/data/home`。
- BetterWright 实测共享主题切换、连接配置保存、本地终端和文件编辑；编辑器保存的内容可在同一个服务端 Shell 中读取。

当前截图（已打开检查）：

- [共享工作台、本地终端与文件编辑器](shared-local-workbench.png)
- [共享连接管理](shared-connections.png)

上面的旧截图记录最初 SSH-only 阶段，不能代表当前工作台。Windows/macOS 已加入原生构建及 PTY 验收 CI，但本环境未实测这两个系统；不能将配置 CI 等同于已通过。
