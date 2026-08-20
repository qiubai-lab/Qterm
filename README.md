# Qterm

轻量、安全、跨平台的 SSH 终端与远程文件工作台。

Qterm 基于 Tauri 2、React、TypeScript 和 Rust 构建，将多个持久 Workspace、可拆分终端、SSH 连接管理与 SFTP 文件操作集中在一个桌面应用中。目前项目处于早期开发阶段，数据格式与交互仍可能调整，建议在重要环境中使用前自行评估并保留备份。

## 功能概览

- **多 Workspace 工作台**：每个顶部标签都是独立 Workspace，可横向或纵向分割 Terminal / Files Block、拖动比例、最大化和重排布局。
- **完整 SSH 认证入口**：支持一次性密码、加密保存的密码或 OpenSSH 私钥凭证，以及系统 SSH Agent。
- **严格主机密钥确认**：首次连接显示 SHA-256 指纹并要求明确接受；已信任主机的密钥发生变化时默认阻断连接。
- **加密凭证库**：主密码通过 Argon2id 派生密钥，密码、私钥和可选口令使用 AES-256-GCM 分项加密；应用启动时凭证库保持锁定。
- **SFTP 文件工作区**：Files Block 可独立连接本机或远程目标，支持目录浏览、上传、下载、预览与文本编辑。
- **跨平台桌面体验**：面向 Windows、macOS 和 Linux，使用统一的紧凑型无边框工作台界面。

更完整的安全边界与残余风险见[安全模型](docs/security-model.md)。

## 支持平台

GitHub Actions 配置会为下列目标生成安装产物：

| 平台 | 架构 | 构建目标 |
| --- | --- | --- |
| macOS | Apple Silicon / ARM64 | `aarch64-apple-darwin` |
| Windows | x64 | `x86_64-pc-windows-msvc` |
| Linux | x64 | `x86_64-unknown-linux-gnu` |

macOS ARM64 版本适用于 M1、M2、M3、M4 及后续 Apple Silicon 芯片。当前仓库尚未提供正式 Release；可以从 GitHub Actions 的工作流产物下载测试构建，或按下方说明从源码运行。

## 从源码运行

需要 Node.js 22、pnpm 11.0.8、Rust 1.97.1 以及对应平台的 Tauri 系统依赖。

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev` 仅启动浏览器界面，不包含 Tauri IPC，因此不能建立真实 SSH/SFTP 连接。各平台环境安装、完整构建和测试命令见[开发指引](docs/DEVELOPMENT.md)。

## 常用操作

以下快捷键中的 `Mod` 在 macOS 上是 `Command`，在 Windows / Linux 上是 `Ctrl`。

| 操作 | 快捷键 |
| --- | --- |
| 新建 Workspace | `Mod+T` |
| 左右 / 上下分割当前 Block | `Mod+D` / `Shift+Mod+D` |
| 切换到第 1–9 个 Workspace | `Mod+1` … `Mod+9` |
| 循环切换 Workspace | `Shift+Mod+[` / `Shift+Mod+]` |
| 打开连接管理 | `Mod+K` |

双击 Workspace 标签可以重命名；拖动标签可以排序；拖动 Block 标题栏可以重排布局。

## 文档

- [开发与贡献指引](docs/DEVELOPMENT.md)
- [安全模型](docs/security-model.md)
- [故障排查](docs/troubleshooting.md)
- [产品目标](docs/qb-spec/context/PRODUCT_SPEC.md)
- [架构边界](docs/qb-spec/context/ARCHITECTURE_SPEC.md)

## 参与贡献

Issue、设计讨论、文档改进和 Pull Request 都欢迎。开始修改前，请先阅读[开发指引](docs/DEVELOPMENT.md)，保持前端与 Rust 后端的安全边界，并为认证、主机密钥、凭证持久化、Workspace 或文件传输等关键行为补充回归测试。

提交信息遵循 Conventional Commits，例如 `feat: add session search` 或 `fix: reject changed host keys`。Pull Request 应说明行为变化、安全或迁移影响以及已执行的验证；界面改动请附截图或录屏。

## 许可证

Qterm 采用 [GNU General Public License version 3](LICENSE)，SPDX 标识为 `GPL-3.0-only`。

GPLv3 **允许个人使用、修改、再分发和商业使用**。如果分发本程序的副本、二进制或衍生作品，需要同时满足 GPLv3 的相应源码提供、许可证与版权声明保留、修改标注及同许可证授权等要求。完整且具有约束力的条款以仓库中的英文许可证正文为准。
