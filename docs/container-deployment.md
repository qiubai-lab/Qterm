# 本地容器部署

Qterm Web 运行时是单用户服务，镜像基于 Ubuntu 24.04 LTS，默认以 root 运行。容器内包含 Web 静态资源、Rust 服务、Node.js 屏幕组件、Git 和 OpenSSH 客户端，无需在宿主机安装 Node/Rust。GHCR 仅发布 **`linux/amd64`** 镜像，Compose 显式指定该平台。Apple Silicon/ARM64 主机需要 Docker 的 AMD64 模拟执行支持，可能较慢；当前不提供原生 ARM64 镜像。

本文以 AMD64 Linux 宿主机为部署目标，使用 Docker Engine / Docker Desktop 和带 `up --wait` 的 Docker Compose v2 或更新版本。命令在 Linux/macOS 的 POSIX shell 中执行；Windows 可在 WSL 中执行，并使用 Docker Desktop 的 Linux 容器模式。

## 1. 准备部署文件

可以从当前分支复制 `compose.yaml` 和 `.env.example` 到一个固定目录，也可以直接在仓库根目录部署。拉取镜像不需要完整源码。不要随意更改部署目录或 Compose project name，否则 Compose 默认会创建另一个数据卷。

```sh
cp .env.example .env
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
# 写入一行至少 12 字节的密码；不要把真实密码写进命令或 .env。
chmod 600 .server-secrets/password
```

密码文件接受单行 12–1024 字节明文或完整 `$argon2id$...` PHC 哈希，允许末尾换行。明文在启动时转换为随机盐哈希，只在内存中保留哈希，原文件不会改写。镜像默认以 root 运行，因此密码文件使用 `600`、父目录使用 `700`。若改为非 root 服务账户，需显式授予该 UID 读取密码文件的权限；不要提交 `.server-secrets/`。Web 登录密码和凭证库主密码是两套独立密码。

`.env` 默认内容：

```dotenv
QTERM_IMAGE=ghcr.io/qiubai-lab/qterm:main
QTERM_PORT=8080
QTERM_PUBLIC_ORIGIN=http://localhost:8080
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
# 可选的容器资源限制；默认注释，不限制资源。
# QTERM_MEMORY_LIMIT=4g
# QTERM_CPU_LIMIT=2
# QTERM_PIDS_LIMIT=1024
```

| 配置 | 用途 |
| --- | --- |
| `QTERM_IMAGE` | GHCR 标签或完整 `ghcr.io/qiubai-lab/qterm@sha256:…` digest；使用 digest 可固定部署版本 |
| `QTERM_PORT` | 宿主机端口，只绑定 `127.0.0.1`；更改后同步调整公开地址 |
| `QTERM_BIND_HOST` | 宿主机发布地址，默认 `127.0.0.1`；内网直连时可设为服务器内网 IP 或 `0.0.0.0` |
| `QTERM_ALLOW_INSECURE_HTTP` | 默认 `false`；仅显式设为 `true` 时允许非回环 HTTP origin |
| `QTERM_PUBLIC_ORIGIN` | 浏览器实际访问的 origin，协议、主机名、端口必须匹配，不带路径或结尾 `/` |
| `QTERM_PASSWORD_SOURCE_FILE` | 宿主机密码文件；可改为已有的 `.server-secrets/password.hash` |
| `QTERM_MEMORY_LIMIT` / `QTERM_CPU_LIMIT` / `QTERM_PIDS_LIMIT` | 默认注释，不限制内存、CPU、进程数；按需取消注释设置，如 `4g` / `2` / `1024` |

默认使用 `main` 标签，必须先发布成功才可拉取。推送源码到 `main` 后，流水线会在质量与容器验收通过后自动更新 `main`、`latest` 和提交 SHA 标签，也可以在 `main` 手动发布。`dev`、`dev-webruntime` 和 PR 只做质量与运行时检查，不构建或发布容器镜像。已有 `.env` 若仍指定开发分支标签，需将 `QTERM_IMAGE` 改为 `ghcr.io/qiubai-lab/qterm:main` 或已发布的 digest。

## 2. 拉取并启动

```sh
docker compose config --quiet
docker compose pull qterm
docker compose up -d --no-build --wait --wait-timeout 90
docker compose ps
curl --fail http://localhost:8080/healthz
```

打开 **http://localhost:8080** 并用密码文件中的密码登录。不要将地址换为 `http://127.0.0.1:8080`，除非同时修改 `QTERM_PUBLIC_ORIGIN`。健康检查只表示服务就绪；CI 还会实际检查 Web 资源、登录、PTY、接管、文件操作和持久化。

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
# 删除容器和网络，保留数据卷：
docker compose down
```

容器采用可写根文件系统和 Docker 默认 capabilities，允许 root 使用 `apt`、创建账户及切换 UID；不启用 privileged 模式，也不挂载宿主机 Docker socket。默认不设置容器内存、CPU 和进程数上限，仍受宿主机或 Docker 自身资源约束；需要限制时取消 `.env` 中对应变量的注释。`/tmp` 使用容器磁盘，不再限制为 32 MiB 内存盘。容器内的“本地终端”和文件操作以容器 root 身份执行。登录此 Web 服务意味着获得该容器的开发环境访问权限。

### 通过服务器 IP 使用 HTTP

仅在你信任的内网或 VPN 中启用。在 `.env` 中配置实际访问地址（下面的 IP 需替换）：

```dotenv
QTERM_BIND_HOST=0.0.0.0
QTERM_PORT=8080
QTERM_PUBLIC_ORIGIN=http://192.168.1.10:8080
QTERM_ALLOW_INSECURE_HTTP=true
```

使用包含 HTTP 支持的新镜像后，运行 `docker compose up -d --no-build --force-recreate --wait`。浏览器必须使用与 `QTERM_PUBLIC_ORIGIN` 完全相同的地址；切勿配置通配 origin。HTTPS 仍可正常使用，并继续设置 Secure Cookie；HTTP Cookie 保留 HttpOnly / SameSite=Strict。登录、主密码、严格 Origin 校验、会话所有权和接管规则保持有效。

HTTP 不加密登录密码、会话 Cookie、文件和终端流量。浏览器的主动剪贴板读取/写入 API 可能不可用，可使用键盘复制粘贴、文件选择或拖放；开启 HTTP 不会解除浏览器的安全上下文限制。公网访问继续使用 HTTPS。

### 精简运行环境

镜像只预装 Qterm 运行所需的 Bash、CA 证书、curl、tini、Git、OpenSSH 客户端和运行库。不预装 mise、编译器、Python/venv 或开发用 Node/npm/pnpm，用户可按需通过 apt 或自行安装 mise 配置开发环境。

Qterm 屏幕组件内部依赖的 Node 保留在 `/opt/qterm/bin/node`，该目录不加入用户 PATH；开发者自行安装或切换 Node 版本不会影响屏幕组件。

`/data` 使用命名卷持久化；root HOME 为 `/data/home`，内置 `qterm` 用户（UID/GID 10001）的 HOME 为 `/data/users/qterm`。其他路径默认属于容器层。手动安装的系统软件在重建后消失；长期依赖应写入派生 Dockerfile，自行安装的工具若需持久化，应明确把其数据目录放入 `/data` 或另挂数据卷。

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

若要更改整个服务的 UID，在 Compose 覆盖文件中设置 `user` 和对应 `HOME`；先停服并调整 `/data` 的所有权及密码文件读取权限。自行配置共享工具目录时，应由 root 管理并授予其他 UID 读取/执行权限。匿名数字 UID 也必须配置可写 HOME；需要用户名解析的工具应使用已创建的账户。

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

开发者可在构建 `qterm-server:local` 后运行 `python3 scripts/test-server-compose.py` 验证实际 Compose 配置；它使用随机项目名、临时密码和独立卷，结束时仅清理测试资源。

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

命名卷 `qterm-data` 实际通常名为 `<项目名>_qterm-data`，包含配置、加密凭证、已知主机、布局、访问记录、root HOME 和 `/data/users/`。不要使用 `docker compose down -v` 清理日常部署，这会删除数据卷。登录密码文件和凭证库恢复密钥需要另外离线保存。

停止服务后备份整个卷，保证文件一致性。备份包含工作文件和敏感配置，存放在受保护目录：

```sh
mkdir -p backups
chmod 700 backups
(umask 077; docker compose stop qterm && \
  docker compose run --rm --no-deps -T --entrypoint tar qterm \
    -C /data -czf - . > "backups/qterm-data-$(date +%Y%m%d-%H%M%S).tar.gz")
docker compose start qterm
```

以上命令备份 `/data`；自行增加的其他数据卷需要分别备份。确认 `tar` 成功并检查归档可读后再依赖该备份。恢复应在**新的部署目录和空数据卷**中操作：复制相同部署文件及密码文件，配置原镜像版本，先 `docker compose pull qterm`，再运行：

```sh
# 将备份文件路径替换为自己的文件；run 会创建新项目的数据卷。
docker compose run --rm --no-deps -T --entrypoint tar qterm \
  -C /data -xzf - < /absolute/path/qterm-data-backup.tar.gz
docker compose up -d --no-build --wait --wait-timeout 90
```

保留原部署作为回退，但不要让两个服务同时写同一卷。恢复的新目录使用不同的 project name；若原实例仍在运行，要先停止它或为恢复实例更换端口及 origin。

## 6. 常见问题

| 现象 | 检查 |
| --- | --- |
| `manifest unknown` / `not found` | 对应分支尚未发布，或标签拼写错误；查看发布 run 的 Summary |
| `denied` / `unauthorized` | 包是否为 private、登录账号是否有读取权限；维护者检查包的 repository / Actions access |
| 密码文件不存在或容器读不到 | 文件是否为普通文件、路径是否相对当前部署目录、当前服务 UID 能否读取 |
| 登录或 WebSocket 返回 403 | 浏览器地址与 `QTERM_PUBLIC_ORIGIN` 是否完全匹配；代理是否保留 Origin/Upgrade |
| 端口被占用 | 同时修改 `.env` 中 `QTERM_PORT` 与 `QTERM_PUBLIC_ORIGIN` 后重新 `up` |
| `unhealthy` / 启动失败 | `docker compose logs --tail 100 qterm`；检查密码格式、卷权限、内存和数据目录独占锁 |
| 更新后仍是旧版本 | 先 `pull` 再 `up`，确认没有加载 `compose.build.yaml` 或遗留 `COMPOSE_FILE` 环境变量 |
| 主目录写入报权限错误 | 当前账户的 HOME 是否可写；切换服务 UID 后需同步调整数据卷所有权 |

跨机器访问推荐 HTTPS 反向代理；受信任内网 HTTP 的显式启用方式见上文。HTTPS、WebSocket 代理和转发端口配置见 [Web 运行时](server-runtime.md#容器启动)；GHCR 自动/手动发布与 CI 闸门见 [发布流程](release.md#web-容器镜像发布)。
