# 本地容器部署

Qterm Web 运行时是单用户服务，镜像基于 Ubuntu 24.04 LTS，默认以 root 运行。容器内包含 Web 静态资源、Rust 服务、Node.js 屏幕组件、Git 和 OpenSSH 客户端，无需在宿主机安装 Node/Rust。GHCR 仅发布 **`linux/amd64`** 镜像，Compose 显式指定该平台。Apple Silicon/ARM64 主机需要 Docker 的 AMD64 模拟执行支持，可能较慢；当前不提供原生 ARM64 镜像。

本文以 AMD64 Linux 宿主机上的 Docker Engine 和带 `up --wait` 的 Docker Compose v2 或更新版本为部署目标。默认 `network_mode: host`，容器与宿主机共享网络，不使用 `ports` 映射。Docker Desktop 需要 4.34 或更新版本，并在设置中显式开启 host networking；详见 [Docker host 网络说明](https://docs.docker.com/engine/network/drivers/host/)。

## 1. 准备部署文件

可以从当前分支复制 `compose.yaml` 和 `.env.example` 到一个固定目录，也可以直接在仓库根目录部署。拉取镜像不需要完整源码。数据使用 `./data:/data` 绑定挂载，直接保存在 `compose.yaml` 所在部署目录的 `data/` 下。相对路径以 Compose 项目目录为基准（默认是第一份 Compose 文件所在目录），并非任意执行命令的当前工作目录；不要误切换到另一个空目录。

```sh
cp .env.example .env
mkdir -p ./data
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
# 写入一行至少 12 字节的密码；不要把真实密码写进命令或 .env。
chmod 600 .server-secrets/password
```

密码文件接受单行 12–1024 字节明文或完整 `$argon2id$...` PHC 哈希，允许末尾换行。明文在启动时转换为随机盐哈希，只在内存中保留哈希，原文件不会改写。镜像默认以 root 运行，因此密码文件使用 `600`、父目录使用 `700`。若改为非 root 服务账户，需显式授予该 UID 读取密码文件的权限；不要提交 `.server-secrets/`。Web 登录密码和凭证库主密码是两套独立密码。

`.env` 默认内容：

```dotenv
QTERM_IMAGE=ghcr.io/qiubai-lab/qterm:latest
QTERM_BIND_HOST=0.0.0.0
QTERM_PORT=8080
QTERM_PUBLIC_ORIGIN=http://localhost:8080
QTERM_ALLOW_INSECURE_HTTP=true
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
# 可选的容器资源限制；默认注释，不限制资源。
# QTERM_MEMORY_LIMIT=4g
# QTERM_CPU_LIMIT=2
# QTERM_PIDS_LIMIT=1024
```

| 配置 | 用途 |
| --- | --- |
| `QTERM_IMAGE` | GHCR 标签或完整 `ghcr.io/qiubai-lab/qterm@sha256:…` digest；使用 digest 可固定部署版本 |
| `QTERM_PORT` | 服务实际监听端口，默认 `8080`；host 模式下直接占用宿主机同一端口，HTTP 直连时同步修改公开地址 |
| `QTERM_BIND_HOST` | 服务监听地址，默认 `0.0.0.0`；可指定服务器内网 IP，同机 HTTPS 代理建议设为 `127.0.0.1`。IPv6 地址需带方括号，如 `[::]` |
| `QTERM_ALLOW_INSECURE_HTTP` | Compose 默认 `true`，允许内网 HTTP；HTTPS 示例显式设置 `false`。直接运行二进制或仅 `docker run` 时仍默认 `false` |
| `QTERM_PUBLIC_ORIGIN` | 浏览器实际访问的 origin，协议、主机名、端口必须匹配，不带路径或结尾 `/` |
| `QTERM_PASSWORD_SOURCE_FILE` | 宿主机密码文件；可改为已有的 `.server-secrets/password.hash` |
| `QTERM_MEMORY_LIMIT` / `QTERM_CPU_LIMIT` / `QTERM_PIDS_LIMIT` | 默认注释，不限制内存、CPU、进程数；按需取消注释设置，如 `4g` / `2` / `1024` |

Compose 将 `QTERM_BIND_HOST` 与 `QTERM_PORT` 组合为容器内的 `QTERM_LISTEN`，健康检查跟随该地址和端口。`QTERM_PUBLIC_ORIGIN` 只定义浏览器入口，不修改监听地址或自动启用 TLS。`.env` 用于 Compose 插值，变量必须通过 `environment` 显式传入容器；部署时应同时更新 `compose.yaml` 和 `.env`。修改配置后使用 `up -d --force-recreate`，仅 `restart` 不会更新环境变量。

从旧 bridge 配置迁移时，删除原 `ports`。若同时从命名卷切换为 `./data`，先按下文迁移原数据；已有自定义绑定目录也应先复制数据或保留其原映射，避免启动到空目录。同步更新到包含动态健康检查的新镜像；旧镜像仍探测固定的 `8080`，使用自定义端口时可能被误判为 unhealthy。host 模式下容器内 `localhost` 可访问宿主机网络服务，网络转发规则也直接占用宿主机端口。

默认使用 `latest` 标签，必须先发布成功才可拉取。推送源码到 `main` 后，流水线会在质量与容器验收通过后自动更新 `main`、`latest` 和提交 SHA 标签，也可以在 `main` 手动发布。`dev`、`dev-webruntime` 和 PR 只做质量与运行时检查，不构建或发布容器镜像。已有 `.env` 若仍指定开发分支标签，需将 `QTERM_IMAGE` 改为 `ghcr.io/qiubai-lab/qterm:latest` 或已发布的 digest。

## 2. 拉取并启动

```sh
docker compose config --quiet
docker compose pull qterm
docker compose up -d --no-build --wait --wait-timeout 90
docker compose ps
curl --fail http://localhost:8080/healthz
```

默认监听宿主机所有 IPv4 接口的 `8080` 端口，但默认浏览器入口仍是 **http://localhost:8080**。先根据下面两种案例设置实际访问地址，再用密码文件中的密码登录。不要将地址换为 `http://127.0.0.1:8080`，除非同时修改 `QTERM_PUBLIC_ORIGIN`。健康检查只表示服务就绪；CI 还会实际检查 Web 资源、登录、PTY、接管、文件操作和持久化。

GHCR 包首次创建通常是 private。仓库维护者如需允许匿名拉取，应在 GitHub 包设置中将包设为 public；公开仓库不等于公开镜像。若包保持 private，先使用拥有该包 `read:packages` 权限的 classic PAT 登录：

```sh
docker login ghcr.io -u YOUR_GITHUB_USERNAME
# 在交互密码提示中输入 PAT，不要把 Token 写入 .env 或 shell 命令。
```

服务器日志和停止命令：

```sh
docker compose logs --tail 100 -f qterm
docker compose stop qterm
docker compose start qterm
# 删除容器，保留宿主机 ./data 目录：
docker compose down
```

容器采用可写根文件系统和 Docker 默认 capabilities，允许 root 使用 `apt`、创建账户及切换 UID；不启用 privileged 模式，也不挂载宿主机 Docker socket。默认不设置容器内存、CPU 和进程数上限，仍受宿主机或 Docker 自身资源约束；需要限制时取消 `.env` 中对应变量的注释。`/tmp` 使用容器磁盘，不再限制为 32 MiB 内存盘。容器内的“本地终端”和文件操作以容器 root 身份执行。登录此 Web 服务意味着获得该容器的开发环境访问权限。

### 案例一：内网 IP 直连 HTTP

在受信任内网或 VPN 中使用。例如服务器内网 IP 为 `192.168.1.10`，服务端口为 `1425`，`.env` 内容如下（替换成你的 IP）：

```dotenv
QTERM_IMAGE=ghcr.io/qiubai-lab/qterm:latest
QTERM_BIND_HOST=0.0.0.0
QTERM_PORT=1425
QTERM_PUBLIC_ORIGIN=http://192.168.1.10:1425
QTERM_ALLOW_INSECURE_HTTP=true
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
# QTERM_MEMORY_LIMIT=4g
# QTERM_CPU_LIMIT=2
# QTERM_PIDS_LIMIT=1024
```

```sh
docker compose config --quiet
docker compose pull qterm
docker compose up -d --no-build --force-recreate --wait --wait-timeout 90
curl --fail http://127.0.0.1:1425/healthz
```

浏览器打开 **http://192.168.1.10:1425**。host 模式不需要发布端口；确保宿主机该端口没有被其他进程占用，且防火墙允许目标内网访问。如只允许某张网卡监听，可将 `QTERM_BIND_HOST` 设为 `192.168.1.10`，此时健康检查地址也改为 `http://192.168.1.10:1425/healthz`。

HTTP 不加密登录密码、会话 Cookie、文件和终端流量。浏览器主动剪贴板读取/写入 API 可能不可用，可使用键盘复制粘贴、文件选择或拖放。HTTP Cookie 保留 HttpOnly / SameSite=Strict；登录、主密码、严格 Origin 校验和会话所有权仍然生效。

### 案例二：域名 HTTPS 与同机 Nginx

假设域名为 `qterm.example.com`，Nginx 安装在同一 Linux 宿主机，域名解析到该服务器，且已取得覆盖该域名的有效 TLS 证书。Qterm 仅监听本机 `127.0.0.1:8080`，由 Nginx 提供 HTTPS；如果 Nginx 也在容器内，需同样使用 host 网络才能通过该回环地址连接。

`.env`：

```dotenv
QTERM_IMAGE=ghcr.io/qiubai-lab/qterm:latest
QTERM_BIND_HOST=127.0.0.1
QTERM_PORT=8080
QTERM_PUBLIC_ORIGIN=https://qterm.example.com
QTERM_ALLOW_INSECURE_HTTP=false
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
# QTERM_MEMORY_LIMIT=4g
# QTERM_CPU_LIMIT=2
# QTERM_PIDS_LIMIT=1024
```

先启动 Qterm：

```sh
docker compose pull qterm
docker compose up -d --no-build --force-recreate --wait --wait-timeout 90
curl --fail http://127.0.0.1:8080/healthz
```

将下面配置放入 Nginx 的 `http` 上下文，例如由主配置包含的 `/etc/nginx/conf.d/qterm.conf`。替换域名和证书路径，确保宿主机 80/443 端口可用：

```nginx
map $http_upgrade $qterm_connection_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name qterm.example.com;
    return 301 https://qterm.example.com$request_uri;
}

server {
    listen 443 ssl;
    server_name qterm.example.com;
    ssl_certificate /etc/letsencrypt/live/qterm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qterm.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 129m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Origin $http_origin;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $qterm_connection_upgrade;
        proxy_read_timeout 650s;
        proxy_send_timeout 650s;
        proxy_request_buffering off;
        proxy_buffering off;
    }
}
```

```sh
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://qterm.example.com/healthz
```

浏览器打开 **https://qterm.example.com**。不要改用后端的 `http://服务器IP:8080` 登录：公开 origin 已配置为 HTTPS，Cookie 将带 Secure / `__Host-` 属性。端口 `8080` 无需对外开放；若更改后端端口，应同步调整 Nginx 的 `proxy_pass`。WebSocket 必须转发 Upgrade/Connection，详见 [Nginx WebSocket 代理说明](https://nginx.org/en/docs/http/websocket.html)。

两种案例都要求浏览器地址与 `QTERM_PUBLIC_ORIGIN` 完全一致，不使用通配 origin。HTTPS 由代理终止，设置 origin 为 `https://...` 本身不会让 Rust 服务加载证书。

### 精简运行环境

镜像只预装 Qterm 运行所需的 Bash、CA 证书、curl、tini、Git、OpenSSH 客户端和运行库。不预装 mise、编译器、Python/venv 或开发用 Node/npm/pnpm，用户可按需通过 apt 或自行安装 mise 配置开发环境。

Qterm 屏幕组件内部依赖的 Node 保留在 `/opt/qterm/bin/node`，该目录不加入用户 PATH；开发者自行安装或切换 Node 版本不会影响屏幕组件。

`/data` 绑定到部署目录的 `./data`，不再由 Docker 命名卷管理。root HOME `/data/home` 对应宿主机 `./data/home`，内置 `qterm` 用户（UID/GID 10001）的 HOME `/data/users/qterm` 对应 `./data/users/qterm`。其他路径默认属于容器层。手动安装的系统软件在重建后消失；长期依赖应写入派生 Dockerfile，自行安装的工具若需持久化，应明确把其数据目录放入 `/data` 或另挂数据卷。

### 切换 UID

默认 root 可直接切换到内置开发账户：

```sh
su - qterm
# 返回 root：exit
```

也可从宿主机启动该账户的终端：

```sh
docker compose exec --user 10001:10001 -e HOME=/data/users/qterm qterm bash
```

其他 UID 可通过 `useradd --uid 10002 --create-home --home-dir /data/users/dev --shell /bin/bash dev` 创建，再用 `su - dev` 切换。账户记录保存在容器的 `/etc/passwd`，重建后不会保留；长期固定的自定义账户应写进派生 Dockerfile，HOME 放在 `/data/users/`。

若要更改整个服务的 UID，在 Compose 覆盖文件中设置 `user` 和对应 `HOME`；先停服并调整宿主机 `./data` 中相关目录的 UID/GID 及密码文件读取权限。自行配置共享工具目录时，应由 root 管理并授予其他 UID 读取/执行权限。匿名数字 UID 也必须配置可写 HOME；需要用户名解析的工具应使用已创建的账户。

从旧 UID 10001 镜像升级时，`/data/home` 的内容与原有文件属主保持不变。若 Git 提示项目所有权不匹配，可切换到 `qterm` 后进入原项目目录，或明确将需要交给 root 管理的项目目录迁移为 root 所有。

账户修改同样写入容器层，重建后消失；需要保留的自定义账户应写进派生 Dockerfile。

## 3. 从本地源码构建

需要完整仓库。密码与 `.env` 准备方式相同，但显式加载构建覆盖文件：

```sh
docker compose -f compose.yaml -f compose.build.yaml up -d --build --wait --wait-timeout 90
```

覆盖文件强制使用 `qterm-server:local` 并按基础文件指定的 `linux/amd64` 从当前源码构建；基础 `compose.yaml` 只使用镜像，因此独立部署目录不需要 Dockerfile。源码构建后的日志、停止及移除命令也应带上同样的两个 `-f` 参数。不要同时在同一个 project 中运行源码版与 GHCR 版。

回到 GHCR 版时使用基础文件即可：

```sh
docker compose pull qterm
docker compose up -d --no-build --wait
```

开发者可在构建 `qterm-server:local` 后运行 `python3 scripts/test-server-compose.py` 验证实际 Compose 配置；它使用随机项目名、临时密码和临时项目目录下的 `data/`，不会挂载仓库或日常部署的 `./data`，结束时仅清理测试资源。

## 4. 升级与回滚

先备份数据，并从当前容器记录镜像 digest（本地源码构建镜像可能没有 registry digest）：

```sh
docker inspect --format '{{.Image}}' "$(docker compose ps -q qterm)"
docker image inspect --format '{{json .RepoDigests}}' \
  "$(docker inspect --format '{{.Image}}' "$(docker compose ps -q qterm)")"
```

编辑 `.env` 的 `QTERM_IMAGE`，选择新标签或 digest，然后：

```sh
docker compose pull qterm
docker compose up -d --no-build --wait --wait-timeout 90
docker compose ps
```

回滚时将 `QTERM_IMAGE` 改回记录的 digest，再运行相同命令。`docker compose restart` 不会更新镜像或应用新的环境变量；改密码文件后也推荐 `up -d --force-recreate --no-build --wait`，确保重新挂载被编辑器替换的文件。

重建容器会结束服务端本地 PTY、SSH 会话、网络转发及内存中的编辑草稿；保存的布局、连接、凭证库和主目录保留。先完成或保存工作。旧版本不保证兼容升级后的数据格式，必要时恢复升级前的完整备份。

## 5. 数据备份与恢复

Compose 使用以下绑定挂载，没有顶层命名卷声明：

```yaml
volumes:
  - ./data:/data
```

例如 `/opt/qterm/compose.yaml` 对应 `/opt/qterm/data/`。该目录包含服务配置、加密凭证、已知主机、布局、访问记录、缓存及用户 HOME，可直接从宿主机查看和备份：

```text
/opt/qterm/
├── compose.yaml
├── .env
├── .server-secrets/password
└── data/                  # 容器内 /data
    ├── data/              # connections.json、secrets.vault 等服务数据
    ├── device/            # 已知主机、工作区等设备配置
    ├── cache/
    ├── home/              # root HOME
    └── users/qterm/       # UID/GID 10001 HOME
```

默认容器以 root 写入，宿主机文件可能属于 root；读取、备份或调整所有权时需要相应权限。保留服务生成的文件权限，不要对整个目录设置 `777`。切换服务 UID 时先停服，再按实际 UID/GID 调整目录；不要在运行时修改服务状态文件，也不要让多个实例同时写同一目录。仓库已忽略根目录的 `data/` 和 `backups/`，它们也不会进入 Docker 构建上下文。

`docker compose down` 或容器重建不会删除绑定目录，`down -v` 也不会删除宿主机的 `./data`；直接删除或覆盖该目录则会丢失数据。登录密码文件和凭证库恢复密钥需另外离线保存。

### 从旧命名卷或其他目录迁移

仅修改 Compose 不会自动复制原数据。在有权限保留原 UID/GID 的 Linux Shell 中，先在**旧部署目录、旧容器仍存在时**停止服务并导出数据。下面命令适用于旧 `/data` 来自命名卷或其他绑定路径；目标 `./data` 必须为空：

```sh
docker compose stop qterm
mkdir -p ./data
# 确认目录为空；包括隐藏文件，非空时不要执行后续复制。
find ./data -mindepth 1 -maxdepth 1
# -a 保留文件的 UID/GID；非 root 用户需要相应的宿主机文件权限。
docker cp -a "$(docker compose ps -aq qterm):/data/." ./data/
```

确认文件复制完整后，将 Compose 映射更新为 `./data:/data` 并移除旧顶层 `volumes: qterm-data:` 声明，再运行：

```sh
docker compose up -d --no-build --force-recreate --wait --wait-timeout 90
```

检查连接配置、凭证库和 HOME 内容后再考虑清理旧卷/旧目录。迁移期间不要执行 `down -v`，也不要提前删除旧容器或旧卷；保留它们可便于回退。

### 备份与恢复

停止服务后备份整个宿主机目录，保证文件一致性。备份包含工作文件和敏感配置，应存放在受保护目录；下面使用 `sudo tar` 读取容器 root 创建的文件：

```sh
mkdir -p backups
chmod 700 backups
docker compose stop qterm
(umask 077; sudo tar --numeric-owner -C ./data -czf - . > "backups/qterm-data-$(date +%Y%m%d-%H%M%S).tar.gz")
docker compose start qterm
```

确认 `tar` 成功并检查归档可读后再依赖备份。恢复到**新的部署目录和空 `./data`**，复制部署文件及密码文件、选择相应镜像版本，然后运行：

```sh
mkdir -p ./data
# 替换为实际备份文件；保留原 UID/GID，不覆盖正在使用的数据目录。
sudo tar --numeric-owner -C ./data -xzf /absolute/path/qterm-data-backup.tar.gz
docker compose pull qterm
docker compose up -d --no-build --wait --wait-timeout 90
```

保留原部署作为回退。若原实例仍在运行，先停止它或为恢复实例更换监听端口及 origin。自行增加的其他绑定目录也需分别备份。

## 6. 常见问题

| 现象 | 检查 |
| --- | --- |
| `manifest unknown` / `not found` | 对应分支尚未发布，或标签拼写错误；查看发布 run 的 Summary |
| `denied` / `unauthorized` | 包是否为 private、登录账号是否有读取权限；维护者检查包的 repository / Actions access |
| 密码文件不存在或容器读不到 | 文件是否为普通文件、路径是否相对当前部署目录、当前服务 UID 能否读取 |
| 登录或 WebSocket 返回 403 | 浏览器地址与 `QTERM_PUBLIC_ORIGIN` 是否完全匹配；代理是否保留 Origin/Upgrade |
| 端口被占用 | host 模式直接占用宿主机端口；修改 `QTERM_PORT`，HTTP 直连同步改 origin，HTTPS 同步改代理 upstream，然后重新 `up` |
| `.env` 写了 HTTP 开关仍启动失败 | 更新部署目录的 Compose，确认 `environment` 传入该变量，再 `up -d --force-recreate`；可用 `docker compose config` 检查解析结果 |
| `unhealthy` / 启动失败 | `docker compose logs --tail 100 qterm`；检查密码格式、卷权限、内存和数据目录独占锁 |
| 更新后仍是旧版本 | 先 `pull` 再 `up`，确认没有加载 `compose.build.yaml` 或遗留 `COMPOSE_FILE` 环境变量 |
| 主目录写入报权限错误 | 当前账户的 HOME 是否可写；切换服务 UID 后需同步调整宿主机 `./data` 相关目录的所有权 |

跨机器访问可按上文选择内网 HTTP 或域名 HTTPS；Compose 默认允许 HTTP，公网访问应采用 HTTPS。HTTPS、WebSocket 代理和转发端口配置见 [Web 运行时](server-runtime.md#容器启动)；GHCR 自动/手动发布与 CI 闸门见 [发布流程](release.md#web-容器镜像发布)。
