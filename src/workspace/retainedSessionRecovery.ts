import { listRetainedSessions, type RetainedSession } from "@qterm/services/runtimeSessions";
import { closeSession } from "@qterm/services/sessions";

type Recovery = { action: "cancel" } | { action: "create" } | { action: "attach"; session: RetainedSession };

/** Only an authoritative ended status permits replacement; failed lookups preserve the process. */
export async function resolveRetainedSession(
  blockId: string, kind: string, profileId: string | null, current: () => boolean,
): Promise<Recovery> {
  const session = (await listRetainedSessions()).find(value => value.runtimeKey === blockId);
  if (!current()) return { action: "cancel" };
  if (!session) return { action: "create" };
  if (session.kind !== kind || session.profileId !== profileId) throw new Error("后台会话目标已变化，请重新加载工作区");
  if (session.status !== "closed" && session.status !== "failed") return { action: "attach", session };
  await closeSession(session.sessionId);
  return { action: current() ? "create" : "cancel" };
}
