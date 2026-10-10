# 连接配置同步

同步是可选功能，默认关闭。在 **系统设置 → 同步** 中配置服务器地址、Token 并保存，启用后会合并本机与服务器的连接目录。开启意味着授权上传本机连接配置；密码、私钥、凭证 ID、主机信任、转发规则、工作区和终端内容不会上传。

## 构建与镜像发布

源码位于 `services/qterm-sync`，协议与合并规则位于 `crates/sync-core`。服务与桌面端独立构建。

```sh
docker build -f services/qterm-sync/Dockerfile -t qterm-sync:local .
```

GitHub Actions 工作流 `.github/workflows/build-sync.yml` 在相关 PR 上运行测试和镜像构建，在推送 Qterm 发版标签 `v*` 或测试标签 `sync-v*` 时将 Linux amd64/arm64 镜像发布到 `ghcr.io/<owner>/qterm-sync`。正式镜像版本与 Qterm 一致，例如 `v0.5.0` 对应 `0.5.0`，正式标签需与 `src-tauri/Cargo.toml` 的版本匹配。测试仍可推送 `sync-v0.5.0-test.1`，生成 `0.5.0-test.1` 镜像，不触发桌面发版。避免测试标签与已发布正式版本同名，以免覆盖镜像。两个发布工作流并行运行，容器发布不等待桌面安装包构建完成。手动触发仅验证构建，不发布。

工作流使用自动生成的 `GITHUB_TOKEN`，基础权限为 `contents: read` 和 `packages: write`。组织策略需允许 Actions 发布 Package。首次发布的 Package 通常为私有；在 Package 设置中设为公开后，部署机器可以匿名拉取。私有镜像需要使用具有 `read:packages` 权限的 GitHub PAT classic 登录 GHCR。镜像拉取 Token 与应用同步 Token 完全独立。

GitHub 仅保存程序镜像，用户数据保存在部署机器的数据卷里。此变更不会自动创建发布标签、推送镜像或部署服务器。

## 本地手动启动（Linux，无需 Docker）

需要 Rust/Cargo、Linux C/C++ 构建工具、OpenSSL 和 `sha256sum`。在仓库根目录执行，服务将在当前终端前台运行，仅监听本机，使用独立测试数据目录：

```sh
SYNC_TOKEN=$(openssl rand -hex 32)
printf '客户端 Token：%s\n' "$SYNC_TOKEN"
export QTERM_SYNC_TOKEN_SHA256="$(printf '%s' "$SYNC_TOKEN" | sha256sum | cut -d ' ' -f 1)"
export QTERM_SYNC_DATA_DIR="$HOME/.local/share/qterm-sync-manual-test"
export QTERM_SYNC_LISTEN='127.0.0.1:8080'
unset SYNC_TOKEN
cargo run --locked --manifest-path services/qterm-sync/Cargo.toml
```

保存终端输出的原始 Token。在另一终端执行 `curl -fsS http://127.0.0.1:8080/healthz` 检查服务。在 Qterm 的 **系统设置 → 同步** 中启用同步，填写 `http://127.0.0.1:8080` 和原始 Token，在“本地网络”行勾选“允许 HTTP”，保存后点击“立即同步”。

按 `Ctrl+C` 停止服务；同一终端再次执行最后一条 `cargo run` 命令即可使用相同摘要与数据库重启。重新执行整段命令会生成新 Token，需要在客户端替换，数据库保持不变。8080 被占用时，将监听地址、健康检查和客户端地址统一改为其他端口。

验证双向同步时，使用两个独立配置目录的 Qterm 客户端连接同一服务，不要共享桌面配置目录。首次同步会合并已有连接，建议使用独立桌面测试配置目录。

## Docker 部署

在 Linux 上生成 32 字节随机 Token 并计算摘要（需要 OpenSSL 和 `sha256sum`）：

```sh
SYNC_TOKEN=$(openssl rand -hex 32)
printf '客户端 Token：%s\n' "$SYNC_TOKEN"
printf '%s' "$SYNC_TOKEN" | sha256sum
unset SYNC_TOKEN
```

保存原始 Token 供客户端填写；摘要输出取开头的 64 位十六进制值。

Compose 位于 `docker/compose.yaml`，固定使用 `ghcr.io/qiubai-lab/qterm-sync:0.5.0`，无需配置镜像环境变量。该版本需先通过 `v0.5.0` 标签发布成功；升级时直接修改 Compose 中的镜像版本。

直接编辑 `docker/compose.yaml`，无需 `.env` 文件，将摘要占位符替换为生成的值：

```yaml
ports:
  - "127.0.0.1:8080:8080"
environment:
  QTERM_SYNC_TOKEN_SHA256: "替换为64位十六进制摘要"
  QTERM_SYNC_LISTEN: "0.0.0.0:8080"
  QTERM_SYNC_DATA_DIR: "/data"
```

容器内监听地址保持 `0.0.0.0:8080`，宿主机开放地址在 `ports` 中配置。数据目录 `/data` 对应持久化数据卷。未替换摘要占位符时服务会拒绝启动。

```sh
docker compose -f docker/compose.yaml up -d
```

以上 Compose 命令均从仓库根目录运行。项目名固定为 `qterm-sync`，默认沿用 `qterm-sync_sync-data` 数据卷；从旧位置迁移且原来使用过 `-p` 自定义项目名时，请继续指定相同项目名以复用原数据卷。

默认绑定主机回环地址 8080，由本机反向代理提供 HTTPS，并将请求转发至 `127.0.0.1:8080`。可给服务器 URL 添加代理前缀路径，代理需将对应的 `/v1/catalog` 路由转发给服务。不要缓存该接口。公网部署应在代理层配置请求速率和连接数限制，服务自身限制请求/响应目录大小，不提供用户注册、团队权限或公网滥用防护系统。

需要局域网直连时，将 `ports` 中的 `127.0.0.1` 改为服务器的具体局域网地址，限制防火墙来源，并在客户端的“本地网络”行显式勾选“允许 HTTP”。HTTP 会以明文传输 Token 和连接信息，默认不允许。

在 **系统设置 → 同步** 中输入服务根地址和原始 Token。Token 由 Windows Credential Manager、macOS Keychain 或 Linux Secret Service 保存；Linux 需要已启动并解锁的 Secret Service。安全存储不可用时会拒绝保存 Token，不降级为明文文件。配置地址变更需要重新输入 Token。关闭同步保留已有本机连接与安全存储中的 Token。

目前每个服务实例对应一个共享目录和一个访问 Token。多台设备使用同一 Token。轮换时更新服务端摘要，并在各设备替换 Token；数据保持不变。不同用户的独立目录应使用不同服务实例和数据卷。

## 同步行为与一致性

- 首次同步按稳定 ID 合并两端目录；同名不同 ID 的连接不会静默去重。同名分组无法合并时需先重命名。
- 服务使用 SQLite `profile_groups`、`profiles`、`profile_jumps` 和 `metadata` 表，不存储整个 JSON 配置文件。API 使用版本化 JSON DTO，不依赖桌面配置文件 schema。
- 第一版采用有界完整目录读取、实体级三方合并和目录 revision CAS。服务在事务中替换规范化记录并递增 revision；无变化时不写数据库。该版本不维护增量游标、历史版本或无限增长的删除日志。
- 客户端在 `device/sync-checkpoint.json` 保存上次确认的目录基线。远端缺失的旧条目可据此识别为删除；从未同步过的新设备会按首次合并处理。不得单独删除基线来“修复”同步，否则旧本地条目可能被当作新条目上传。
- 定时同步约 30 秒一次；失败后退避至最多 5 分钟。应用关闭期间不会同步，离线编辑在下次联网时核对。可使用“立即同步”。
- 同一条目的并发修改或编辑/删除冲突会暂停同步。在设置页确认所有列出的冲突采用本机或服务器版本，无冲突记录仍合并。确认前再次核对两端版本，过期选择不会覆盖新数据。
- 合并后若分组或跳板机引用失效，会停止提交，需在连接管理修复引用。跳板机是显式有序路径，最多四个节点，不递归展开节点自己的路径。
- 接收的连接在本机没有凭证绑定时仍可保存；执行连接时继续要求有效凭证。认证目标（主机、端口、用户名、认证方式）变化会清除本机绑定，避免误用旧凭证。
- 服务提交与本地应用间使用持久恢复记录；本地应用采用锁内比较和原子写入，发生竞态时保留待恢复记录。恢复中的新冲突同样需要人工选择。
- 远端删除的连接如果仍有本机网络规则，暂停本地应用，需先在本机删除相关规则。同步不会创建、重连或关闭 SSH 会话。
- 服务 ID 变化、revision 回退或同版本内容变化会停止同步。恢复备份后应保留并核对各端数据，不盲目清除客户端基线。

容量：单目录最多 2048 个连接及 2048 个分组；协议上限 4 MiB，同步目录的紧凑 JSON 上限 1 MiB，为原有配置文件的格式和本机字段保留空间。连接配置对服务管理员可读，不是端到端加密。

## 数据与升级

容器以非 root 用户运行，SQLite 数据目录为 `/data`，必须挂载整个目录。Compose 的命名数据卷会保留容器重建后的数据。SQLite WAL 需要本地文件系统，不使用跨机器 SMB/NFS 共享数据库，也不让多个服务实例共享这个文件。

更新前使用 SQLite 在线备份机制，或停止容器后完整备份数据目录（包括 WAL 等文件）。更新命令：

```sh
docker compose -f docker/compose.yaml pull
docker compose -f docker/compose.yaml up -d
```

固定版本或镜像 digest，避免自动追随可变标签。服务检查数据库 `user_version`；高于支持版本时拒绝打开，不进行破坏性降级。回退镜像前确认数据库兼容，必要时恢复升级前备份。恢复旧备份可能使客户端检测到 revision 回退并暂停，这是保护行为。

## 开发验证

```sh
cargo test --locked --manifest-path crates/sync-core/Cargo.toml
cargo test --locked --manifest-path services/qterm-sync/Cargo.toml
cargo clippy --locked --manifest-path services/qterm-sync/Cargo.toml --all-targets -- -D warnings
pnpm check
```

桌面端另执行仓库要求的 Rust fmt、clippy、tests；新增 native credential-store/HTTP 依赖的打包应在各目标平台验证。
