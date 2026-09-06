import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { SessionEvent } from "../lib/tauri/sessions";
import { useFileWorkspaceController } from "./useFileWorkspaceController";
import { useGitWorkspaceController } from "./useGitWorkspaceController";
import { useNetworkWorkspaceController } from "./useNetworkWorkspaceController";
import type { WorkspaceRuntimeState } from "./useWorkspaceRuntimeState";
import { defaultFileRuntime, defaultGitRuntime, defaultNetworkRuntime, type FileRuntime, type GitRuntime, type NetworkRuntime } from "./workspaceRuntime";

const mocks = vi.hoisted(() => ({
  connectGitSession: vi.fn(),
  connectNetworkSession: vi.fn(),
  connectFileSession: vi.fn(),
  closeSession: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/tauri/git", () => ({ connectGitSession: mocks.connectGitSession }));
vi.mock("../lib/tauri/files", () => ({ connectFileSession: mocks.connectFileSession }));
vi.mock("../lib/tauri/network", () => ({
  connectNetworkSession: mocks.connectNetworkSession,
  startNetworkRule: vi.fn(),
  stopNetworkRule: vi.fn(),
}));
vi.mock("../lib/tauri/sessions", () => ({
  acceptHostKey: vi.fn(),
  closeSession: mocks.closeSession,
  rejectHostKey: vi.fn(),
}));

const profile: ConnectionProfile = {
  id: "profile-1",
  name: "Server",
  host: "example.test",
  port: 22,
  username: "user",
  authPreference: "sshAgent",
  credentialId: null,
  groupId: null,
};

function runtimeState() {
  const epochs = new Map<string, number>();
  const gitRuntimesRef = { current: {} as Record<string, GitRuntime> };
  const networkRuntimesRef = { current: {} as Record<string, NetworkRuntime> };
  const fileRuntimesRef = { current: {} as Record<string, FileRuntime> };
  const state = {
    fileRuntimes: fileRuntimesRef.current,
    fileRuntimesRef,
    gitRuntimes: gitRuntimesRef.current,
    gitRuntimesRef,
    networkRuntimes: networkRuntimesRef.current,
    networkRuntimesRef,
    connectionTargetIntents: { current: new Map<string, string | null>() },
    connectionFailureHandlers: { current: new Map<string, () => void>() },
    finishedEpochs: { current: new Set<string>() },
    nextEpoch: (blockId: string) => {
      const next = (epochs.get(blockId) ?? 0) + 1;
      epochs.set(blockId, next);
      return next;
    },
    isCurrentEpoch: (blockId: string, epoch: number) => epochs.get(blockId) === epoch,
    updateGitRuntime: (blockId: string, update: (runtime: GitRuntime) => GitRuntime) => {
      gitRuntimesRef.current[blockId] = update(gitRuntimesRef.current[blockId] ?? defaultGitRuntime);
    },
    updateFileRuntime: (blockId: string, update: (runtime: FileRuntime) => FileRuntime) => {
      fileRuntimesRef.current[blockId] = update(fileRuntimesRef.current[blockId] ?? defaultFileRuntime);
    },
    updateNetworkRuntime: (blockId: string, update: (runtime: NetworkRuntime) => NetworkRuntime) => {
      networkRuntimesRef.current[blockId] = update(networkRuntimesRef.current[blockId] ?? defaultNetworkRuntime);
    },
  } as unknown as WorkspaceRuntimeState;
  return { state, fileRuntimesRef, gitRuntimesRef, networkRuntimesRef };
}

function disconnectBeforeConnectReturns(_input: unknown, event: (event: SessionEvent) => void) {
  event({ type: "stateChanged", state: "connected" });
  event({ type: "stateChanged", state: "failed" });
  event({
    type: "failed",
    code: "transportLost",
    message: "SSH 连接已中断，请检查网络或服务器状态",
    node: null,
    stage: "startSession",
  });
  return Promise.resolve("already-finished-session");
}

describe("remote workspace session disconnects", () => {
  beforeEach(() => {
    mocks.connectGitSession.mockReset().mockImplementation(disconnectBeforeConnectReturns);
    mocks.connectNetworkSession.mockReset().mockImplementation(disconnectBeforeConnectReturns);
    mocks.connectFileSession.mockReset().mockImplementation(disconnectBeforeConnectReturns);
    mocks.closeSession.mockClear();
  });

  it("does not restore a Files session id after its failure event", async () => {
    const { state, fileRuntimesRef } = runtimeState();
    const { result } = renderHook(() => useFileWorkspaceController(state, vi.fn()));

    await act(() => result.current.connectFileBlock("files-1", profile, { method: "sshAgent" }));

    expect(fileRuntimesRef.current["files-1"]).toMatchObject({
      kind: "sftp",
      sessionId: null,
      status: "failed",
      notice: "SSH 连接已中断，请检查网络或服务器状态",
    });
  });

  it("does not restore a Git session id after its failure event", async () => {
    const { state, gitRuntimesRef } = runtimeState();
    const { result } = renderHook(() => useGitWorkspaceController(state, vi.fn()));

    await act(() => result.current.connectGitBlock("git-1", profile, { method: "sshAgent" }));

    expect(gitRuntimesRef.current["git-1"]).toMatchObject({
      sessionId: null,
      status: "failed",
      stale: true,
      notice: "SSH 连接已中断，请检查网络或服务器状态",
    });
  });

  it("does not restore a Network session id or forwarding state after failure", async () => {
    const { state, networkRuntimesRef } = runtimeState();
    const { result } = renderHook(() => useNetworkWorkspaceController(state, vi.fn()));

    await act(() => result.current.connectNetworkBlock("network-1", profile, { method: "sshAgent" }));

    expect(networkRuntimesRef.current["network-1"]).toMatchObject({
      sessionId: null,
      status: "failed",
      notice: "SSH 连接已中断，请检查网络或服务器状态",
      ruleStates: {},
    });
  });
});
