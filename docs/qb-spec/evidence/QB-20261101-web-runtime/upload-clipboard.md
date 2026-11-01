# Web 上传进度与终端文件粘贴修复

2026-11-01，Linux 原生及非 root Docker，独立 BetterWright profile 和随机端口；未修改用户运行服务。

## 原因与实现

原 Files 适配器使用 fetch，初始总量为零，只在整个文件上传完成后发出进度；Web 终端剪贴板适配器只调用 readText，键盘处理还会阻断浏览器携带文件的原生 paste 事件。

现在 XHR 发送进度和所有者绑定的服务端目标写入进度合并为两个等权阶段。开始即报告总量，按字节累加文件夹进度；等待目标 HTTP 成功确认时最多显示 99%，避免浏览器发送结束就误报完成。文件面板显示百分比，保留取消。

真实 paste 事件同步捕获 File/text，送入原有终端独占输入队列。Web 本地终端和远程终端都先上传文件，成功后插入正确引用的目标路径，不回车执行；失败/取消不插入路径。服务端验证终端用途/状态及所有者，用私有临时目录承接有界 multipart，远端复用核心 TerminalStagingStore。桌面 IPC 忽略浏览器专用参数，原有 Linux PRIMARY 选择粘贴不变。

## 验证

- `pnpm check`：262 个测试文件通过，1 个跳过；1,523 项通过，2 项跳过；lint、类型、构建和脚本检查通过。
- `pnpm test:web`：13 文件、33 项通过；随后补充大文件可见百分比封顶测试，uploadRequest 的 4 项定向测试通过。
- Rust server：33 项通过，clippy/fmt 通过。源码规模检查无 ratchet reminder。
- `test-server-clipboard.py`：原生、Docker 本地 PTY 与真实 SSH 均通过，覆盖粘贴内容、带空格/穿越形式的源文件名、目标路径可读、进度、预取消和未知会话拒绝。
- 原生真实 SFTP/Git/Network 及 takeover 回归、容器 Blocks 回归通过。CI 增加 Windows/macOS 本地粘贴验收，本机未执行相应平台测试。
- BetterWright：注入 File paste 事件后，服务端文件与输入字节完全一致；写入测试 PNG 到隔离浏览器剪贴板并实际按 Ctrl+V，即使 read() 权限被拒绝，paste 事件仍上传 PNG 并插入路径。截图见 [terminal-file-paste.png](terminal-file-paste.png)。
- 实际上传 64 MiB 文件，DOM 进度记录为 0、15,810,510、23,986,100、33,193,880、33,554,432，目标写入后等待响应，随后显示上传完成。验证后增加 99% 可见封顶，防止大文件四舍五入提前显示 100%。

Ctrl+Shift+V 在浏览器可能是纯文本粘贴；文件/图片使用 Ctrl+V（macOS Cmd+V）。网页只能上传浏览器实际提供的文件内容，无法从客户端文本路径自行读取文件。更详细边界见 [运行文档](../../../server-runtime.md)。实现参考 [MDN XMLHttpRequest.upload](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest/upload)。
