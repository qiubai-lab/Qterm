export type GitObservationTarget =
  | { kind: "local"; path: string }
  | { kind: "remote"; path: string; sessionId: string; profileId: string };
