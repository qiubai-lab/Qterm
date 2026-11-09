#!/bin/sh
# Keep all mutations inside main so a truncated curl response cannot start setup.
set -eu

fail() { printf '\n部署失败：%s\n' "$*" >&2; exit 1; }

compose() (
    # The generated files are authoritative, not unrelated caller shell settings.
    unset QTERM_IMAGE QTERM_BIND_HOST QTERM_PORT QTERM_PUBLIC_ORIGIN
    unset QTERM_ALLOW_INSECURE_HTTP QTERM_PASSWORD_SOURCE_FILE
    unset QTERM_MEMORY_LIMIT QTERM_CPU_LIMIT QTERM_PIDS_LIMIT
    unset COMPOSE_FILE COMPOSE_ENV_FILES COMPOSE_PROFILES
    docker compose --project-directory "$install_dir" --env-file "$install_dir/.env" \
        --project-name "$project_name" -f "$install_dir/compose.yaml" "$@" </dev/null
)

main() {
    if [ "$#" -ne 0 ]; then
        printf '用法：curl -fsSL https://raw.githubusercontent.com/qiubai-lab/Qterm/main/scripts/install-server.sh | sh\n'
        printf '可选环境变量：QTERM_INSTALL_DIR、QTERM_PUBLIC_ORIGIN、QTERM_PORT、QTERM_BIND_HOST、QTERM_IMAGE\n'
        [ "$1" = '--help' ] && return 0
        return 1
    fi
    [ "$(uname -s)" = Linux ] || fail '一键脚本仅支持 Linux；其他平台请使用文档中的手动部署方式。'
    command -v docker >/dev/null 2>&1 || fail '请先安装 Docker Engine 和 Docker Compose v2。'
    docker compose version >/dev/null 2>&1 || fail '请先安装 Docker Compose v2。'
    docker compose up --help | grep -q -- '--wait-timeout' || fail 'Docker Compose 版本过旧，需要支持 up --wait-timeout。'
    docker_platform=$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null) || fail '无法连接 Docker，请启动服务并确认当前用户有访问权限。'
    case "$docker_platform" in linux/x86_64|linux/amd64) ;; *) fail '当前镜像仅支持 linux/amd64；请在 AMD64 Linux Docker 主机部署。' ;; esac

    port=${QTERM_PORT:-2654}
    case "$port" in ''|*[!0-9]*) fail 'QTERM_PORT 必须为 1–65535 的整数。' ;; esac
    [ "${#port}" -le 5 ] && [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail 'QTERM_PORT 必须为 1–65535 的整数。'
    bind_host=${QTERM_BIND_HOST:-0.0.0.0}
    printf '%s\n' "$bind_host" | grep -Eq '^([0-9]+\.){3}[0-9]+$|^\[[0-9a-fA-F:]+\]$' || fail 'QTERM_BIND_HOST 必须是 IPv4 地址或带方括号的 IPv6 地址。'
    image=${QTERM_IMAGE:-ghcr.io/qiubai-lab/qterm:latest}
    printf '%s\n' "$image" | grep -Eq '^ghcr\.io/qiubai-lab/qterm(:[a-zA-Z0-9_][a-zA-Z0-9_.-]*|@sha256:[a-f0-9]{64})$' || fail 'QTERM_IMAGE 必须为仓库的 GHCR 标签或 sha256 digest。'
    origin=${QTERM_PUBLIC_ORIGIN:-}
    if [ -z "$origin" ]; then
        detected_ip=''
        if command -v ip >/dev/null 2>&1; then
            detected_ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") {print $(i+1);exit}}')
        fi
        if [ -z "$detected_ip" ] && command -v hostname >/dev/null 2>&1; then
            detected_ip=$(hostname -I 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i ~ /^[0-9]+\./) {print $i;exit}}')
        fi
        [ -n "$detected_ip" ] || fail '无法检测主机 IPv4 地址，请设置 QTERM_PUBLIC_ORIGIN，例如 http://192.168.1.10:2654。'
        origin="http://$detected_ip:$port"
    fi
    # No paths, userinfo, quotes, interpolation or newlines can enter the .env.
    case "$origin$image$bind_host" in *'
'*) fail '配置值不能包含换行。' ;; esac
    printf '%s\n' "$origin" | grep -Eq '^https?://([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\[[0-9a-fA-F:]+\])(:[0-9]{1,5})?$' || fail 'QTERM_PUBLIC_ORIGIN 必须为完整 http(s)://主机[:端口]，不带路径或结尾斜线。'
    case "$origin" in https://*) insecure=false ;; *) insecure=true ;; esac

    install_dir=${QTERM_INSTALL_DIR:-"$PWD/qterm"}
    case "$install_dir" in /*) ;; *) install_dir="$PWD/$install_dir" ;; esac
    # Atomic creation also excludes simultaneous installs, existing data and symlinks.
    mkdir -p "$(dirname "$install_dir")"
    mkdir -m 700 "$install_dir" 2>/dev/null || fail "部署目录已存在或无法创建：$install_dir；不会覆盖已有文件，请选择新的 QTERM_INSTALL_DIR。"
    install_dir=$(cd "$install_dir" && pwd -P)
    umask 077
    mkdir "$install_dir/data" "$install_dir/.server-secrets"
    password=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 16)
    [ "${#password}" -eq 16 ] || fail '系统随机数生成失败。'
    printf '%s\n' "$password" > "$install_dir/.server-secrets/password"
    chmod 600 "$install_dir/.server-secrets/password"
    project_name="qterm-$(printf '%s' "$install_dir" | cksum | awk '{print $1}')"
    cat > "$install_dir/.env" <<ENV
COMPOSE_PROJECT_NAME=$project_name
QTERM_IMAGE=$image
QTERM_BIND_HOST=$bind_host
QTERM_PORT=$port
QTERM_PUBLIC_ORIGIN=$origin
QTERM_ALLOW_INSECURE_HTTP=$insecure
QTERM_PASSWORD_SOURCE_FILE=./.server-secrets/password
ENV
    cat > "$install_dir/compose.yaml" <<'COMPOSE'
services:
  qterm:
    image: ${QTERM_IMAGE:-ghcr.io/qiubai-lab/qterm:latest}
    platform: linux/amd64
    restart: unless-stopped
    network_mode: host
    environment:
      QTERM_LISTEN: ${QTERM_BIND_HOST:-0.0.0.0}:${QTERM_PORT:-8080}
      QTERM_PUBLIC_ORIGIN: ${QTERM_PUBLIC_ORIGIN:-http://localhost:8080}
      QTERM_ALLOW_INSECURE_HTTP: ${QTERM_ALLOW_INSECURE_HTTP:-true}
      QTERM_PASSWORD_FILE: /run/secrets/qterm_password
    secrets:
      - qterm_password
    volumes:
      - ./data:/data
    pids_limit: ${QTERM_PIDS_LIMIT:--1}
    mem_limit: ${QTERM_MEMORY_LIMIT:-0}
    cpus: ${QTERM_CPU_LIMIT:-0}

secrets:
  qterm_password:
    file: ${QTERM_PASSWORD_SOURCE_FILE:-./.server-secrets/password}
COMPOSE
    printf '\n部署目录：%s\n镜像：%s\n访问地址：%s\n' "$install_dir" "$image" "$origin"
    printf '正在拉取镜像并启动，等待健康检查（最多 90 秒，不含镜像下载）……\n'
    if ! compose config --quiet || ! compose pull qterm || ! compose up -d --no-build --wait --wait-timeout 90; then
        printf '\n配置与数据已保留在 %s；未重置密码。\n' "$install_dir" >&2
        printf '进入该目录后，可执行 docker compose logs --tail 100 qterm 排查，或 docker compose up -d --wait 重试。\n' >&2
        fail '镜像拉取或启动未成功，请检查 Docker 输出、镜像访问权限和端口占用。'
    fi
    printf '\nQterm 已启动，容器健康检查通过。\n\n访问地址：%s\n登录密码：%s\n' "$origin" "$password"
    printf '\n目录与文件：\n  %s\n' "$install_dir"
    printf '  data/                     持久化配置、凭证库和容器用户文件；升级时保留\n'
    printf '  .server-secrets/password   16 位随机登录密码（权限 600），请妥善保存\n'
    printf '  .env                      访问地址、端口、镜像等部署配置\n'
    printf '  compose.yaml              容器定义，可使用 docker compose 管理\n'
    printf '\n请进入上述目录执行管理命令：\n'
    printf '  docker compose ps\n  docker compose logs --tail 100 -f qterm\n  docker compose stop\n'
    printf '  docker compose pull && docker compose up -d --wait    # 升级，保留 data/\n'
    printf '\n浏览器地址必须与 .env 中的 QTERM_PUBLIC_ORIGIN 完全一致。\n'
    printf '自动检测的地址可能是内网地址；公网/NAT/域名访问需设置实际入口并放行相应端口。\n'
    case "$origin" in
        https://*) printf 'HTTPS 仍需自行配置反向代理和证书；当前健康检查仅确认容器后端就绪。\n' ;;
        *) printf '当前使用 HTTP，请在受信任内网/VPN 中访问；公网请按文档配置 HTTPS。\n' ;;
    esac
    printf '首次登录后需另行设置凭证库主密码，它与上述 Web 登录密码不同。\n'
}

main "$@"
