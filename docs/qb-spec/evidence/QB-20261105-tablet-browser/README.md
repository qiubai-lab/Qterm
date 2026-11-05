# 平板 Web 客户端验证

2026-11-05。使用隔离数据目录 `/tmp/qterm-pad-qa/data`，本地测试服务与独立 Vite 端口；未修改现有服务数据或部署环境。

## 自动化

- `pnpm check`：source-size 无 ratchet reminder；ESLint、TypeScript、Vite 构建通过；Vitest 1804 passed / 2 skipped；脚本测试 42 passed / 1 skipped。
- `pnpm test:web`：182 passed。
- `pnpm build:web`：Web 产物及 headless screen worker 构建成功。Vite 保留大 chunk 提示。
- `git diff --check`：通过。

## 浏览器观察

- 点击进入全屏后 `document.fullscreenElement` 非空，入口变为「退出浏览器全屏」；点击退出恢复。浏览器显示设置可切换触控/自动模式。截图 [横屏全屏](fullscreen-landscape.png)。
- 768×1024 竖屏和 1024×768 横屏保持工作区、操作菜单、快捷键栏可用；[竖屏历史](touch-history-portrait.png)。
- 可视区从 768×1024 改为 1024×400，`stty size` 从 48 行 87 列改为 13 行 119 列。终端、快捷键栏均在可视范围内；[短屏终端](short-viewport.png)。
- 400px 高度下连接管理表单内部滚动，保存按钮可见；[短屏连接管理](connection-short-viewport.png)。
- 实际 Shell 成功输出 `PAD_OK_中文`。文字快照显示同样内容，提供只读文本域和复制入口；[文字选择](text-selection.png)。这不是中文 IME 真机测试。
- 对真实 xterm 节点派发单指 TouchEvent：可见历史从 54–100 行向上滚动为 33–80 行。没有发送终端输入；单元测试另覆盖双指手势不拦截和解绑。
- 触发浏览器 online 恢复，经过访问/锁状态检查重新接入工作台；恢复前后 `echo PAD_PID_$$` 均输出 `PAD_PID_3417992`，历史与 Block ID 保留。没有创建替代 Shell 或重放输入。
- 全屏不支持/拒绝、自动指针变化、偏好持久化、Visual Viewport 缩小/偏移/恢复及 pinch zoom、控制字符与应用光标模式、断线写入禁用、文字选区复制、旧连接/迟到请求失效均有相邻自动化覆盖。

## 验证边界

浏览器验证使用 BetterWright 桌面 Chromium、显式触控模式和合成触摸事件。未连接 Android/iPadOS 真机，未验证物理软键盘、中文 IME 候选框、真实 OS 后台冻结或设备特有 Fullscreen 限制；不宣称浏览器连接可后台常驻。建议上线设备验收按这些项目复测。
