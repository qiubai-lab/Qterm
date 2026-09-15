export type OnboardingMode = "desktop" | "demo";
const memory = new Set<string>();
const keyFor = (mode: OnboardingMode) => `qterm.onboarding.${mode}.shown`;

export function hasSeenOnboarding(mode: OnboardingMode): boolean {
  const key = keyFor(mode);
  try { return localStorage.getItem(key) === "true" || memory.has(key); }
  catch { return memory.has(key); }
}
export function markOnboardingSeen(mode: OnboardingMode) {
  const key = keyFor(mode);
  try { localStorage.setItem(key, "true"); }
  catch { memory.add(key); }
}

export const guideSteps = [
  { id: "welcome", title: "欢迎使用 Qterm", text: "用几步认识工作区、终端和常用工具。可以随时跳过，之后再重新查看。", target: null },
  { id: "workspaces", title: "组织你的工作区", text: "顶部标签可切换工作区，加号可新建工作区。每个工作区可以容纳多个终端和工具面板。", target: "workspaces" },
  { id: "terminal-connection", title: "切换终端连接", text: "点击终端左上角的连接名称，在本地终端和已保存的服务器之间切换。每个终端拥有独立的连接与输入。", target: "terminal-connection" },
  { id: "terminal-actions", title: "使用终端操作按钮", text: "右上角可搜索或清除输出，打开文件、Git 和网络面板，也可左右或上下分屏。窄窗口中的更多按钮会收纳部分操作。", target: "terminal-actions" },
  { id: "files", title: "浏览与编辑文件", text: "文件管理打开当前目标的文件面板，可浏览项目、预览文本和编辑保存。终端标题栏也有文件入口。", target: "rail-files" },
  { id: "network", title: "管理网络规则", text: "网络管理提供本地转发、远程转发和 SOCKS5 规则。终端标题栏也有网络入口。", target: "rail-network" },
  { id: "git", title: "查看代码变化", text: "Git 管理可查看差异、暂存更改和提交。终端标题栏同样可以打开仓库。", target: "rail-git" },
];
