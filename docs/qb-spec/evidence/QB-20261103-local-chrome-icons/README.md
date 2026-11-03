# 本机顶部按钮与服务器图标

BetterWright 浏览器组件验证：使用实际 WorkspaceChrome、EnvironmentControl、NativeWindowControls 和 ServerManager；模拟 macOS 平台，本机环境，不调用原生窗口 API。

- 本机服务器入口及已置顶按钮实测均 28×28px、y=6px，按钮间距 4px、右侧留白 10px，悬停时无描边扩张。
- 添加服务器按钮常态使用 shared secondary 描边，图标使用主题强调色。
- 服务器列表图标使用各主题 navigation-accent 与 navigation-accent-bg，与详情图标一致；已检查深色、浅色和赛博朋克。
- 截图见同目录。本次不包含原生桌面实机验证。
