# dev-cef：Browser Block 内嵌弹窗标签

用户最新要求替代先前的“独立原生弹窗”选择：`target="_blank"`、用户触发的
`window.open` 和命名目标 POST 表单进入来源 Browser Block 的新标签。

实现保留原生 CEF browser，在创建时指定共享 Tauri NSWindow 的 parent view；
不取消并重放 URL，因此 POST/opener/noopener 和原 RequestContext 保留。
关闭嵌入页只释放它的 NSView，不发送主窗口关闭。根页与弹窗页的操作通过
`guest_view.rs` 统一；`popup_events.rs`/`popups.rs` 拥有请求、接管、通知和回收。
待接管页与已打开页共享 99 页容量，未接管请求 30 秒后关闭。

## 验证

最终测试构建在 macOS arm64 完成 **164/164** 项原生检查，完整驱动真实 Qterm
React 前端和独立 OpenSSH 服务；没有使用任何用户保存的 SSH 连接。

- 实际 Browser Block 自动新增并选中标签，地址栏更新；标签关闭按钮释放原生页。
- 原生 POST body、opener、命名目标复用、`_blank` noopener 均保留。
- 弹窗与来源页的 NSWindow 身份一致，嵌套页同样嵌入主窗口。
- 标签大小/显示、metrics、PNG 预览正常；`window.close()` 不关闭主窗口。
- 请求一次性消费，拒绝/过期均关闭原生 browser，过期请求不能再次接管。
- A/B 原有 WebSocket 在整个接管、嵌套关闭、30 秒超时期间保持打开并收到心跳回应；
  持续 HTTP 请求零失败，Cookie 和连接身份不串用。
- 真实 russh SSH owner 断开，回收已接管的嵌套标签，仅保留另两个存活根页；
  同身份存活 owner 和独立 B 正常。
- 既有 40 次弹窗创建/销毁循环、同连接 RequestContext 复用、连接关闭重试、
  Cookie 持久化、无 localhost 本机回退、主窗口退出及 helper/listener 回收均通过。

仓库检查：前端 1486 通过、2 跳过；Node 40 通过；Rust 370 通过、6 个环境用例
忽略；fmt、clippy（all targets/all features）、source-size 通过。

[机器可读结果与测试构建哈希](popup-tabs-2026-10-30.json)。
完整临时日志：`scripts/cef/artifacts/popup-tabs-complete/`。
已验证测试应用：`scripts/cef/artifacts/popup-tabs-test-app/Qterm CEF.app`，
只用于隔离测试，Cookie 密钥后端为 Mock；不能作为普通安装版。

## 边界

- 仅 macOS arm64 实测；Windows/Linux 和 macOS Intel 未声称通过。
- 仍依赖锁定的 Tauri/CEF alpha 运行时补丁。
- 保留来源标签关闭时递归关闭其派生标签的现有生命周期；未改成独立持久的 Chrome 标签关系。
- 标签恢复仅恢复 URL，不恢复 POST body 或 opener；自动无手势弹窗继续阻止。
- 先前的全站点存储清理、完整原生交互、System keychain 和磁盘恢复 SW 启动时序
  证据缺口仍然存在；本次没有重测内存，不沿用旧构建数值作为新构建测量。

最终普通包使用 System Cookie 密钥后端、不含测试驱动，包信息见同名 JSON 的
`normal_package` 字段。没有安装、推送或合并进正式分支。

普通应用包大小：351.40 MiB；DMG：149.19 MiB。`codesign --verify --deep --strict`
与 `hdiutil verify` 均通过；ad-hoc 签名，未 notarize。普通二进制无测试驱动标记。
