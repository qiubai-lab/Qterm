# Vault Recovery Key File

## Goal

用户在初始化凭证库时获得一份由自己保管的恢复密钥文件；忘记主密码后，可以凭该文件设置新的主密码，并继续访问原有凭证，同时不把主密码、data key 或凭证明文暴露给 WebView。

## Scope

- 初始化凭证库时先显示应用内保存确认，用户明确点击“保存到本地”后才打开系统保存文件对话框；选定目标后 Rust 后端生成独立的 256-bit 随机 recovery key 并写出恢复文件。
- `secrets.vault` 增加 vault identity、recovery generation 和由 recovery key 包装的同一个 data key。
- 凭证库锁定时提供“使用恢复文件重置主密码”流程：先选择旧恢复文件并在 Rust 后端完成格式、vault ID、generation 与 AEAD 有效性校验；只有验证成功后才显示新主密码输入，密码确认通过后再次由用户确认，才打开新密钥保存窗口并重新包装 data key。
- 成功重置时轮换 recovery key，写出新的恢复文件并使旧文件失效。
- 初始化、恢复文件保存、vault 原子写入与取消路径必须保持一致状态，不产生“界面提示已启用恢复但实际不可恢复”的结果。
- 不提供 v2 vault 升级路径；检测到旧版 `secrets.vault` 时允许清除该文件及全部失效的 profile 凭证引用，随后按新格式重新初始化。

## Constraints

- 恢复文件是高敏感 bearer secret；不得包含主密码、凭证明文或裸 data key，不得进入日志、剪贴板、前端 state、Workspace、profile 或普通查询 IPC。
- 恢复密钥及文件读写只存在于 Rust；前端只接收成功、取消及稳定错误码。
- 使用系统文件选择器；默认文件名严格为 `qterm-recovery-{Unix 时间戳}.key`，不得包含主机名、用户名、凭证名称或其他标识。
- 恢复文件至少包含独立 schema version、随机 vault ID、recovery generation、base64 recovery key 和用途标识；严格拒绝未知字段、超限文件、错误版本、错误 vault ID、错误 generation、无效编码和篡改内容。
- recovery key 直接作为 AES-256-GCM KEK 使用；它已经具备 256-bit 熵，不再使用 Argon2。vault 中 recovery-wrapped data key 的 AAD 必须绑定 vault schema、vault ID、generation 和用途。
- 主密码路径继续使用当前 Argon2id 参数；重置只重新包装同一个 data key，不逐条重加密凭证。
- 新恢复文件不得默认保存在 `secrets.vault` 同目录；UI 应明确提示与 vault 分开、离线保管。应用不能完全阻止用户选择同目录，因此需要警告而非伪造安全保证。
- Unix 尽力创建为仅当前用户可读写；Windows 使用用户选择位置并避免放宽 ACL。平台无法保证外部同步盘或备份工具的访问控制，界面必须提示其风险。
- 任何失败不得覆盖可用 vault。临时文件、目标存在、用户取消、权限错误和磁盘写入失败均返回稳定结果。
- 旧版本清理仅限 `secrets.vault` 和指向其中凭证的 profile 引用；不得删除连接、分组、Workspace、known-hosts、安全设置或存储目录定位配置。清理失败不得伪报成功或继续初始化。

## Non-Goals

- 不恢复或显示遗忘的旧主密码。
- 不通过邮箱、云服务、系统账号或厂商服务器托管恢复密钥。
- 不把恢复文件作为日常解锁方式。
- 首期不支持多份并行有效的恢复文件、Shamir 分片、硬件密钥或助记词。
- 不自动搜索磁盘上的恢复文件。

## Acceptance

1. 新建 vault 只有在用户成功保存恢复文件后才完成初始化；取消保存时 vault 保持未初始化。
2. 恢复文件、`secrets.vault` 和前端可观察数据中均不存在主密码或凭证明文；恢复文件不含裸 data key。
3. 正确恢复文件与合格的新主密码可重置主密码；旧主密码随后失效，全部既有密码和私钥凭证保持可读。
4. 错误 vault 的恢复文件、已轮换的旧恢复文件、篡改或畸形文件、弱新密码均安全失败，且 vault 字节完全不变。
5. 成功恢复会生成并保存替代恢复文件、提升 generation，并使此前恢复文件失效；若替代文件保存失败或用户取消，vault 不发生变化。
6. 恢复成功只改变 KDF、password-wrapped data key、recovery-wrapped data key、recovery generation 及必要元数据；credential ciphertext、ID 和 profile 引用不变。
7. 检测到 v2 或其他旧版 vault 时不尝试读取、解密或迁移其凭证；用户执行重新初始化流程时清除旧 vault 及全部失效引用，但保留连接、分组、Workspace 和其他设备配置。
8. 初始化和恢复全程不把 recovery key、data key 或私钥正文传入 WebView、日志、错误文本或 panic 输出。
9. 完成初始化与恢复后沿用现有凭证解锁 session 和自动锁定调度语义。
10. 初始化与恢复轮换在每次调用系统文件选择器前显示明确的应用内确认步骤；恢复流程必须先选择并完整验证旧密钥，验证通过前不得显示或收集新主密码。新密码确认后必须先返回应用显示“保存新恢复密钥”确认，只有用户再次点击才打开保存窗口。用户取消文件选择视为正常中止，保持当前确认步骤且不显示错误。
11. 两阶段恢复过程中旧密钥与待保存的新密钥只暂存在 Rust 内存；用户返回、关闭或取消流程时清除，任何阶段都不向 WebView 返回路径、文件内容或恢复材料。

## Acceptance To Verification

- 1、4、5、7：Rust adapter/command 临时目录测试覆盖保存取消、错误路径、原子写失败、错误/过期/篡改文件、旧 vault 清理、引用清理及非目标配置保持不变。
- 2、6、8：固定 fixture 检查文件内容与 IPC DTO；比较重置前后 JSON，确认凭证密文及引用不变，并检查 secret wrapper/Debug 输出。
- 3、9：application/lifecycle 测试覆盖恢复后新密码解锁、旧密码拒绝、全部 credential round trip 和 deadline generation 更新。
- 1、3、4、5、7：React Testing Library 覆盖初始化保存取消、恢复入口、新密码确认、错误提示、替代恢复文件保存失败及成功状态刷新。
- 最终运行前端 focused tests、Rust focused tests、`pnpm check`、`cargo fmt --check`、`cargo clippy --all-targets --all-features -- -D warnings` 和 `cargo test --all-targets --all-features`。

## Open Questions

- 无。已确认不考虑旧版本兼容，旧版凭证数据可以清除并重新初始化。

## Recommended Approach

采用“双包装 data key + 每次恢复后轮换恢复文件”。初始化时生成随机 data key 和独立 recovery key；主密码派生 KEK 与 recovery key 分别用不同 AAD 包装同一个 data key。恢复时后端读取文件、校验 vault ID/generation、解包并验证 data key，再用新主密码 KEK 重新包装，同时生成下一代 recovery key。为避免保存失败导致唯一恢复路径丢失，先成功原子写出下一代恢复文件，再原子提交 vault；若第二步失败，旧恢复文件与旧 vault 仍保持有效，新文件只是可安全删除的孤立文件。

备选 A 是把裸 data key 放入恢复文件：实现最简单，但文件语义与内部加密根密钥耦合，未来轮换和格式演进更差，不推荐。备选 B 是生成一次永久有效的 recovery key 且恢复后不轮换：交互更简单，但被复制的旧文件可长期重置主密码，撤销能力不足，不推荐。

## Next Skills

- `writing-qb-plans`：按安全关键变更制定实现顺序与原子提交策略。
- `checking-architecture-boundaries`：扩展 credential domain/port/application，系统文件对话框和格式实现留在 command/infrastructure。
- `protecting-critical-behavior`：先建立恢复、轮换、原子失败及旧版数据定向清理回归测试。
- `verifying-before-completion`：汇总 Rust、前端与静态检查证据。
- `maintaining-project-context`：实现后更新长期产品、架构与决策记录，明确新 vault 格式及不迁移旧版凭证数据的策略。
- Directory Map：若只扩展现有 credential 模块职责则不需要；若新增独立 recovery adapter/module，则实现后使用 `updating-directory-map`。
