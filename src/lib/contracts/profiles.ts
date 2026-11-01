export type AuthPreference = "password" | "privateKey" | "sshAgent" | "manual";

export interface ConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  authPreference: AuthPreference;
  credentialId?: string | null;
  groupId: string | null;
  jumpProfileIds?: string[];
}

export interface ProfileInput {
  name: string;
  host: string;
  port: number;
  username: string;
  authPreference: AuthPreference;
  credentialId?: string | null;
  groupId: string | null;
  jumpProfileIds: string[];
}

export interface JumpCandidate {
  profile: ConnectionProfile;
  selectable: boolean;
  reasonCode: string | null;
  reason: string | null;
  usesCredential: boolean;
  routeNames: string[];
}

export interface ProfileRouteRequirements {
  usesCredential: boolean;
  routeNames: string[];
}

export interface ProfileGroup {
  id: string;
  name: string;
}

export type SshConfigIdentityStatus = "available" | "unavailable" | "tooLarge" | "dynamicPath";

export interface SshConfigIdentity {
  index: number;
  fileName: string;
  status: SshConfigIdentityStatus;
}

export interface SshConfigCandidate {
  alias: string;
  name: string;
  host: string;
  port: number;
  username: string;
  alreadyImported: boolean;
  importable: boolean;
  identities: SshConfigIdentity[];
  warnings: string[];
}

export interface SshConfigPreview {
  previewId: string;
  sourceName: string;
  candidates: SshConfigCandidate[];
  warnings: string[];
}

export interface SshConfigImportItem {
  alias: string;
  identityFileIndex: number | null;
  passphrase: string | null;
}

export interface SshConfigImportResult {
  imported: number;
  importedPrivateKeys: number;
  reusedPrivateKeys: number;
}

export interface ProfileDeleteResult {
  deletedNetworkRules: number;
}

export interface IpcError {
  code: string;
  message: string;
  retryable: boolean;
}
