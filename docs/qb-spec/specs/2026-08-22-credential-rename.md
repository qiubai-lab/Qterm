# Credential Rename

Status: Complete (2026-08-22)

## Goal

允许用户在凭证管理器详情页中直接修改凭证名称，同时保持凭证 ID、加密内容和所有引用关系不变。

## Scope

- 在凭证详情标题旁提供持久可见的编辑入口。
- 点击后原位切换为透明的单线名称输入层，不改变标题行尺寸。
- 复用工作区交互：支持 Enter 或失焦保存、Escape 取消；保存过程中禁用重复操作。
- 对名称复用现有创建/导入规则：去除首尾空格、1–80 字符、拒绝控制字符。
- 新增 Tauri 重命名命令，并在 vault 中原子更新名称元数据。
- RSA 凭证编辑时继续显示“不安全”标签及其说明。

## Constraints

- 不重新加密凭证，不改变密文、nonce、凭证 ID、类型或详情元数据。
- 连接继续通过凭证 ID 引用，重命名不得破坏既有连接。
- 重命名属于 vault 写操作，vault 锁定时必须拒绝。
- 不引入第三方依赖，不调用系统工具或 shell 完成功能。
- 允许名称重复；凭证 ID 才是稳定身份。

## Non-Goals

- 不支持批量重命名。
- 不修改凭证类型、私钥算法、密码或私钥内容。
- 不调整 vault schema 或 profile schema。
- 不新增独立重命名弹窗或全局通用编辑组件。

## Interaction Alternatives

1. 详情标题原位单线编辑（推荐）：复用工作区编辑方式，上下文连续且不改变标题几何结构。
2. 独立重命名弹窗：确认意图更强，但为单字段操作增加了一层打断。
3. 名称始终显示为输入框：最直接，但会增加详情页视觉噪音并弱化只读状态。

## Acceptance

1. 详情页名称旁显示可访问的“修改名称”按钮，点击后原位进入编辑态并聚焦、选中当前名称。
2. 编辑态仅用与工作区一致的底部焦点线表示输入，不出现完整输入框边界；可通过 Enter 或失焦提交，通过 Escape 放弃，空白名称不可提交。
3. 成功后列表和详情同步显示规范化后的新名称，并展示成功反馈。
4. 后端对名称执行与创建/导入一致的校验；锁定、凭证不存在和存储失败沿用稳定错误映射。
5. 重命名只改变持久化记录的 `name`，凭证 ID、种类、详情和加密载荷逐字节保持不变。
6. RSA 风险标签在只读态和编辑态都保留，既有删除、复制公钥与显示公钥操作不回归。

## Acceptance To Verification

- 1–3、6：CredentialDialog Testing Library 行为测试与样式断言。
- 3–4：TypeScript IPC bridge 与 Rust command/DTO 测试。
- 4–5：application/vault Rust 回归测试，读取重命名前后 JSON 并比较非名称字段。
- 全部：Rust fmt/clippy/all-target tests 与 `pnpm check`。

## Open Questions

- 无。默认所有凭证类型均可重命名，允许重名，并沿用现有名称规则。

## Recommended Approach

React 只管理局部编辑状态并调用新的 `credential_rename` IPC；command 保持薄映射，application 复用名称规范化规则；vault port 增加重命名能力，由 JSON adapter 在解锁状态下原子更新记录元数据。该方案不改变领域身份模型与持久化 schema。

## Next Skills

- `writing-qb-plans`：由于新增公开 IPC 写操作，使用 Strict 计划。
- `checking-architecture-boundaries`：名称规则、用例编排和持久化写入保持分层。
- `protecting-critical-behavior`：先补 UI、IPC 和密文不变回归测试。
- `qterm-interface-design`：保持紧凑详情标题、键盘行为与风险标签稳定。
- `verifying-before-completion`：执行完整质量闸口。
- Directory Map: not needed；不改变目录、模块归属或入口位置。
