# 本地容器部署

Qterm Web 运行时是单用户服务。容器内包含 Web 静态资源、Rust 服务、Node.js 屏幕组件、Git 和 OpenSSH 客户端，无需在宿主机安装 Node/Rust。GHCR 仅发布 **`linux/amd64`** 镜像，Compose 显式指定该平台。Apple Silicon/ARM64 主机需要 Docker 的 AMD64 模拟执行支持，可能较慢；当前不提供原生 ARM64 镜像。

本文以 AMD64 Linux 宿主机为部署目标，使用 Docker Engine / Docker Desktop 和带 `up --wait` 的 Docker Compose v2 或更新版本。命令在 Linux/macOS 的 POSIX shell 中执行；Windows 可在 WSL 中执行，并使用 Docker Desktop 的 Linux 容器模式。

## 1. 准备部署文件

可以从当前分支复制 `compose.yaml` 和 `.env.example` 到一个固定目录，也可以直接在仓库根目录部署。拉取镜像不需要完整源码。不要随意更改部署目录或 Compose project name，否则 Compose 默认会创建另一个数据卷。

```sh
cp .env.example .env
mkdir -p .server-secrets
chmod 700 .server-secrets
vi .server-secrets/password
# 写入一行至少 12 字节的密码；不要把真实密码写进命令或 .env。
chmod 644 .server-secrets/password
```

密码文件接受单行 12–1024 字节明文或完整 `$argon2id$...` PHC 哈希，允许末尾换行。明文在启动时转换为随机盐哈希，只在内存中保留哈希，原文件不会改写。镜像以 UID/GID `10001:10001` 运行，Compose 文件 secret 需允许该 UID 读取，因此文件使用 `644`、父目录使用 `700`；不要提交 `.server-secrets/`。Web 登录密码和凭证库主密码是两套独立密码。

`.env` 默认内容：

```dotenv
QTERM_IMAGE=ghcr.io/qiubai-lab/qterm:dev-webruntime
QTERM_PORT=8080
QTERM_PUBLIC_ORIGIN=http://localhost:8080
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
```

| 配置 | 用途 |
| --- | --- |
| `QTERM_IMAGE` | GHCR 标签或完整 `ghcr.io/qiubai-lab/qterm@sha256:…` digest；使用 digest 可固定部署版本 |
| `QTERM_PORT` | 宿主机端口，只绑定 `127.0.0.1`；更改后同步调整公开地址 |
| `QTERM_PUBLIC_ORIGIN` | 浏览器实际访问的 origin，协议、主机名、端口必须匹配，不带路径或结尾 `/` |
| `QTERM_PASSWORD_SOURCE_FILE` | 宿主机密码文件；可改为已有的 `.server-secrets/password.hash` |

`dev-webruntime` 是当前开发分支的预览标签，必须先手动发布成功才可拉取。`main` 和 `latest` 仅在手动发布 `main` 后生成；不会因推送源码自动更新镜像。

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

容器采用只读根文件系统、非 root 用户、移除全部 Linux capabilities、禁止提权；只有 `/data` 和临时 `/tmp` 可写。默认上限为 1 GiB 内存、2 CPU、256 个进程。容器内的“本地终端”和文件操作针对容器账户，并不会自动访问宿主机。Shell 主目录 `/data/home` 可持久保存仓库、配置及用户安装的工具；工具需安装到该可写目录。

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

命名卷 `qterm-data` 实际通常名为 `<项目名>_qterm-data`，包含配置、加密凭证、已知主机、布局、访问记录及 `/data/home`。不要使用 `docker compose down -v` 清理日常部署，这会删除数据卷。登录密码文件和凭证库恢复密钥需要另外离线保存。

停止服务后备份整个卷，保证文件一致性。备份包含工作文件和敏感配置，存放在受保护目录：

```sh
mkdir -p backups
chmod 700 backups
(umask 077; docker compose stop qterm && \
  docker compose run --rm --no-deps -T --entrypoint tar qterm \
    -C /data -czf - . > "backups/qterm-data-$(date +%Y%m%d-%H%M%S).tar.gz")
docker compose start qterm
```

确认 `tar` 成功并检查归档可读后再依赖该备份。恢复应在**新的部署目录和空数据卷**中操作：复制相同部署文件及密码文件，配置原镜像版本，先 `docker compose pull qterm`，再运行：

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
| 密码文件不存在或容器读不到 | 文件是否为普通文件、路径是否相对当前部署目录、UID 10001 能否读取 |
| 登录或 WebSocket 返回 403 | 浏览器地址与 `QTERM_PUBLIC_ORIGIN` 是否完全匹配；代理是否保留 Origin/Upgrade |
| 端口被占用 | 同时修改 `.env` 中 `QTERM_PORT` 与 `QTERM_PUBLIC_ORIGIN` 后重新 `up` |
| `unhealthy` / 启动失败 | `docker compose logs --tail 100 qterm`；检查密码格式、卷权限、内存和数据目录独占锁 |
| 更新后仍是旧版本 | 先 `pull` 再 `up`，确认没有加载 `compose.build.yaml` 或遗留 `COMPOSE_FILE` 环境变量 |
| 主目录写入报权限错误 | 自定义 bind mount 需授予 UID/GID 10001 写权限；优先使用自带命名卷 |

跨机器访问需 HTTPS 反向代理，不能把不受保护的 HTTP 直接开放到公网。HTTPS、WebSocket 代理和转发端口配置见 [Web 运行时](server-runtime.md#容器启动)；手动 GHCR 发布与 CI 闸门见 [发布流程](release.md#web-容器镜像发布)。
