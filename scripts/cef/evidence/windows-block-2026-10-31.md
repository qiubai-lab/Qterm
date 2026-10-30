# Windows CEF Browser Block 验证

Windows 11 x64（10.0.26100），Tauri 3.0.0-alpha.5、runtime 3.0.0-alpha.6
加仓库补丁、CEF 154.5.0。使用隔离数据目录和本机 HTTP fixture，未使用用户连接。

## 实现与原生证据

Windows 启用本地/SSH Browser Block 能力；原生 HWND adapter 负责逻辑尺寸到
物理 DPI、显隐、遮挡并集、输入禁用、焦点返回和鼠标透明的边框覆盖层。
WH_GETMESSAGE / WinEvent hooks 随 guest HWND 销毁释放，可信点击和 Ctrl+W
通过既有主界面事件处理，客体没有新增 IPC 权限。

根浏览器和嵌入弹窗统一指定 Alloy。Windows 默认根页面 runtime style 与
显式 Alloy 弹窗混用时，实机 window.open 在 libcef 内访问冲突；统一后
真实标签接管及后续弹窗检查通过。接受关闭后只销毁弹窗子 HWND，不向主窗口
发送关闭消息。macOS 的原有 Alloy 子视图路径保持原样。

- `python scripts/cef/tests/windows.py --app src-tauri/target/debug/Qterm.exe`：
  **25/25 通过**，涵盖真实 React 自动接管、URL/关闭按钮、原生 HWND 父子归属、
  尺寸、可见性、遮挡、焦点释放/恢复、metrics/PNG、POST/Cookie/opener/noopener、
  命名目标复用、嵌套关闭、脚本关闭、自动弹窗拒绝、内部源导航拒绝、
  应用/插件 IPC 明确拒绝及上下文回收。
- Windows 主界面自身保留一个池化 context，检查关闭后恢复启动基线；
  guest 的 IPC 桥函数存在，验收检查调用被拒绝，而非假设函数不存在。
- 相邻 Rust Win32 tests **3/3 通过**：1.25 DPI 遮挡外向舍入及并集、主窗口
  不被裁剪、遮挡恢复、overlay/hook 随子 HWND 回收、焦点/可见/禁用限制、
  Ctrl+W 首次按下/重复/释放及 Ctrl+Shift+W 不拦截。
- computer-use 实机检查：引导弹层可见且在网页之上；关闭引导后点击网页输入框
  切换 Block 焦点，输入 CEF Windows OK 与 DOM 值一致；真实 Ctrl+W 发出
  **一次** qterm-close-web-tab，当前页替换为空白新标签，主窗口仍运行。

机器可读结果和测试二进制 SHA-256：
[windows-block-2026-10-31.json](windows-block-2026-10-31.json)。
临时日志在忽略的 scripts/cef/artifacts/ 中。

## 仓库检查

- `pnpm check`：source-size、ESLint 通过；默认并发 Vitest 出现超时，中止后
  以 `pnpm exec vitest run --maxWorkers 2` 复核：**1486 通过、2 跳过**。
- `pnpm build` 与 `pnpm exec tauri build --debug --no-bundle --features cef-integration-test`
  通过；有既存大 chunk 提示及 MSVC 创建导入库的 linker 消息。
- `cargo clippy --locked --all-targets --all-features -- -D warnings` 通过。
- 不启用测试 feature 的 `cargo check --locked --lib` 通过，无 warning。
- `cargo test --locked --lib --all-features -- --test-threads=2`：**365 通过、1 失败、6 忽略**。
  唯一失败为未修改的 local::pty::tests::default_shell_routes_terminal_io_and_can_be_closed：
  当前 cmd/ConPTY 输出未含该测试要求的 synchronized clear sequences。
  本次 Windows adapter、网页/gateway/domain 用例均通过。
- Node 脚本测试：**37 通过、2 失败、1 跳过**。未修改的 macOS package 测试
  硬编码 POSIX 路径，与 Windows path.join 不符；install-local 测试创建
  symlink 得到 EPERM。未改变系统权限或这些无关功能。
- 全仓 cargo fmt --all --check 被既存 CRLF 文件阻断；本次所有改动 Rust 文件
  独立 rustfmt 检查通过。git diff --check 和 source-size（0 reminders）通过。
- checksum-pinned runtime prepare 成功且再次运行确认指纹一致。

## 未覆盖范围

Windows **debug-only Auto** 沙箱策略保持不变。默认 release 的 Required 沙箱仍
受上游 broker/EXE 托管限制，不能据此发布生产版。本次未验证安装器、Windows
实机 SSH 服务、跨显示器 DPI 切换、Linux 或 macOS 的回归运行；已有 macOS SSH
证据不当作 Windows 实测。测试产物含父进程驱动及 Mock Cookie 密钥后端，不能
用于普通安装。普通构建不包含该驱动。
