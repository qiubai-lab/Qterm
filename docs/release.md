# 发布流程

本文说明桌面安装包与 Web 容器镜像的发布。桌面流水线定义在 `.github/workflows/build-desktop.yml`；Web 流水线定义在 `.github/workflows/server.yml`。

## 触发方式

- **推送 `v*` 标签**：构建 macOS ARM64、macOS Intel、Windows x64、Linux x64 四个平台的安装包，并将产物发布到与标签同名的 GitHub Release。
- **手动触发（workflow_dispatch）**：只构建并上传为 workflow artifacts（保留 14 天），**不会**发布 Release，用于验证打包改动。

## 发布前检查

macOS 正式构建和发布使用 **macOS SDK 26.5**。`pnpm tauri build` 会通过 `xcrun` 显式选择并校验该 SDK；缺失时直接报错，不会退回其他 SDK。本机可使用包含该 SDK 的 Command Line Tools，或通过 `DEVELOPER_DIR` 选择包含该 SDK 的 Xcode。

`pnpm tauri dev` 优先使用 SDK 26.5；不可用时，通过 `xcrun --sdk macosx` 选择当前开发工具提供的 SDK，允许 26.5 或较新版本（例如 27.0），并打印实际版本、路径以及与发布版可能存在原生窗口差异的提示。旧版本、无法识别的版本或 SDK 路径缺失仍会报错。`DEVELOPER_DIR` 控制工具链选择；继承的 `SDKROOT` 不参与探测，成功后会替换为选定路径。这是开发便利策略，不表示所有较新 SDK 都已经验证兼容，也不改变应用的最低系统版本配置。

CI 的 macOS 构建使用 `macos-26` / `macos-26-intel`，显式选择 `/Applications/Xcode_26.5.app/Contents/Developer`，打印 Xcode 版本并隔离 SDK 缓存。发布构建还会检查最终二进制的 `LC_BUILD_VERSION`，避免缓存或工具链覆盖导致 SDK 不一致。升级 SDK 时需同步修改 `scripts/macos-sdk.mjs`、两个 workflow 和相关测试。

交通灯依赖 AppKit 的原生控件尺寸；仅校验 `trafficLightPosition` 数值无法证明视觉对齐。测试打包改动时先运行 `pnpm tauri build --bundles app`，使用 `xcrun vtool -show-build src-tauri/target/release/Qterm` 确认 `sdk 26.5`，再对照开发版检查初次打开、调整窗口大小、全屏返回后的交通灯。若开发版使用较新 SDK，涉及原生窗口的改动还需在 SDK 26.5 下复验；开发启动成功不能替代发布兼容性验证。之后可手动触发 workflow 验证两种 macOS 架构，验证完成前不要推送发布标签。

1. `main` 分支最近一次 CI 全绿，尤其是四个平台的 Desktop build。
2. 本地通过全部质量门：

   ```bash
   pnpm check
   cd src-tauri
   cargo fmt --check
   cargo clippy --all-targets --all-features -- -D warnings
   cargo test --all-targets --all-features
   ```

3. 修改唯一版本源 `src-tauri/Cargo.toml` 的 `package.version`，然后运行一次 `cargo check` 刷新 `Cargo.lock` 并一并提交。Tauri 安装包版本会自动读取该 Cargo 包版本。

版本号遵循语义化版本，标签格式为 `vX.Y.Z`，并与 `Cargo.toml` 的版本一致。标签发布流水线会在构建前自动校验二者；不一致时发布立即失败。

## 发布步骤

```bash
git switch main && git pull

# 更新 src-tauri/Cargo.toml 并运行 cargo check 后提交
git commit -am "chore: release v0.2.0"
git push origin main

# 打附注标签并推送
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

推送标签后，在 Actions 页的 **Build desktop artifacts** 工作流中观察执行结果。Release 发布成功后，按[发布后：更新 Homebrew tap](#发布后更新-homebrew-tap)同步更新安装渠道。

## 流水线行为

- `validate-release-version` job：标签触发时读取 Cargo 包版本并校验标签；手动触发时直接通过。
- `build` job：版本校验通过后四个原生 runner 并行构建（`fail-fast: false`，单平台失败不影响其他平台），产物先上传为 workflow artifacts，命名为 `qterm-{平台}-{commit sha}`。
- `release` job：仅在标签推送（`refs/tags/v*`）时运行，等待全部平台构建成功后，下载所有 artifacts 并通过 `softprops/action-gh-release` 把安装包附加到该标签的 Release。该 job 单独持有 `contents: write` 权限。
- Release 标题与正文由 action 默认生成，发布后可手动在 Releases 页面编辑补充更新说明。

流水线只收集最终安装包（见各平台 `bundlePath` glob），Tauri 的中间产物（如 AppDir 内容、`.app` 目录、构建用共享库）不会进入 workflow artifacts 和 Release：

- macOS ARM64：`.dmg`
- macOS Intel：`.dmg`
- Windows x64：`.msi`、NSIS `.exe`
- Linux x64：`.AppImage`、`.deb`、`.rpm`

## 发布后：更新 Homebrew tap

macOS 用户可以通过 Homebrew tap [qiubai-lab/homebrew-tap](https://github.com/qiubai-lab/homebrew-tap) 安装 Qterm。cask 会在安装后自动移除隔离属性，规避未公证应用的 Gatekeeper"已损坏"提示。每次 Release 发布后需要手动同步 tap 中的 cask 定义。

1. 获取新版本 dmg 的 SHA-256，两种方式任选其一：

   - **从 Release 页面直接复制**：打开对应 Release，展开 `Qterm_*_aarch64.dmg` 资产，复制其 `sha256:` Digest 值（GitHub 会为每个资产自动计算）；
   - **本地下载后计算**（以 `v0.1.3` 为例，注意替换版本号；先确认 Release 页面资产已齐全）：

     ```bash
     curl -fsSL -o /tmp/qterm.dmg \
       https://github.com/qiubai-lab/Qterm/releases/download/v0.1.3/Qterm_0.1.3_aarch64.dmg
     shasum -a 256 /tmp/qterm.dmg
     ```

2. 在 `homebrew-tap` 仓库中修改 `Casks/qterm.rb` 的两处字段并提交推送：

   - `version`：改为新版本号（不含 `v` 前缀）；
   - `sha256`：改为上一步获取的值。

3. 验证安装渠道：

   ```bash
   brew update
   brew upgrade --cask qterm          # 已安装的用户
   brew install --cask qiubai-lab/tap/qterm   # 首次安装
   ```

## 失败处理

- **某个平台构建失败**：`release` job 因 `needs: build` 不会执行，不会产生半成品 Release。修复问题后删除远端标签重新推送：

  ```bash
  git push --delete origin v0.2.0
  git tag -d v0.2.0
  # 修复并提交后重新打标签
  git tag -a v0.2.0 -m "v0.2.0"
  git push origin v0.2.0
  ```

- **release job 失败但构建成功**：可直接在 Actions 页重跑失败的 job，action 会将产物附加到已有（或新建的）同名 Release。
- **撤销已发布的版本**：在 Releases 页面删除对应 Release，再按需要删除远端标签。

## 注意事项

- 不要在 CI 未绿、Cargo 版本未提交的情况下打标签；标签推送即发布，没有二次确认。
- workflow artifacts 仅用于调试，14 天后自动删除；对外分发一律以 GitHub Release 为准。
- 涉及原生依赖、Tauri 配置或打包的改动，发布前应先用手动触发验证三平台构建。

## Web 容器镜像发布

Web 镜像与桌面 `v*` 标签发布相互独立。推送到 `main` 后，先执行质量与运行时检查，再构建、验收容器并自动发布到 GHCR。`dev`、`dev-webruntime` 的 push 和所有 PR 只执行 **Linux quality and runtime acceptance**，跳过容器构建与发布。维护者也可以在 `main` 手动触发：

1. 将待发布代码及 `.github/workflows/server.yml` 合入 `main`（合并产生的 push 会自动发布，无需再手动运行）。
2. 需要重新发布时，打开仓库 Actions → **Web server runtime** → **Run workflow**，选择 **main**。
3. 保持 `publish_image` 勾选并启动。取消勾选则执行完整验收但不发布。
4. 全部 job 成功后，从 **Container (linux/amd64)** 的 Summary 取得标签及 digest。使用该 digest 可以固定本地部署版本。

也可以使用已登录的 GitHub CLI：

```sh
gh workflow run server.yml --ref main -f publish_image=true
gh run list --workflow server.yml --branch main --event workflow_dispatch --limit 5
gh run watch RUN_ID --exit-status
```

GitHub 要求 workflow 文件存在于默认分支，才会提供网页的 **Run workflow** 入口。手动选择其他分支时只执行质量与运行时检查，即使勾选 `publish_image` 也不会构建或发布镜像。

流水线使用当前仓库的 `GITHUB_TOKEN` 登录 GHCR，不需要额外保存 PAT。只有容器 job 声明 `packages: write`；非 `main` 分支、PR 和取消勾选 `publish_image` 的手动运行不执行登录或推送。仓库/组织策略必须允许 GitHub Actions 写入 packages；若同名包已有独立权限，在该包的 **Manage Actions access** 中授权此仓库写入。首次发布后如需匿名拉取，请将包 visibility 设为 public；流水线不修改包可见性。

| 标签 | 行为 |
| --- | --- |
| `ghcr.io/qiubai-lab/qterm:main` / `:latest` | `main` 分支 push 自动发布或手动发布成功后更新 |
| `ghcr.io/qiubai-lab/qterm:sha-<完整 commit SHA>` | 追踪源码版本；重跑同一提交可能因基础镜像变化得到不同 digest，严格固定版本使用 digest |

不再发布 `dev`、`dev-webruntime` 或其他分支标签，也不支持直接发布 Git tag；最终标签以 Summary 为准。GHCR 仓库路径自动转为小写，fork 仓库会发布到自己的 owner/repository，需要相应修改部署的 `QTERM_IMAGE`。

Web 运行时 CI 仅针对 **Linux AMD64**，只有两个 job：

1. **Linux quality and runtime acceptance**：源码尺寸检查、lint、共享工作台测试、`test:web` 和 `build:web`，以及 Rust fmt、test、Clippy 和真实 HTTP/WebSocket/SSH 验收。类型检查由 `build:web` 执行一次，不生成桌面前端 `dist/`。本地与 SSH 的 Git 实时观察、凭证状态及访问记录也纳入验收。前端构建产物保留 7 天供排查。
2. **Container (linux/amd64)**：仅在 `main` 的 push 或手动运行中执行。等待质量检查通过，构建并确认镜像为 `linux/amd64`，运行 PTY、会话保留、接管、文件/Git Block、剪贴板与 Compose 冒烟测试。Compose 验收包含健康检查、静态 JS、登录、非 root/只读根文件系统、仅回环端口及重建后数据持久化。push 或手动触发且勾选 `publish_image` 时，在同一个 job 中将已测试镜像直接推送 GHCR，并输出标签和 digest。

不构建 Windows/macOS 原生 Web 服务，也不构建 ARM64 镜像；不再上传单架构临时标签、传递 digest artifacts 或执行多架构 manifest 汇总。推送使用验收过的本地镜像，不在验收后重新构建。开发分支不会覆盖 `latest`。

若构建或测试失败，推送步骤不会执行；修复后对新提交触发 workflow。如果推送中途失败，部分标签可能已更新，可重跑失败的容器 job；它会重新构建和验收，成功后再次推送。手动运行不会被同分支的普通 push 取消，同一分支的手动运行串行执行。

部署步骤见 [本地容器部署](container-deployment.md)。

### Web 流水线范围与重复检查

- `dev-webruntime` 的普通推送只匹配 `server.yml`；桌面 `ci.yml` 的 push 范围为 `main/dev`，站点 `site.yml` 的 push 范围为 `main`，桌面安装包仅由 `v*` 标签或手动触发。
- 提交到 `main` 的 PR 会同时运行 Web、桌面和站点检查，其中共享前端测试有重叠；这是不同产品入口的独立闸门。本次仅收敛 Web 运行时范围，桌面和站点流程继续负责各自产物。
- `pnpm test` 与 `pnpm test:web` 使用不同服务适配器：前者验证共享组件的桌面适配，后者验证 Web 适配，不能仅因测试文件重叠就删除其中一项。
- Linux 原生验收验证服务行为和真实 SSH；AMD64 容器验收额外验证 release 二进制、镜像依赖、非 root/只读环境及数据卷，因此保留这两层验收。
- Dockerfile 为独立源码构建保留了前端构建步骤，因此镜像 job 仍会再构建一次 Web 资源。以后可通过消费同一次 CI 的前端 artifact 减少此部分重复；当前上传的 artifact 用于排查，不是镜像构建输入。
