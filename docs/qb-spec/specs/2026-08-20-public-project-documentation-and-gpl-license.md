# Qterm 公开项目文档与 GPLv3 授权 Task Spec

## Objective

为迁移到 GitHub 后的公开仓库建立清晰、可信的项目入口，并将整个项目明确授权为 `GPL-3.0-only`。

## Background

当前根 `README.md` 仍使用旧名称 `Terminal Demo`，混合了产品介绍、开发环境和质量检查，同时部分能力描述已落后于实现。仓库尚无顶层许可证文件，Node 与 Rust 包元数据也没有声明许可证。

用户已明确选择 `GPL-3.0-only`。该许可证允许包括商业用途在内的运行、修改和分发，但分发程序或衍生作品时必须遵守 GPLv3 对相应源码、许可证保留和同许可证授权等要求。

## In Scope

- 以当前界面和项目决策中的公开品牌 `Qterm` 重写根 `README.md`。
- 将原 README 中的环境安装、开发命令、质量检查和依赖策略迁移为 `docs/DEVELOPMENT.md`。
- 在仓库根目录加入未经修改的 GNU GPL version 3 官方英文全文，并以 SPDX 标识 `GPL-3.0-only` 表达“仅此版本”。
- 在 `package.json` 与 `src-tauri/Cargo.toml` 中补充一致的许可证元数据。
- 在 README 中准确描述当前产品能力、支持平台、构建产物、项目状态、文档入口、贡献方式与授权边界。

## Out of Scope

- 不重写 Git 历史、不迁移或发布 GitHub 仓库。
- 不补写尚未确定的 GitHub 仓库 URL、维护者姓名、联系方式、截图或版本下载链接。
- 不修改应用包名、Tauri product name、bundle identifier、运行时代码或产品功能。
- 不新增贡献者行为准则、安全漏洞报告渠道或发布流程；这些信息需要仓库所有者在 GitHub 身份和联系方式确定后补充。

## Acceptance Criteria

1. 根目录存在完整的 GNU GPL version 3 许可证正文，项目授权标识为 `GPL-3.0-only`。
2. README 明确说明 GPLv3 允许商业使用，且分发和衍生作品需继续遵守 GPLv3，不能再出现“禁止商业使用”的承诺。
3. 根 README 使用 `Qterm` 品牌，能让首次访问者快速理解项目定位、主要功能、平台支持、安装/构建入口、成熟度和安全边界。
4. 原 README 的开发环境、Windows 安装、开发命令、质量检查和依赖升级信息在 `docs/DEVELOPMENT.md` 中保留并按当前仓库命令更新。
5. README 对 SSH Agent、加密凭证库、主机密钥、Workspace 和 SFTP 的描述与当前产品规范一致，不再保留已过时的 MVP 能力说明。
6. README、开发指引和已有文档之间的相对链接均指向存在的文件。
7. `package.json` 与 `src-tauri/Cargo.toml` 的许可证字段均为 `GPL-3.0-only`，Cargo 元数据可正常解析。

## Verification

- 将顶层许可证与 SPDX 维护的 `GPL-3.0-only` 标准文本进行逐字节比较。
- 检查所有本地 Markdown 链接的目标存在。
- 运行 `cargo metadata --manifest-path src-tauri/Cargo.toml --no-deps --format-version 1` 并确认许可证元数据。
- 运行 JSON 解析检查与 `git diff --check`。
- 本次只改文档与包元数据，不运行桌面安装包构建。

## Skill Routing

- `shaping-requirements`：已用于澄清“禁止商业使用”与 GPL 的冲突并确认最终许可。
- `writing-qb-plans`：采用 Standard 计划，因为涉及多个文档、许可证全文与包元数据的一致性。
- `verifying-before-completion`：用于验证标准许可证文本、链接和元数据。
- Architecture Boundaries：不需要；不修改模块或运行时代码。
- Critical Behavior：不需要；不改变产品行为。
- Directory Map：不需要；根 README 入口保持不变，新增文件位于既有 `docs/` 文档目录，不改变代码结构或所有权边界。
