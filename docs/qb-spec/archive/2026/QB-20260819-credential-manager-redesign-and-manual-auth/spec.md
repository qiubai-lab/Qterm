---
id: QB-20260819-credential-manager-redesign-and-manual-auth
status: archived
archived: 2026-09-02
legacy: true
---
# Credential Manager Redesign And Manual Authentication

Status: implemented and verified on 2026-08-19.

## Goal

让凭证管理成为与连接管理一致、空间稳定且可直接使用的独立管理界面；让连接配置可以选择“手动”认证，在每次连接时临时选择密码、已有凭证或 SSH Agent，同时清理开发阶段不再需要的历史配置兼容层。

## Scope

- 重新设计凭证管理弹窗，修复双栏内容未撑满弹窗、列表区提前结束及右侧空态位置异常的问题。
- 凭证管理沿用连接管理的视觉语言：固定工具栏、紧凑列表、明确选中态、可滚动内容区、右侧编辑/详情区和底部操作区。
- 密码与私钥创建入口固定在左栏顶部；凭证列表独立滚动。选择已有凭证后，右侧显示安全元数据和删除入口，不显示 UUID 或秘密正文。
- 用户选择私钥详情时，Rust 后端立即从已解锁的私钥凭证自动派生标准 OpenSSH 公钥，前端只接收公钥文本并允许通过标题行图标按钮复制。公钥组件位于详情说明之后、删除操作之前，作为唯一可伸缩区域填满剩余高度；超长内容只在字段内部滚动，不推动凭证管理详情页产生整体滚动。
- 连接配置增加持久化认证偏好 `manual`，界面显示为“手动”。手动连接每次都打开认证弹窗，不自动解锁或自动提交认证材料。
- 手动认证弹窗提供三个临时选项：一次性密码、凭证库中的已有凭证、SSH Agent。弹窗选择结果只用于本次会话，不回写 profile，不创建或更新凭证。
- 选择已有凭证时，若 vault 锁定，只在用户明确选择该路径后请求主密码；密码与 SSH Agent 路径不需要解锁 vault。
- 连接编辑器的“引用凭证”改为横向组合控件：左侧可伸缩选择控件，右侧“管理凭证”按钮。凭证库锁定时仍显示当前关联凭证的名称、类型/算法等非敏感摘要，点击选择控件先打开主密码解锁弹窗，成功后才能更改引用。按钮打开凭证管理后保留当前未保存的连接编辑状态，关闭凭证管理时刷新 vault 状态和凭证列表。
- 删除所有只服务于旧配置读取或自动迁移的代码：旧 app-data 文件复制、profile v1-v3 reader、vault v1 reader/migrator、workspace v1-v3 reader/migrator，以及前端遗留 `privateKeyPath` 字段。
- 当前格式继续使用 `connections.json` schema v4、`secrets.vault` schema v2、`workspaces.json` schema v4；reader 只接受精确的当前版本。旧文件返回稳定的 unsupported-version 错误，不自动覆盖、不自动删除。

## Constraints

- 密码、主密码、私钥正文、私钥口令和 vault data key 不得写入 profile/workspace、日志或普通元数据 IPC。
- `manual` 是 profile 的连接策略，不是新的 SSH 协议认证材料；session transport 继续只接收 password、stored credential、private key 或 SSH Agent 等可执行认证请求。
- “凭证”手动选项只引用既有 credential ID；选择后不得将 ID 写回当前连接配置。
- 凭证管理作为连接编辑器的上层弹窗时，父弹窗保留挂载状态并禁止误关闭；焦点、Escape 和关闭动作只影响最上层弹窗。
- 动效只使用 `transform` 与 `opacity`，默认约 140–180ms、无弹跳；`prefers-reduced-motion: reduce` 下改为短淡入或无位移。
- 清理兼容层不等于降低数据安全校验：文件大小限制、未知字段拒绝、敏感字段拒绝、原子写入、密文认证和未知 schema 拒绝必须保留。

## Non-Goals

- 不实现旧配置导入器、备份恢复、云同步、同步冲突合并或自动删除不兼容文件。
- 不在手动认证弹窗中新增、编辑或删除凭证；管理操作仍归凭证管理弹窗。
- 不把一次性密码保存到 vault，也不把临时认证选择保存为连接默认值。
- 不改变 `~/.qterm` 与设备本地 app-data 的既定文件归属。
- 不重做 SSH Agent、主机密钥校验或 SSH 底层认证实现。

## Approach Comparison

### A. 精确当前版本 reader + 显式失败（推荐）

删除所有历史 record/migrate 分支，只解析当前 schema。旧文件保留原样并返回稳定错误。代码最小、行为可预测，也不会用“开发阶段”作为静默删数据的理由。

### B. 启动时检测旧文件并自动重置

实现最简单，但会静默丢失用户仍可能需要检查的数据，也把数据清理副作用放进组合根。即使处于开发阶段，也不推荐。

### C. 保留 reader、停止写回迁移

短期风险最低，但兼容 DTO、分支和测试仍会长期存在，不满足本次删除兼容层的目标。

## Acceptance

1. 凭证管理内容始终占满 header 以下的可用高度；左侧工具栏固定、列表独立滚动，右侧空态/编辑态/详情态不再产生预期外的大块空白或页面级滚动。
2. 凭证管理的边栏、列表密度、选中态、表单、底部操作区和反馈样式与连接管理保持一致；凭证名称是主视觉，类型与算法为次要信息，界面不展示 UUID。
3. 新建、选择、取消、删除和清空 vault 的现有能力保持可用，破坏性操作仍二次确认。
4. 连接认证方式可保存为“手动”；此类连接每次连接都打开认证弹窗，绝不自动使用上次选择。
5. 手动弹窗可用一次性密码、已有密码/私钥凭证或 SSH Agent 发起连接；选择结果不修改 profile 和 vault。
6. 手动选择已有凭证时，锁定 vault 会要求解锁；取消解锁返回认证弹窗，不会错误关闭连接管理或发起连接。
7. 连接编辑器的凭证下拉框与“管理凭证”按钮水平排列；管理弹窗关闭后列表刷新，尚未保存的连接字段保持不变。
8. 启动组合根不再复制旧 `profiles.json` / `credential-vault.json`；profile、vault、workspace persistence 不再包含旧版本 record、migration 函数或 migration tests。
9. 当前 schema 可正常 round-trip；旧 schema 返回 unsupported-version 且源文件字节保持不变；敏感字段拒绝与加密安全测试继续通过。
10. 键盘焦点、Escape、Tab 顺序和 reduced-motion 行为在独立凭证弹窗及连接编辑器上层凭证弹窗中均正确。
11. 点击私钥凭证后自动生成并显示 OpenSSH 公钥，无需再次点击生成；请求只包含 credential ID，私钥正文和口令不进入 WebView。标题、说明和图标复制按钮保持同一行，公钥内容填满剩余高度且不会使凭证详情页产生整体滚动。

## Acceptance To Verification

| Acceptance | Verification |
| --- | --- |
| 1、2、10 | CredentialDialog RTL 行为测试、样式声明测试和桌面窄/高窗口人工截图检查。 |
| 3 | 新建密码、导入私钥、选择详情、删除确认、清空确认的 RTL 回归测试。 |
| 4、5、6 | configured-auth、WorkspaceShell、ConnectionAuthDialog 测试，覆盖三种临时路径、锁定/取消/成功与不持久化。 |
| 7 | ConnectionDialog 测试管理按钮、弹窗层级、编辑草稿保留和关闭后刷新。 |
| 8、9 | Rust repository/vault/composition-root focused tests；旧 schema fixture 只断言拒绝和源文件不变。 |
| 11 | Rust 确定性私钥 fixture 验证公钥派生且输出不含私钥标记；bridge/RTL 覆盖窄化 IPC、生成、展示、复制；样式声明测试验证字段自适应与内部滚动上限。 |
| 全部 | `pnpm check`；`cargo fmt --check`；`cargo clippy --all-targets --all-features -- -D warnings`；`cargo test --all-targets --all-features`。 |

## Open Questions

- 无。按用户给出的“密码/凭证/agent”定义，手动弹窗不再提供直接选择一次性私钥文件；临时私钥通过已有凭证使用，避免重新引入设备路径依赖。

## Recommended Approach

采用方案 A。UI 复用连接管理的布局语义但不强行抽出万能组件；认证策略由 profile domain 表达，临时认证选择由 WorkspaceShell 与认证弹窗编排，credential material 仍只在 Rust session 路径解析；兼容清理限定在 persistence adapter 和组合根，不侵入 domain。

## Next Skills

- `writing-qb-plans`：Strict 计划。
- `checking-architecture-boundaries`：明确 profile 策略、临时 UI 状态、session auth 与 persistence record 的职责。
- `protecting-critical-behavior`：保护认证不持久化、vault 解锁和 schema 拒绝行为。
- `verifying-before-completion`：执行前后端完整门禁与桌面视觉检查。
- Directory Map: 不需要新增目录或移动模块；若实现中没有发生结构变化，只更新现有文件职责说明。
