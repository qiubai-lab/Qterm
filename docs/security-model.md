# Security Model

## 凭据边界

- 密码和私钥口令仅用于当前认证请求，不写入 profile、JSON、日志或 telemetry。
- IPC command 收到口令后立即包装为 `SecretText`；该包装禁止明文 `Debug`/`Display`/`Serialize`，并在 drop 时 zeroize。
- 私钥只能来自用户通过系统文件选择器明确选择的路径。Rust state 记录最近一次选择，私钥检查 command 拒绝不匹配的任意路径；取消选择会清除旧授权。应用不提供目录枚举或 `~/.ssh` 扫描接口。
- 私钥正文只在 Rust SSH infrastructure 中读取，限制为 1 MiB，并置于 drop 时清零的字节缓冲区；正文不返回前端，也不复制到应用数据目录。

## 私钥权限

Unix 上，如果 group/other 拥有任意权限，检查结果返回 `insecurePrivateKeyPermissions` 警告但暂不阻断。原因是 POSIX mode 不能完整表达 ACL 和平台文件安全状态；第一版把决定明确交给用户。Windows 不套用 Unix mode 规则。

## SSH 认证

- 密码失败、认证方式未启用、额外认证要求和连接中断映射为稳定且不含底层上下文的错误。
- RSA 私钥解析当前被编译时关闭，因为 `russh` 的可选 RSA 依赖存在未修复的 timing advisory；上游修复前返回 unsupported-key。
- 主机密钥必须在提交凭据前完成确认。SSH session adapter 只有在 `check_server_key` 返回可信后才调用认证函数。

## 主机密钥信任

- 应用使用 app-data 下独立的 `known-hosts.json`，不读取或修改系统 `~/.ssh/known_hosts`。
- 未知主机密钥通过有序 session event 提供算法和 SHA-256 指纹；只有用户明确接受后才原子写入信任库并继续认证。
- 已保存密钥与服务端密钥不一致时发送 old/new 指纹并立即阻断，不提供“自动替换并继续”路径。
- 读取信任记录时重新解析公钥并计算 SHA-256 指纹；文件中的算法或指纹被篡改时视为损坏，绝不展示为可信。
- 用户确认最长等待 60 秒，TCP/SSH 握手最长等待 15 秒；关闭会话会取消等待而不会被误报为用户拒绝。

## 终端与文件传输

- 终端输入单次限制为 64 KiB，并通过有界内部控制队列写入已认证的 PTY；未连接会话不能写入或 resize。
- 每个 Terminal Block 以稳定 `blockId` 绑定自己的 session id、事件回调和 xterm writer。终端字节直接写入对应 xterm，不经过可持久化的 Workspace 文档或共享 React 字符串状态。
- 关闭包含活动连接的 Block 或 Workspace 时，前端从布局 leaf 计算受影响 session，并在用户确认后逐一调用幂等 close。
- 上传和下载的本地路径只能来自当前系统文件选择操作，后端拒绝前端任意构造的本地路径。
- 上传不会覆盖已有远端文件。传输先写 `.terminal-demo.part` 临时文件，完成后 rename；失败或取消会尝试清理临时文件。
- 远程路径拒绝空值、NUL 和超过 4096 字节的输入。传输事件只发送字节进度和稳定错误，不回传本地路径或底层协议错误。
- 关闭文件传输弹窗会取消仍在进行的传输，避免产生失去控制入口的后台任务。

## Workspace 持久化

- `workspaces.json` 使用独立 `schemaVersion: 2` 和白名单 DTO，只保存 Workspace、二叉 split tree、ratio、active block 引用、block id 与可选 profile id。读取 v1 时，每个旧 Tab 会迁移为一个 Workspace，且读取过程不覆盖源文件。
- repository 递归拒绝 `password`、`passphrase`、`privateKeyData`、`sessionId`、`terminalOutput` 和 `terminalBuffer` 字段；未知字段、未知 schema、超过 4 MiB 或无效引用的文档均不会覆盖源文件。
- 写入使用同目录临时文件与原子替换。应用重启只恢复结构，所有 Terminal Block 均回到未连接状态。

## 已知残余风险

- WebView 输入值和 Tauri IPC 序列化过程中会短暂存在凭据副本；前端在 `session_connect` 返回会话 ID 后立即清空密码和口令 state。
- `russh` 的密码 API 当前要求 owned `String`，其内部消息副本无法由本项目保证即时清零。
- 解析后的第三方私钥对象由依赖库管理；本项目能保证原始读取缓冲区和口令清零，但不能证明依赖内部所有临时副本均即时清零。
- 权限警告不是访问控制。用户仍需保护私钥文件及操作系统账户。
- 下载完成后的本地临时文件 rename 在目标已存在时受平台文件系统语义影响；系统保存对话框是覆盖意图的边界。
