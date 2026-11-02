import type { GitObservationTarget } from "../contracts/gitObservation";
import type { GitSnapshot } from "./git";
export const supportsGitObservation = false;
/** Desktop keeps its existing refresh policy; Web provides the subscription adapter. */
export function subscribeGitObservation(_target: GitObservationTarget, _changed: (read: () => Promise<GitSnapshot>) => void): () => void {
  void _target; void _changed;
  return () => undefined;
}
