# Qterm Web 运行时

Web 运行时以单用户、单进程部署，浏览器与桌面端直接共用 `WorkspaceShell`、工作区布局、终端、连接管理、凭证管理、文件管理、Git、网络管理及设置组件和 CSS；不再维护单独的 Web 工作台。Rust 服务直接使用桌面端相同的配置、主机密钥验证、凭证加密及 SSH/SFTP 核心，不启动桌面环境或 WebView。当前 Web 运行时的构建、CI 验收和镜像发布范围为 Linux AMD64；Windows/macOS 上建议使用 Docker Desktop 的 Linux 容器。

“本地终端”和“本地文件”始终指 **运行服务的账户与文件系统**：原生部署时是服务主机；Docker 部署时是容器，不是访问网页的电脑，也不会自动进入宿主机。

## 从 Desktop 连接

桌面标题栏右上角的「本机」菜单提供「连接服务器…」和「管理服务器…」。填写服务的完整 origin（例如 `https://qterm.example.com` 或 `http://192.168.1.10:8080`），不附加 `/api/v1`、子路径、用户名或 URL 参数。该地址必须与服务的 `QTERM_PUBLIC_ORIGIN` 一致。登录密码在连接后输入，不写入服务器列表；凭证库解锁和独占接管沿用 Web 的规则。

第一版一次进入一个运行环境。服务器名称、地址列表保存在客户端；工作区、SSH 配置、凭证库、文件与网络转发属于所连接的服务实例。断网不会自动切回本机。远程退出后后台任务继续运行，重新进入可恢复同一服务进程内的会话。

切换环境会重新加载工作台。本机运行时尚不支持会话重新接入，因此从本机切出时会明确确认关闭本机终端、SSH 会话和转发，并锁定本机凭证库；布局保留，返回后重新建立会话。本机未保存的文件编辑会阻止切换；远程未同步的编辑草稿也会阻止切换，需要先完成同步。远程切换时文件传输取消。

桌面继续使用本地打包的界面。Rust 层通过仅监听 `127.0.0.1`、随机路径凭证及精确客户端 Origin 保护的临时通道转发 HTTP/WebSocket，只开放固定服务器的 `/api/v1/` 接口。远程 Cookie 留在 Rust 内存；不转发重定向，也不向主窗口加载远程网页代码。HTTPS 使用正常证书校验，不提供跳过证书检查开关；HTTP 仍不加密传输。

文本复制、图片复制、终端剪贴板读取与下载保存使用本机原生能力，不依赖远程 HTTP 页面的浏览器剪贴板权限。剪贴板文件/截图和拖放文件先读取本机内容，再上传至当前服务目标；剪贴板中的目录请使用文件面板的上传文件夹功能。访问密码、主密码和客户端认证 Cookie 不持久化到服务器入口配置。

## 容器启动

基础 `compose.yaml` 从 GHCR 拉取镜像，默认使用 `ghcr.io/qiubai-lab/qterm:latest`。仅 `main` 的 push 在质量与容器验收通过后自动发布，也支持在 `main` 手动发布；开发分支只做质量与运行时检查。首次部署需等待镜像发布成功。仅发布 Linux AMD64 镜像。完整的准备、权限、源码构建、升级回滚与备份步骤见 [本地容器部署](container-deployment.md)。

```sh
cp .env.example .env
mkdir -p ./data
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
# 填入一行 12–1024 字节明文密码，或完整 Argon2id PHC 哈希。
chmod 600 .server-secrets/password
docker compose pull qterm
docker compose up -d --no-build --wait --wait-timeout 90
```

密码文件允许末尾换行，明文两端空格保留。服务启动时将明文转为内存中的随机盐哈希，原文件不变。容器基于 Ubuntu 24.04 LTS，默认以 root 运行，因此示例使用文件 `600`、父目录 `700`；切换服务 UID 后需调整密码文件读取权限。已有哈希文件可在 `.env` 设置 `QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password.hash`。修改密码文件后重新创建容器生效。

默认 Compose 使用 `network_mode: host`，监听宿主机 `0.0.0.0:8080`，并传入 `QTERM_ALLOW_INSECURE_HTTP=true`。`QTERM_BIND_HOST` / `QTERM_PORT` 控制服务实际监听地址，健康检查同步跟随；不再配置 Docker `ports`。默认浏览器入口为 `http://localhost:8080`，内网直连时将 `QTERM_PUBLIC_ORIGIN` 改为真实的 `http://服务器IP:端口`。访问地址必须与该 origin 完全一致。

两种完整部署方式见 [内网 IP 直连 HTTP](container-deployment.md#案例一内网-ip-直连-http) 和 [域名 HTTPS 与同机 Nginx](container-deployment.md#案例二域名-https-与同机-nginx)。HTTPS 场景将 Qterm 绑定到 `127.0.0.1`、关闭 HTTP origin 许可，由代理加载证书并转发 WebSocket Upgrade、Origin；设置 HTTPS origin 本身不会启用服务端 TLS。直接运行二进制或 `docker run` 时，HTTP 许可开关仍默认关闭，需要自行传入。源码构建使用 `docker compose -f compose.yaml -f compose.build.yaml up -d --build --wait`。

## 首次使用

1. 使用部署时设置的 Web 登录密码登录。
2. 工作区默认启动服务端本地 Shell，可以直接输入命令；无需配置 SSH 或初始化凭证库。
3. 如需保存远程凭证，打开凭证库，下载恢复密钥并离线保存，确认保存后创建主密码。Web 登录密码与凭证库主密码彼此独立。
4. 创建密码凭证、生成 Ed25519/ECDSA 密钥，或者从浏览器选择私钥文件导入。将公钥加入远端 `authorized_keys`；私钥留在服务端加密库中。
5. 添加 SSH 连接，可选择保存凭证及已配置的跳板链。连接首次出现时核对主机密钥；已记录密钥变化时拒绝连接。
6. 在工作区打开终端、本地文件或远程文件。本地文件支持浏览、文本编辑（含冲突检测）、创建、重命名、删除和复制。终端大小跟随面板；远程文件支持浏览、文本编辑、创建、重命名、删除和复制；两种文件窗口均支持上传、拖入文件/文件夹以及下载。

整个工作台一次只允许一个浏览器页面操作。密码验证通过后，如已有页面连接，会弹出“当前工作台正在使用中”，提供“取消”和“直接接管”。取消、无效接管票据或认证失败不会影响原页面。凭证库已初始化且非旧版时，普通登录、接管、刷新恢复和短暂断线重连都先进入“终端已锁定”，输入正确主密码后才能使用工作台。新访问身份与锁标记原子生效，解锁前服务端拒绝业务 HTTP 与数据 WebSocket；未初始化凭证库时不增加此步骤。

接管、退出登录与页面在线连接断开共用服务端锁定清理流程，锁定凭证库、清理临时授权并取消传输；已锁定时不重复发布锁定通知或追加连带锁定日志。旧连接关闭回调按访问所有者和连接标识校验，不影响新连接解锁后的状态。正常关闭页面会立即触发清理，突然断网需等待服务端心跳检测（约 30 秒）。旧页面被接管后立即停止连接和自动重连，显示“连接已被接管”弹窗；工作台暂不可操作，点击“确认”后才返回登录页，Esc 或点击遮罩不会关闭提示。

这些操作仅撤销浏览器访问，本地 PTY、SSH/SFTP 会话和后台任务继续保留。重新连接并解锁后恢复工作区、标签、分屏、当前目录、终端画面及已同步的文件编辑草稿，接回原进程，不重发旧输入、不重新运行命令。

终端状态由 Rust 会话注册表和服务端 headless xterm 维护；浏览器离线期间仍持续读取 PTY 输出并响应终端查询，因此 Codex 等全屏 CLI 能继续运行并恢复备用屏幕、颜色和光标。普通屏幕历史采用有界滚动缓冲，并非无限日志。浏览器尚未提交到服务端的最后一次操作无法保证恢复；同步失败或编辑版本冲突会在界面提示。

画面组件退出、通信失败或请求超时后，服务端会尝试重建组件，使用内存中的画面检查点和后续解析操作恢复各终端；不会重建 PTY、重发用户输入或重复已回答的终端查询。每 256 KiB 解析操作或 128 次操作更新检查点；故障期间每个终端最多暂存 8 MiB / 4,096 次操作。超过缓冲上限或单个画面无法恢复时会明确报错，不将不完整画面当作成功恢复，也不阻断其他终端。持续故障的重试间隔至少 1 秒，单次通信与一次完整重建各限时 10 秒。

后端日志以 `Qterm screen worker:` 开头，记录启动失败、通信关闭、超时、协议错误或操作失败，以及可识别的 Node 内存不足/组件缺失/语法错误；不输出终端内容、请求正文或原始 stderr。补齐缺失的 Node 或恢复组件文件后，可重连触发恢复，无需为画面组件重启整个后端；修改后端进程的环境变量仍需重新启动。已经运行旧版本后端的故障实例仍需安排后端更新，进程内画面恢复数据无法从新二进制补回。

同一浏览器的不同标签页也分别识别；共享 Cookie 或复制标签页不能绕过接管确认。不提供只读模式。原页面刷新凭页面恢复凭证接回，短暂断线自动重连；断开后保留约 30 秒占用宽限，避免刷新期间被新登录静默替换，期间其他页面仍可明确接管。接管确认 2 分钟有效，若已被另一页面先行接管，需重新登录确认。工作区和文件草稿使用版本号防止旧页面覆盖新内容。明确点击停止终端、关闭终端/工作区会结束相应任务；退出登录不会结束任务。

## 文件、Git 与网络 Block

- **文件**：上传按钮可选择文件或文件夹，也可直接拖入文件/文件夹；路径相对于当前目录，保留子目录结构。浏览器的文件夹选择器只提供文件，可能遗漏空目录；支持目录拖放的浏览器可保留空目录。右键下载文件夹会生成 `.tar`，内容位于 `files/` 下，跳过符号链接和设备文件。单次选择最多 10,000 项、128 MiB；目录归档上限 128 MiB（含归档开销）、10,000 项、64 层。上传取消或失败时已完成的文件会保留，不回滚整批目录。上传开始即显示总量，进度综合浏览器发送和服务端写入目标两个阶段（各占一半），只有目标确认完成才达到 100%；文件夹进度按文件大小累计。下载交给浏览器后由浏览器管理。
- **Git**：复用桌面仓库面板，支持服务主机本地仓库和 SSH 远端仓库，包括状态/历史、差异、暂存/撤销、提交、分支、合并/冲突、子模块与 fetch/pull/push。原生部署须在服务账户 PATH 中安装 Git；Docker 镜像已包含 Git 和 OpenSSH 客户端。远端仓库使用远端 Git 环境。本地远程仓库认证使用服务账户的 Git/SSH 配置，不会自动将 Qterm 凭证库里的 SSH 凭证注入系统 Git。
- **网络**：网络管理保存规则，Network Block 为所选 SSH 连接启动或停止本地转发、远程转发和 SOCKS5。这里“本地”是 **Qterm 服务主机或容器**；访问网页的电脑不会自动获得监听端口或代理设置。原生浏览器代理启动功能不提供 Web 入口，客户端需手动配置代理。

Network Block 的 SSH 会话和正在运行的规则保留在服务端内存。刷新、关闭标签、退出登录或被接管后转发继续运行，重登接回原会话并恢复运行标记。运行中的规则需先停止才能修改或删除；关闭对应 Block/工作区、断开其 SSH 会话或停止服务会结束转发。规则配置写入磁盘，但服务重启后不会自动启动规则。远程 Git 会话同样保留并重新接入，本地 Git 从已保存的仓库路径重新读取状态。

默认 host 网络下，容器转发规则直接监听宿主机端口，无需另加端口映射。例如绑定 `127.0.0.1:15432` 仅供本机访问，绑定 `0.0.0.0:15432` 会监听所有宿主机 IPv4 接口；需避免与宿主机进程冲突。容器内 `localhost` 也指向宿主机网络。若自行改为 bridge 网络，则需另行发布转发端口。HTTP 反向代理只代理 Web 工作台，不会自动代理 TCP 转发或 SOCKS5。远程转发的实际监听范围仍由远端 SSH GatewayPorts 和防火墙决定。

终端支持粘贴浏览器提供的文件和截图：Windows/Linux 用 Ctrl+V、macOS 用 Cmd+V。Ctrl+Shift+V 在部分浏览器中是纯文本粘贴，不会携带图片。文件会先上传到当前终端所在的服务主机或 SSH 远端，再将已正确引用的路径插入输入位置，不自动回车执行。上传期间可取消，后续键盘输入按顺序等待；文本仍保留多行粘贴确认。一次最多 128 个文件、128 MiB。服务端本地文件存于私有运行缓存，重启服务时清理；SSH 使用原有远端临时文件流程。需要长期保留的文件应复制到自己的工作目录。

文件粘贴依赖浏览器在真实 paste 事件中提供文件内容；网页不能仅凭剪贴板里的客户端路径读取本机文件。若系统/浏览器只提供文本路径，请改用文件面板选择或拖入文件。右键“粘贴”通过浏览器剪贴板 API 读取文字/图片，系统文件列表优先使用键盘粘贴。

浏览器 Block 按当前需求暂不实现，入口继续禁用。

## 访问记录

Web 右上角退出登录左侧的「访问记录」打开日志列表，可按时间、事件类型和结果筛选、刷新及分页（每页 50 条，底栏右侧切换上一页/下一页）。点击记录打开独立详情弹窗；关闭详情保留原列表的筛选和滚动位置。打开与翻页时在同一个弹窗内显示骨架行，加载后替换当前页；翻页固定本次查询的时间范围，刷新或调整筛选回到第一页。界面随深色、浅色、Cyberpunk 主题切换。当前会话必须已认证且工作台未锁定；锁定、退出或被接管后清除界面中的记录。

服务端记录登录成功/失败、等待接管确认、恢复访问、接管、退出、页面连接/断开/权限撤销、凭证库初始化/解锁/锁定/主密码修改/恢复重置/清除、工作台锁定/解锁以及被拒绝的 API 访问。自动锁定只在实际锁定发生时记录；登录、恢复、接管、连接断开、退出或工作台锁定引起的连带凭证库锁定包含在对应操作中，不重复生成锁定记录。普通数据请求、心跳与终端内容不记录。结果描述操作是否成功，例如「登录认证成功、等待确认接管」尚不代表已获工作台访问权限。

日志保存时间、事件/结果/标准原因、来源 IP、最长 256 字符的 User-Agent，以及独立生成的会话关联号。不记录访问密码、主密码、Cookie、访问令牌、接管/下载票据、请求正文或 URL 参数。来源信息来自网络连接和客户端声明，不代表实名用户。默认忽略转发头；只有 `QTERM_TRUSTED_PROXIES` 中列明的直接代理 IP 才允许读取 `X-Forwarded-For`，从右向左跳过可信代理，并在第一个不可信地址处停止。例如 `QTERM_TRUSTED_PROXIES=127.0.0.1,::1`；仅支持明确 IP，不支持 CIDR，最多解析 16 跳。代理必须规范追加或覆盖转发头。

日志在数据目录的 `logs/access/` 中以 JSONL 持久化，重启可继续查询。单文件约 5 MiB 或按天轮转，整体最多 50 MiB，最长保留 30 天；达到上限先删除旧文件，因此高频访问时可能不足 30 天。Unix 目录权限为 0700，文件为 0600。日志使用有界后台写入队列，写入后同步文件；异常断电或进程被强制终止可能丢失尚未写出的队列事件。队列满、磁盘故障或损坏记录不阻断认证，列表显示记录异常及本次服务进程检测的缺失数量；写入失败也会输出服务端错误。异常状态保留至进程重启，已损坏记录再次读取时仍会提示。日志不提供界面清除功能，不属于防篡改审计存储；服务账户本身可访问该目录。

开发验收：构建 `qterm-server` 后运行 `python3 scripts/test-server-access-log.py`（需要 Python `websockets`），在临时目录中验证真实 HTTP/WebSocket 登录、接管与撤销、来源 IP、筛选、敏感信息排除和重启持久化。

## 数据与边界

部署目录的 `./data` 绑定到容器 `/data`，其中保留 `data/connections.json`、`data/network-forwards.json`、`data/secrets.vault`、`device/known-hosts.json`、`device/workspaces.json`，主题、安全及终端设置也写入该目录，临时文件在 `cache/`。容器默认以 root 运行，Shell 使用 `/data/home` 作为持久化主目录；内置 UID/GID 10001 的 `qterm` 账户使用 `/data/users/qterm`。容器启动时会为已有数据目录补建这些 HOME。镜像不预装开发工具；按需安装、账户切换与备份细节见 [本地容器部署](container-deployment.md#精简运行环境)。同一数据目录只允许一个服务进程。停止容器后备份宿主机整个 `./data`，恢复到空目录；同时离线保存恢复密钥及登录密码配置文件。升级前先备份，不能让桌面与服务器同时写入同一目录。

登录 Cookie 为 HttpOnly、SameSite=Strict；HTTPS 下使用 Secure / `__Host-` Cookie。登录有效期 8 小时；主密码解锁仍遵循共享凭证库自动锁定规则。登录限流、Origin 检查、页面访问凭证与 WebSocket 身份/会话所有权检查均在服务端执行。接管同时阻止旧页面之后的终端输入、尺寸调整、文件/配置修改和退出请求；已被服务端接受的操作可能完成，不做事务回滚。下载使用短期、一次性且绑定当前访问代次的票据，接管时清除。

初始版本限制：

- 面向受信任的单用户管理场景，不支持多用户、权限角色或跨实例迁移。保留状态属于同一服务进程，服务重启、容器重建、主机重启后无法恢复原进程或内存草稿；持久化配置及布局仍保留。远端 SSH 自身断线也不能恢复原 SSH 进程。
- 每实例最多 32 个保留会话（含已退出、等待明确关闭的终端）、32 个终端 WebSocket、8 个页面在线状态 WebSocket、4 个文件传输/待领取下载，单文件 128 MiB，传输最长 10 分钟。下载票据 60 秒有效且只能领取一次；浏览器接管下载后由浏览器管理进度。
- 每个终端限制为 500 列 × 300 行；滚动历史最多 2,000 行且受 65,536 历史单元格预算约束。单个视图最多 256 KiB 未确认输出；慢客户端落后时重新接入最新屏幕，后台任务继续运行。文件草稿单份小于 4 MiB、总计最多 16 MiB / 64 份，仅存于服务内存。
- 系统 SSH Agent、浏览器 Block、SSH 配置文件导入及配置目录迁移尚未接入 Web，相关入口禁用或标明由部署管理。凭证库支持初始化、锁定/解锁、密码轮换、恢复文件重置和清除。
- 浏览器没有原生窗口最小化/最大化/关闭按钮；相同标题栏位置提供访问记录和退出登录。字体栅格化及浏览器保留快捷键受浏览器/操作系统影响。
- 登录用户可通过本地终端及文件接口操作服务账户有权访问的文件；部署账户应按实际用途配置权限。容器默认只暴露自身文件系统，不挂载宿主机根目录或 Docker socket。

## 在 Linux 上原生提供 Web 服务

服务端需要 Rust 二进制、Node.js 24（mise 提供）和打包后的屏幕组件，不依赖 Tauri、GTK 或 WebView。Docker 镜像已包含 Node 和屏幕组件。从源码构建：

```sh
mise exec -- pnpm build:web
mise exec -- cargo build --manifest-path crates/Cargo.toml --release --locked -p qterm-server
```

在 Linux 项目根目录运行：

```sh
QTERM_PUBLIC_ORIGIN=http://localhost:8080 \
QTERM_PASSWORD_FILE="$PWD/.server-secrets/password" \
QTERM_ASSETS_DIR="$PWD/dist-web" \
QTERM_SCREEN_WORKER="$PWD/dist-server/screen.mjs" \
mise exec -- ./crates/target/release/qterm-server
```

打开 `http://localhost:8080`。可以将二进制、`dist-web/` 和 `dist-server/` 一起复制到对应架构的 Linux 主机，并安装 Node.js 24；用 `QTERM_SCREEN_WORKER` 指定 `screen.mjs`，`QTERM_NODE` 可指定 Node 可执行文件绝对路径（默认查找 `node`）。用 `QTERM_ASSETS_DIR` 指定静态文件目录、`QTERM_DATA_DIR` 指定可写的数据目录。未指定数据目录时使用系统应用数据目录下的 `QtermServer`。

CI 验证 Linux AMD64 原生服务及容器。源码中的 Windows/macOS 兼容实现仍保留，但不再作为 Web 服务的构建和发布支持范围；桌面应用的跨平台构建由独立流水线负责。

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
python3 scripts/test-server-fixtures.py
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

## 终端锁与数据暂停

凭证库已初始化且非旧版时，每次建立页面连接都要求重新验证主密码；退出或连接断开也会锁定。选择“锁定终端和凭证”同样进入这一锁定状态，刷新不能绕过。锁定期间停止 Git 订阅和凭证状态推送、文件/配置读取、数据 WebSocket 与自动重连；首屏先确认锁状态，不提前加载工作区。服务端也拒绝这些业务请求，并撤销已打开的数据流。仅保留登录存活、访问撤销通知、锁状态、解锁及退出等控制请求。

后台终端命令、SSH/SFTP 会话和已运行的网络转发继续；解锁后重新附着原会话并读取最新状态，不重发输入。当前页面的未保存编辑草稿保留，解锁后继续同步。上传和下载会中断，未领取下载票据失效；现阶段不提供自动断点续传，解锁后需检查目标状态再重试。已经接受的普通写操作可能完成，不做回滚；锁定前已经进入浏览器的数据无法撤回。“仅锁定凭证库”不暂停这些工作台连接。


### 凭证与 Git 实时状态

凭证基础状态经现有 `/api/v1/access` 控制连接推送，仅含 initialized、unlocked、legacy、revision 和 reason；不包含凭证列表或密钥。首次连接的状态是基线，不触发锁定通知；重连校准最新状态。凭证事件使用独立代次，“仅锁凭证库”不会撤销终端连接。HTTP `/vault` 保留首次回退读取和显式操作后的校准，不再每两秒轮询。终端锁定期间保留控制连接，但暂停其中的凭证状态推送。

可见 Git 面板共用 `/api/v1/git/events` 数据连接，以仓库为单位订阅。WS 仅发送 `{type: "repositoryChanged", id, revision}`；面板按需通过 `POST /api/v1/git/observations/snapshot` 读取服务端已计算的快照。相同订阅共享计算和浏览器读取；diff、文件详情、手动刷新与操作仍使用 HTTP。仓库变化在操作进行中会合并，操作结束后补读。

本地仓库监听工作区、Git 元数据和 linked worktree 的共享 refs，文件事件合并窗口为 350ms；每 60 秒进行一次低频校准，监听不可用时回退到 15 秒采样。远程仓库仅在存在订阅时每 15 秒共享采样；Qterm 内 Git 操作会立即发布返回的快照。快照计算失败会通知界面，并每 5 秒重试。最后一个订阅退出后释放后台采样和文件监听；页面隐藏、面板不可见、终端锁定会退订，恢复后重新同步。锁定同时由服务端撤销数据 WS 和快照读取权限。

验收：构建 Web 资源和 qterm-server 后运行 `python3 scripts/test-server-observation.py`，使用隔离临时仓库与测试凭证验证事件、变更、退订、锁定和重连。安装 OpenSSH 的环境可再运行 `python3 scripts/test-server-observation-ssh.py`，验证远端授权、共享采样和应用内操作通知。

画面故障验收：`python3 scripts/test-server-screen-recovery.py` 在 Linux 隔离服务中主动终止画面子进程，验证多终端恢复、原 PTY/PID/环境保留及新建终端；`cargo test --manifest-path crates/Cargo.toml -p qterm-server screen_worker` 覆盖检查点、半截 ANSI/UTF-8、查询去重、超时与错误隔离。
