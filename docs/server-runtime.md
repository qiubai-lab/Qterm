# Qterm Web 运行时

Web 运行时以单用户、单进程部署，浏览器与桌面端直接共用 `WorkspaceShell`、工作区布局、终端、连接管理、凭证管理、文件管理及设置组件和 CSS；不再维护单独的 Web 工作台。Rust 服务直接使用桌面端相同的配置、主机密钥验证、凭证加密及 SSH/SFTP 核心，不启动桌面环境或 WebView。服务可原生运行在 Windows、Linux、macOS，也可运行在 Linux 容器中。

“本地终端”和“本地文件”始终指 **运行服务的账户与文件系统**：原生部署时是服务主机；Docker 部署时是容器，不是访问网页的电脑，也不会自动进入宿主机。

## 容器启动

```sh
docker compose build
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
# 填入一行明文密码，或者自行生成的完整 Argon2id 哈希。
chmod 644 .server-secrets/password
docker compose up -d
```

无需先运行密码生成命令。文件内容支持以下两种格式：

- **明文密码**：单行，12–1024 字节。启动时转换为随机盐 Argon2id 哈希，只在内存中保留哈希，原文件保持原样。
- **自行生成的哈希**：粘贴完整 `$argon2id$...` PHC 字符串（包含参数、盐和输出），不能只填 SHA256/MD5 摘要。

允许编辑器添加末尾换行，明文密码两端的空格会保留。修改文件后重启服务生效；配置内容不会写入日志。使用明文时源文件包含密码，应限制访问。容器以 UID/GID 10001 读取该文件，因此示例使用文件 `644`、父目录 `700`；本地开发可用文件 `600`。

已有 `.server-secrets/password.hash` 时，可以直接复用：`QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password.hash docker compose up -d`。

默认仅绑定 `127.0.0.1:8080`，打开 `http://localhost:8080`。访问地址必须与 `QTERM_PUBLIC_ORIGIN` 完全一致，不能用 `127.0.0.1` 代替 `localhost`。

远程访问时，在同一服务器上配置 HTTPS 反向代理，设置 `QTERM_PUBLIC_ORIGIN=https://qterm.example.com`。代理必须转发 WebSocket Upgrade、保留 Origin，允许最长 10 分钟文件请求，上传请求体上限至少 129 MiB。服务只信任显式配置的公开 origin，不根据转发头推断访问地址。HTTP 只允许 localhost/loopback 开发地址。

Nginx 示例（TLS 证书配置自行补充）：

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 650s;
    proxy_send_timeout 650s;
    client_max_body_size 129m;
    proxy_request_buffering off;
    proxy_buffering off;
}
```

## 首次使用

1. 使用部署时设置的 Web 登录密码登录。
2. 工作区默认启动服务端本地 Shell，可以直接输入命令；无需配置 SSH 或初始化凭证库。
3. 如需保存远程凭证，打开凭证库，下载恢复密钥并离线保存，确认保存后创建主密码。Web 登录密码与凭证库主密码彼此独立。
4. 创建密码凭证、生成 Ed25519/ECDSA 密钥，或者从浏览器选择私钥文件导入。将公钥加入远端 `authorized_keys`；私钥留在服务端加密库中。
5. 添加 SSH 连接，可选择保存凭证及已配置的跳板链。连接首次出现时核对主机密钥；已记录密钥变化时拒绝连接。
6. 在工作区打开终端、本地文件或远程文件。本地文件支持浏览、文本编辑（含冲突检测）、创建、重命名、删除和复制。终端大小跟随面板；远程文件支持浏览、文本编辑、创建、重命名、删除、复制和单文件上传/下载。

整个工作台一次只允许一个浏览器页面操作。密码验证通过后，如已有页面连接，会弹出“当前工作台正在使用中”，提供“取消”和“直接接管”。取消不会影响原页面；只有点击接管才会撤销原页面访问、锁定凭证库并取消传输。旧页面立即停止连接和自动重连，保留当前工作台画面并显示“连接已被接管”弹窗；工作台暂不可操作，点击“确认”后才返回登录页。Esc 或点击遮罩不会关闭提示。退出登录同样只撤销浏览器访问并取消传输，本地 PTY、SSH/SFTP 会话继续保留。刷新、关闭浏览器标签或短暂断网仅断开视图。重新打开页面后恢复工作区、标签、分屏、当前目录、终端画面及已同步的文件编辑草稿，接回原进程，不重发旧输入、不重新运行命令。

终端状态由 Rust 会话注册表和服务端 headless xterm 维护；浏览器离线期间仍持续读取 PTY 输出并响应终端查询，因此 Codex 等全屏 CLI 能继续运行并恢复备用屏幕、颜色和光标。普通屏幕历史采用有界滚动缓冲，并非无限日志。浏览器尚未提交到服务端的最后一次操作无法保证恢复；同步失败或编辑版本冲突会在界面提示。

同一浏览器的不同标签页也分别识别；共享 Cookie 或复制标签页不能绕过接管确认。不提供只读模式。原页面刷新凭页面恢复凭证接回，短暂断线自动重连；断开后保留约 30 秒占用宽限，避免刷新期间被新登录静默替换，期间其他页面仍可明确接管。接管确认 2 分钟有效，若已被另一页面先行接管，需重新登录确认。工作区和文件草稿使用版本号防止旧页面覆盖新内容。明确点击停止终端、关闭终端/工作区会结束相应任务；退出登录不会结束任务。

## 数据与边界

`qterm-data` 卷保留 `data/connections.json`、`data/secrets.vault`、`device/known-hosts.json`、`device/workspaces.json`，主题、安全及终端设置也写入数据卷，临时文件在 `cache/`。容器 Shell 使用 `/data/home` 作为持久化主目录（服务账户 UID/GID 10001）。容器启动时会为旧数据卷补建该目录。同一数据目录只允许一个服务进程。停止容器后备份整个卷，恢复到空卷；同时离线保存恢复密钥及登录密码配置文件。升级前先备份，不能让桌面与服务器同时写入同一目录。

登录 Cookie 为 HttpOnly、SameSite=Strict；HTTPS 下使用 Secure / `__Host-` Cookie。登录有效期 8 小时；主密码解锁仍遵循共享凭证库自动锁定规则。登录限流、Origin 检查、页面访问凭证与 WebSocket 身份/会话所有权检查均在服务端执行。接管同时阻止旧页面之后的终端输入、尺寸调整、文件/配置修改和退出请求；已被服务端接受的操作可能完成，不做事务回滚。下载使用短期、一次性且绑定当前访问代次的票据，接管时清除。

初始版本限制：

- 面向受信任的单用户管理场景，不支持多用户、权限角色或跨实例迁移。保留状态属于同一服务进程，服务重启、容器重建、主机重启后无法恢复原进程或内存草稿；持久化配置及布局仍保留。远端 SSH 自身断线也不能恢复原 SSH 进程。
- 每实例最多 32 个保留会话（含已退出、等待明确关闭的终端）、32 个终端 WebSocket、8 个页面在线状态 WebSocket、4 个文件传输/待领取下载，单文件 128 MiB，传输最长 10 分钟。下载票据 60 秒有效且只能领取一次；浏览器接管下载后由浏览器管理进度。
- 每个终端限制为 500 列 × 300 行；滚动历史最多 2,000 行且受 65,536 历史单元格预算约束。单个视图最多 256 KiB 未确认输出；慢客户端落后时重新接入最新屏幕，后台任务继续运行。文件草稿单份小于 4 MiB、总计最多 16 MiB / 64 份，仅存于服务内存。
- 系统 SSH Agent、原生嵌入浏览器、端口转发、Git 工具、SSH 配置文件导入、配置目录迁移及目录传输尚未接入 Web，相关入口禁用或标明由部署管理。凭证库支持初始化、锁定/解锁、密码轮换、恢复文件重置和清除。
- 浏览器没有原生窗口最小化/最大化/关闭按钮；相同标题栏位置提供退出登录。字体栅格化及浏览器保留快捷键受浏览器/操作系统影响。
- 登录用户可通过本地终端及文件接口操作服务账户有权访问的文件；部署账户应按实际用途配置权限。容器默认只暴露自身文件系统，不挂载宿主机根目录或 Docker socket。

## 在 Windows / Linux / macOS 上原生提供 Web 服务

服务端需要 Rust 二进制、Node.js 24（mise 提供）和打包后的屏幕组件，不依赖 Tauri、GTK 或 WebView。Docker 镜像已包含 Node 和屏幕组件。从源码构建：

```sh
mise exec -- pnpm build:web
mise exec -- cargo build --manifest-path crates/Cargo.toml --release --locked -p qterm-server
```

Linux/macOS（在项目根目录运行）：

```sh
QTERM_PUBLIC_ORIGIN=http://localhost:8080 \
QTERM_PASSWORD_FILE="$PWD/.server-secrets/password" \
QTERM_ASSETS_DIR="$PWD/dist-web" \
QTERM_SCREEN_WORKER="$PWD/dist-server/screen.mjs" \
mise exec -- ./crates/target/release/qterm-server
```

Windows PowerShell：

```powershell
$env:QTERM_PUBLIC_ORIGIN = "http://localhost:8080"
$env:QTERM_PASSWORD_FILE = "$PWD\.server-secrets\password"
$env:QTERM_ASSETS_DIR = "$PWD\dist-web"
$env:QTERM_SCREEN_WORKER = "$PWD\dist-server\screen.mjs"
mise exec -- .\crates\target\release\qterm-server.exe
```

打开 `http://localhost:8080`。可以将二进制、`dist-web/` 和 `dist-server/` 一起复制部署，并安装 Node.js 24；用 `QTERM_SCREEN_WORKER` 指定 `screen.mjs`，`QTERM_NODE` 可指定 Node 可执行文件绝对路径（默认查找 `node`）。用 `QTERM_ASSETS_DIR` 指定静态文件目录、`QTERM_DATA_DIR` 指定可写的数据目录。未指定数据目录时使用系统应用数据目录下的 `QtermServer`。Windows 使用 ConPTY 和默认 `cmd.exe`，可以在终端中启动 PowerShell；Linux/macOS 使用账户默认 Shell。Make 开发入口要求 POSIX shell，Windows 可直接使用上述命令。

当前开发环境已实测 Linux 与 Linux 容器；Windows/macOS 已配置原生 CI 构建与 PTY 验收矩阵，实际通过状态以 CI 为准。

## 本地开发与检查

先安装依赖：

```sh
mise install
mise exec -- make install
```

首次使用时，直接编辑密码文件，填入一行明文密码或完整 Argon2id 哈希：

```sh
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
chmod 600 .server-secrets/password
```

准备密码文件无需编译 Rust。`make server-password` 保留为可选工具，仍可从 stdin 生成哈希；它需要先编译服务，进度显示在 stderr。

在项目根目录打开两个终端：

```sh
# 终端一：Rust 后端，默认监听 127.0.0.1:8080
mise exec -- make dev-server
```

```sh
# 终端二：浏览器前端，支持热更新
mise exec -- make dev-server-web
```

打开 **http://localhost:1423**，使用刚才设置的密码登录。开发数据保存在 `.server-data/`，该目录已被 Git 忽略，重启保留配置与布局；运行中的进程、画面和未保存草稿只保留到后端停止。分别按 Ctrl+C 停止两个进程。首次启动后端需要编译 Rust；`make dev-server` 会先构建屏幕组件。

`make dev-web` 仍是原来的桌面 UI 预览入口。新运行时的开发代理将 `/api`（含 WebSocket）转发到 `127.0.0.1:8080`，无需预先构建静态资源。

后端支持通过环境变量或 Make 参数覆盖配置，例如 `mise exec -- make dev-server QTERM_DATA_DIR=/absolute/path/qterm-dev-data`。

- `QTERM_PASSWORD_FILE`：接受明文或 Argon2id 哈希的文件路径，Make 默认 `.server-secrets/password`。
- `QTERM_PASSWORD_HASH_FILE`：兼容原来的哈希专用配置，拒绝明文。例如 `mise exec -- make dev-server QTERM_PASSWORD_HASH_FILE="$PWD/.server-secrets/password.hash"`。
- 两个变量只能设置一个非空路径；同时设置时启动报错。

如果更改前端端口，需同步修改 `QTERM_PUBLIC_ORIGIN`；如果更改后端端口，需同步修改 `vite.web.config.ts` 的代理目标。首次启动后端仍需下载依赖并编译 Rust；如果停在 `Downloading crates` 或 `Updating crates.io index`，应检查 Cargo 源网络连通性。

```sh
mise exec -- pnpm check
mise exec -- pnpm test:web
mise exec -- pnpm build:web
mise exec -- cargo fmt --manifest-path crates/Cargo.toml --all --check
mise exec -- cargo test --manifest-path crates/Cargo.toml --workspace --all-targets --all-features
mise exec -- cargo clippy --manifest-path crates/Cargo.toml --workspace --all-targets --all-features -- -D warnings
```

Linux 实机验收（需要 `openssh-server`、`python3-websockets`，且 `/run/sshd` 存在）：

```sh
mise exec -- cargo build --manifest-path crates/Cargo.toml --locked -p qterm-server
python3 scripts/test-server-live.py
python3 scripts/test-server-local.py
python3 scripts/test-server-retention.py
python3 scripts/test-server-takeover.py
# 构建容器后测试容器本地 PTY：
python3 scripts/test-server-local.py --container
python3 scripts/test-server-retention.py --container
python3 scripts/test-server-takeover.py --container
```

脚本只启动回环监听的临时 SSH/HTTP 服务，覆盖认证、恢复文件确认、主机密钥、终端尺寸、文件编辑冲突、单文件传输、取消、退出和重启持久化，以及接管确认、旧页面权限撤销和原进程/布局/草稿保留。

模块入口见 [Directory Map](qb-spec/DIRECTORY_MAP.md)，服务契约见 [Web runtime spec](qb-spec/specs/QB-20261101-web-runtime.md)。
