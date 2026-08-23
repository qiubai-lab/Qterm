import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

const LATEST_RELEASE_API =
  "https://api.github.com/repos/qiubai-lab/Qterm/releases/latest";
const LATEST_RELEASE_PAGE =
  "https://github.com/qiubai-lab/Qterm/releases/latest";
const REQUEST_TIMEOUT_MS = 8_000;

export type UpdateCheckFailureKind =
  | "offline"
  | "timeout"
  | "rateLimited"
  | "invalidResponse";

export type UpdateCheckResult =
  | { status: "latest"; currentVersion: string }
  | {
      status: "available";
      currentVersion: string;
      latestVersion: string;
      publishedAt: string | null;
    };

let startupUpdateCheckPromise: Promise<UpdateCheckResult | null> | null = null;

export class UpdateCheckError extends Error {
  constructor(
    public readonly kind: UpdateCheckFailureKind,
    message?: string,
  ) {
    super(message ?? kind);
    this.name = "UpdateCheckError";
  }
}

type StableVersion = readonly [number, number, number];

function parseStableVersion(value: string): StableVersion | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(
    value.trim(),
  );
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: StableVersion, right: StableVersion) {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index] - right[index];
    if (difference !== 0) return difference;
  }
  return 0;
}

function readRelease(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new UpdateCheckError("invalidResponse");
  }

  const release = payload as Record<string, unknown>;
  if (
    typeof release.tag_name !== "string" ||
    release.draft !== false ||
    release.prerelease !== false ||
    (release.published_at !== null &&
      typeof release.published_at !== "string")
  ) {
    throw new UpdateCheckError("invalidResponse");
  }

  const version = parseStableVersion(release.tag_name);
  if (!version) throw new UpdateCheckError("invalidResponse");

  return {
    version,
    versionLabel: release.tag_name.replace(/^v/, ""),
    publishedAt: release.published_at as string | null,
  };
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const currentVersion = await getVersion();
    const parsedCurrentVersion = parseStableVersion(currentVersion);
    if (!parsedCurrentVersion) throw new UpdateCheckError("invalidResponse");

    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    });

    if (response.status === 403 || response.status === 429) {
      throw new UpdateCheckError("rateLimited");
    }
    if (!response.ok) throw new UpdateCheckError("offline");

    const latestRelease = readRelease(await response.json());
    if (compareVersions(latestRelease.version, parsedCurrentVersion) > 0) {
      return {
        status: "available",
        currentVersion,
        latestVersion: latestRelease.versionLabel,
        publishedAt: latestRelease.publishedAt,
      };
    }

    return { status: "latest", currentVersion };
  } catch (error) {
    if (error instanceof UpdateCheckError) throw error;
    if (controller.signal.aborted) throw new UpdateCheckError("timeout");
    throw new UpdateCheckError("offline");
  } finally {
    window.clearTimeout(timeout);
  }
}

export function checkForUpdateOnStartupOnce(): Promise<UpdateCheckResult | null> {
  startupUpdateCheckPromise ??= checkForUpdate().catch(() => null);
  return startupUpdateCheckPromise;
}

export function updateCheckMessage(error: unknown) {
  if (!(error instanceof UpdateCheckError)) {
    return "无法连接更新服务，请稍后重试。";
  }

  switch (error.kind) {
    case "rateLimited":
      return "检查次数过多，请稍后重试。";
    case "timeout":
      return "更新服务响应超时，请稍后重试。";
    case "invalidResponse":
      return "更新信息格式无效，请稍后重试。";
    case "offline":
      return "无法连接更新服务，请稍后重试。";
  }
}

export async function openLatestReleasePage() {
  if ("__TAURI_INTERNALS__" in window) {
    await openUrl(LATEST_RELEASE_PAGE);
    return;
  }

  window.open(LATEST_RELEASE_PAGE, "_blank", "noopener,noreferrer");
}
