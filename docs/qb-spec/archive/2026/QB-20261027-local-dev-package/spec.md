---
schema: 1
id: QB-20261027-local-dev-package
type: feature
tier: standard
status: archived
created: 2026-10-27
updated: 2026-10-27
supersedes: []
---

# 本机平台标准打包与安装

授权：用户最终明确要求沿用标准构建流程、Qterm 名称、用户自行设置的版本号及现有配置；不生成额外开发版或版本号。本次提供命令与验证，不自动替换用户已安装的应用。

- REQ-001：提供当前平台和显式 macOS/Windows/Linux 构建入口；错误宿主在构建前拒绝。所有入口走现有 tauri build，SDK、名称、版本与配置策略保持不变。
- REQ-002：单命令构建并安装/更新本机标准版。macOS 替换 /Applications/Qterm.app；Windows 运行 NSIS 安装向导；Linux 使用 apt/dnf 安装本地产物。保留现有应用配置，不创建新数据分区；构建失败不安装。
- REQ-003：本地安装只采用本次成功构建的指定格式产物；macOS 拒绝未知目标或运行中的应用，替换失败恢复旧包。安装行为仅由用户显式执行 install-local 触发。
- REQ-004：文档说明平台命令、版本设置、产物位置、标准本地安装/升级/启动方式以及 Windows/Linux 实机验证边界。

## Behavior Delta

### ADDED
- REQ-001：可显式选择与当前宿主匹配的平台构建入口。
- REQ-002：可一条命令构建并本地安装标准 Qterm。

## 验收与实现

- AC-001 [REQ-001]：三平台计划与错误宿主拒绝有测试；实际 macOS 标准构建验证原生 bundle；生产 SDK 校验不变。
- AC-002 [REQ-002]：构建失败不安装；安装器使用本次产物，配置/版本不改写；Makefile/pnpm 入口一致。
- AC-003 [REQ-003]：临时目录测试复制、替换、未知目标拒绝和失败恢复；当前机器不替换用户真实安装。
- AC-004 [REQ-004]：文档、帮助、产物路径一致；脚本测试、尺寸检查与 pnpm check 通过；Windows/Linux 未实机验证明确记录。

- [x] scripts/desktop-package.mjs 拥有平台计划与构建编排，scripts/install-local.mjs 拥有 macOS 本地 app 替换；各脚本低于 400 行。
- [x] 通过既有 scripts/tauri.mjs 标准 build 调用，不改业务、版本、开发配置或 CI。
- [x] Makefile/pnpm 与文档、Directory Map 补全入口。
- [x] 完成脚本测试、临时目录安装演练、真实 macOS 构建和仓库检查，记录并归档。

质量/架构检查：已按用户后续澄清重塑范围，不采用先前提出的独立开发版身份/时间戳方案。版本仍由 Cargo.toml 提供；标准 release 使用既有数据目录。构建与系统安装适配分开，用户应用替换仅发生在显式安装入口。

## 验证证据

- AC-001：`make package-macos` 实际通过，生成 `src-tauri/target/release/bundle/macos/Qterm.app` 与 `dmg/Qterm_0.6.0_aarch64.dmg`；`xcrun vtool -show-build` 确认 SDK 26.5。CLI 实际拒绝在 macOS 使用 `--platform windows`；三平台计划与格式由脚本测试覆盖。
- AC-002：标准版本 0.6.0、identifier com.qiubai.qterm 经真实 bundle plist 校验；未修改 Cargo 版本、应用名或开发配置。构建失败、输出目录含空格、Windows/Linux 安装指令与唯一新产物选择均通过自动化测试。
- AC-003：真实已签名应用包在临时目录执行两次 installMacApp，安装与覆盖更新均通过；未替换 /Applications/Qterm.app。未知 app、symlink、运行中 app、复制/签名失败、提交失败恢复和恢复失败保留备份均通过测试。
- AC-004：`pnpm check` 全部通过（247 文件/1485 前端测试通过，1 文件/2 测试既有跳过；40 脚本测试通过；lint、类型、构建、尺寸检查通过）。Make help、dry-run 与 git diff --check 通过；README/开发指引/Directory Map 已更新。
- Windows/Linux 仅有命令/安装流程自动化覆盖，未在相应系统实机打包安装；macOS 本地包为既有 ad-hoc 签名，未进行 Apple 公证，未发布任何产物。
