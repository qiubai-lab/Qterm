import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

import { getLocalTerminalCapabilities, type LocalTerminalCapabilities } from "../lib/tauri/localSessions";
import type { TerminalSizeInput } from "../lib/tauri/sessions";
import type { WorkspaceDocument } from "./model";
import {
  defaultFileRuntime,
  defaultGitRuntime,
  defaultNetworkRuntime,
  defaultRuntime,
  isTauriRuntime,
  workspaceErrorMessage,
  type FileRuntime,
  type GitRuntime,
  type NetworkRuntime,
  type TerminalRuntime,
} from "./workspaceRuntime";

type StorageNoticeSetter = Dispatch<SetStateAction<string>>;

export function useWorkspaceRuntimeState(document: WorkspaceDocument, setStorageNotice: StorageNoticeSetter) {
  const [runtimes, setRuntimes] = useState<Record<string, TerminalRuntime>>({});
  const [fileRuntimes, setFileRuntimes] = useState<Record<string, FileRuntime>>({});
  const [networkRuntimes, setNetworkRuntimes] = useState<Record<string, NetworkRuntime>>({});
  const [gitRuntimes, setGitRuntimes] = useState<Record<string, GitRuntime>>({});
  const [localTerminalCapabilities, setLocalTerminalCapabilities] = useState<LocalTerminalCapabilities | null>(null);
  const writers = useRef(new Map<string, (data: Uint8Array) => void>());
  const clearers = useRef(new Map<string, (reset: boolean) => void>());
  const terminalSizeReaders = useRef(new Map<string, () => TerminalSizeInput>());
  const writerOwners = useRef(new Map<string, symbol>());
  const pendingTerminalOutput = useRef(new Map<string, { chunks: Uint8Array[]; bytes: number }>());
  const runtimesRef = useRef(runtimes);
  const fileRuntimesRef = useRef(fileRuntimes);
  const networkRuntimesRef = useRef(networkRuntimes);
  const gitRuntimesRef = useRef(gitRuntimes);
  const documentRef = useRef(document);
  const sessionEpochs = useRef(new Map<string, number>());
  const connectionTargetIntents = useRef(new Map<string, string | null>());
  const finishedEpochs = useRef(new Set<string>());
  const startingLocal = useRef(new Map<string, number>());
  const activeLocalSessions = useRef(new Map<string, string>());
  const pendingLocalInput = useRef(new Map<string, Uint8Array[]>());
  const pendingInitialDirectories = useRef(new Map<string, string>());
  const connectionFailureHandlers = useRef(new Map<string, () => void>());

  useEffect(() => { runtimesRef.current = runtimes; }, [runtimes]);
  useEffect(() => { fileRuntimesRef.current = fileRuntimes; }, [fileRuntimes]);
  useEffect(() => { networkRuntimesRef.current = networkRuntimes; }, [networkRuntimes]);
  useEffect(() => { gitRuntimesRef.current = gitRuntimes; }, [gitRuntimes]);
  useLayoutEffect(() => { documentRef.current = document; }, [document]);

  const updateRuntime = useCallback((blockId: string, update: (current: TerminalRuntime) => TerminalRuntime) => {
    setRuntimes((current) => {
      const previous = current[blockId] ?? defaultRuntime;
      const updated = update(previous);
      if (current[blockId] && updated === previous) return current;
      const next = { ...current, [blockId]: updated };
      runtimesRef.current = next;
      return next;
    });
  }, []);

  const updateFileRuntime = useCallback((blockId: string, update: (current: FileRuntime) => FileRuntime) => {
    setFileRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultFileRuntime) };
      fileRuntimesRef.current = next;
      return next;
    });
  }, []);

  const updateNetworkRuntime = useCallback((blockId: string, update: (current: NetworkRuntime) => NetworkRuntime) => {
    setNetworkRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultNetworkRuntime) };
      networkRuntimesRef.current = next;
      return next;
    });
  }, []);

  const updateGitRuntime = useCallback((blockId: string, update: (current: GitRuntime) => GitRuntime) => {
    setGitRuntimes((current) => {
      const next = { ...current, [blockId]: update(current[blockId] ?? defaultGitRuntime) };
      gitRuntimesRef.current = next;
      return next;
    });
  }, []);

  const nextEpoch = useCallback((blockId: string) => {
    const epoch = (sessionEpochs.current.get(blockId) ?? 0) + 1;
    sessionEpochs.current.set(blockId, epoch);
    return epoch;
  }, []);
  const isCurrentEpoch = useCallback((blockId: string, epoch: number) => sessionEpochs.current.get(blockId) === epoch, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    void getLocalTerminalCapabilities().then(
      (capabilities) => { if (active) setLocalTerminalCapabilities(capabilities); },
      (error: unknown) => {
        if (active) setStorageNotice((current) => current || `无法读取本地终端能力：${workspaceErrorMessage(error)}`);
      },
    );
    return () => { active = false; };
  }, [setStorageNotice]);

  return {
    runtimes, setRuntimes, fileRuntimes, setFileRuntimes, networkRuntimes, setNetworkRuntimes, gitRuntimes, setGitRuntimes,
    localTerminalCapabilities, writers, clearers, terminalSizeReaders, writerOwners, pendingTerminalOutput,
    runtimesRef, fileRuntimesRef, networkRuntimesRef, gitRuntimesRef, documentRef, sessionEpochs,
    connectionTargetIntents, finishedEpochs, startingLocal, activeLocalSessions, pendingLocalInput,
    pendingInitialDirectories, connectionFailureHandlers, updateRuntime, updateFileRuntime, updateNetworkRuntime,
    updateGitRuntime, nextEpoch, isCurrentEpoch,
  };
}

export type WorkspaceRuntimeState = ReturnType<typeof useWorkspaceRuntimeState>;
