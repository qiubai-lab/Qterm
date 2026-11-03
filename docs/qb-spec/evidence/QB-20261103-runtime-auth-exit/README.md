# 登录与密钥库验证期间返回本机

BetterWright 使用真实 ServerApp 登录页、TerminalLockScreen、EnvironmentControl 与生产 CSS 验证；原生断开连接 IPC 为测试替身。

- 未登录与终端锁定时均可展开环境菜单，打开返回确认并完成页面重载；sessionStorage 的远程环境选择被清除。
- 浏览器 computed style：环境菜单 visible，额外业务浮层 hidden。
- 未开放一般业务 Portal；只为环境菜单增加精确的控制面标记。
- 保留原有草稿保存守卫和退出登录流程。
