# 远程认证页窗口拖动验证

使用真实 RemoteDesktopApp、ServerApp 与生产样式，浏览器中模拟 macOS 平台及原生 IPC，不代表 macOS 原生实机测试。

- 顶部 (300,20) 命中 runtime-window-drag-region，指针越过阈值调用 plugin:window|start_dragging。
- 左上角 (20,20) 不命中拖动层，预留原生红绿灯区域。
- 点击服务器菜单正常展开，原生拖动调用次数保持不变。
- 自动化覆盖连接中、登录、锁定、重连、被接管状态，以及工作台恢复后移除区域和卸载时取消未完成手势。
- 工作台既有拖动阈值与双击缩放测试继续通过。
