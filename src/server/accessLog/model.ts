export const eventLabels = {
  login: "登录认证", resume: "恢复访问", takeover: "接管工作台", logout: "退出登录",
  connected: "连接建立", disconnected: "连接断开", revoked: "访问已撤销",
  vaultUnlock: "凭证库解锁", vaultLock: "凭证库锁定", vaultInitialize: "初始化凭证库",
  vaultPasswordChange: "修改主密码", vaultReset: "重置主密码", vaultClear: "清除凭证库",
  workbenchUnlock: "工作台解锁", workbenchLock: "工作台锁定", accessDenied: "访问被拒绝",
} as const;
export type EventKind = keyof typeof eventLabels;
export interface AccessEvent {
  id: string;
  timestamp: number;
  kind: EventKind;
  success: boolean;
  reason: string;
  source: { ip: string | null; browser: string | null; session: string | null };
}
export interface AccessLogPage { entries: AccessEvent[]; nextCursor: string | null; recordingHealthy: boolean; droppedEvents: number }
export interface Filters { period: string; kind: string; result: string }
const reasons: Record<string, string> = {
  invalidRecovery: "恢复密钥文件验证未通过", vaultNotInitialized: "凭证库尚未初始化", vaultLocked: "凭证库已锁定",
  admitted: "已获得访问权限", confirmationRequired: "密码验证通过，等待确认接管", completed: "操作完成",
  invalidPassword: "访问密码不正确", verificationFailed: "主密码验证未通过", sessionReplaced: "工作台已由其他会话接管",
  sessionExpired: "登录会话已失效", workbenchLocked: "工作台已锁定", claimExpired: "接管请求已失效",
  forbidden: "来源或访问权限校验未通过", rateLimited: "请求过于频繁或验证资源繁忙", serviceError: "服务暂时不可用",
  requestRejected: "请求未通过校验", presenceReady: "工作台连接已建立", connectionClosed: "浏览器连接已结束",
  timeout: "凭证库自动锁定",
};
export const reasonLabel = (reason: string) => reasons[reason] ?? "未提供说明";
export const eventLabel = (kind: EventKind) => eventLabels[kind] ?? "其他事件";
export const formatTime = (time: number) => new Date(time).toLocaleString("zh-CN", { hour12: false });
export function browserLabel(agent: string | null) {
  if (!agent) return "系统或未知来源";
  if (/Edg\//.test(agent)) return "Edge";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  return "其他客户端";
}
