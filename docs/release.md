# 发布流程

本文说明如何通过版本标签发布 Qterm 桌面安装包。相关流水线定义在 `.github/workflows/build-desktop.yml`。

## 触发方式

- **推送 `v*` 标签**：构建 macOS ARM64、Windows x64、Linux x64 三个平台的安装包，并将产物发布到与标签同名的 GitHub Release。
- **手动触发（workflow_dispatch）**：只构建并上传为 workflow artifacts（保留 14 天），**不会**发布 Release，用于验证打包改动。

## 发布前检查

1. `main` 分支最近一次 CI 全绿，尤其是三个平台的 Desktop build。
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
- `build` job：版本校验通过后三个原生 runner 并行构建（`fail-fast: false`，单平台失败不影响其他平台），产物先上传为 workflow artifacts，命名为 `qterm-{平台}-{commit sha}`。
- `release` job：仅在标签推送（`refs/tags/v*`）时运行，等待全部平台构建成功后，下载所有 artifacts 并通过 `softprops/action-gh-release` 把安装包附加到该标签的 Release。该 job 单独持有 `contents: write` 权限。
- Release 标题与正文由 action 默认生成，发布后可手动在 Releases 页面编辑补充更新说明。

流水线只收集最终安装包（见各平台 `bundlePath` glob），Tauri 的中间产物（如 AppDir 内容、`.app` 目录、构建用共享库）不会进入 workflow artifacts 和 Release：

- macOS ARM64：`.dmg`
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
