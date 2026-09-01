---
id: QB-20260820-public-project-documentation-and-gpl-license
status: archived
archived: 2026-09-02
legacy: true
---
# Qterm 公开项目文档与 GPLv3 授权实施计划

## Summary

将现有根 README 的开发内容迁移到独立开发指引，以 `Qterm` 品牌重建公开项目首页；加入官方 GPLv3 全文，并在 Node/Rust 元数据中统一声明 `GPL-3.0-only`。

## Planned Changes

### 1. 许可证与元数据

- 新增根目录 `LICENSE`，内容与 SPDX 发布的 GNU GPL version 3 标准文本完全一致。
- 在 `package.json` 添加 `license: "GPL-3.0-only"`。
- 在 `src-tauri/Cargo.toml` 添加 `license = "GPL-3.0-only"` 与公开项目 README 路径。
- 不填写尚未确定的 repository、homepage、authors 真实身份或联系地址。

### 2. 开发指引迁移

- 将原 `README.md` 中面向贡献者的环境、Windows 工具链、启动方式、质量检查和依赖策略迁移到 `docs/DEVELOPMENT.md`。
- 根据仓库脚本将推荐的完整前端检查统一为 `pnpm check`，保留 Rust 格式化、Clippy、测试、集成测试和审计命令。
- 链接现有故障排查、安全模型和 qb-spec 上下文，不把产品首页变成实现细节清单。

### 3. 公开项目 README

- 以 `Qterm` 为标题，给出简洁定位、项目状态和当前支持平台。
- 依据当前 Product Spec 介绍 Workspace、多终端布局、SSH 认证、主机密钥、安全凭证库和 SFTP Files Block。
- 提供从源码运行、质量检查和 GitHub Actions 构建产物入口，并链接详细开发指引。
- 增加安全说明、文档导航、贡献说明和 GPLv3 授权说明；明确 GPL 允许商业使用。
- 不加入未知仓库地址、虚构下载链接、维护者信息或不存在的截图。

## Risks and Controls

| Risk | Control |
| --- | --- |
| 将 GPL 错写成禁止商业使用 | README 明确商业使用被允许，并链接完整许可证。 |
| 许可证正文抄录错误 | 与 SPDX 标准文本逐字节比较。 |
| README 功能描述落后或夸大 | 以当前 Product Spec、代码入口和工作流为依据。 |
| 文档重命名产生断链 | 自动遍历 Markdown 相对链接并检查目标。 |
| 覆盖工作区中无关的用户修改 | 只修改本计划列出的文档和两个元数据文件。 |

## Acceptance Mapping

| Acceptance criterion | Evidence |
| --- | --- |
| GPLv3 正文与 only 语义 | `LICENSE` 比对；Node/Cargo SPDX 字段。 |
| 公开 README 完整准确 | README 内容审阅与关键词检查。 |
| 原开发信息完成迁移 | `docs/DEVELOPMENT.md` 内容审阅。 |
| 文档链接有效 | 本地 Markdown 链接检查脚本。 |
| 元数据合法 | JSON 解析与 `cargo metadata`。 |

## Verification Commands

```powershell
cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1
pnpm exec prettier --check package.json
git diff --check
```

许可证文本和 Markdown 链接使用只读 PowerShell 检查完成。本次不运行 `pnpm tauri build`；文档与许可证元数据不影响桌面二进制行为。
