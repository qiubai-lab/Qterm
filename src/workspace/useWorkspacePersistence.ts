import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from "react";

import { listProfileGroups, listProfiles, type ConnectionProfile, type ProfileGroup } from "../lib/tauri/profiles";
import { loadWorkspaces, saveWorkspaces } from "../lib/tauri/workspaces";
import { registerCurrentWindowCloseFlush } from "../lib/tauri/window";
import type { WorkspaceDocument } from "./model";
import type { WorkspaceAction } from "./reducer";
import { isTauriRuntime, workspaceErrorMessage } from "./workspaceRuntime";

export function useWorkspacePersistence(document: WorkspaceDocument, dispatch: Dispatch<WorkspaceAction>) {
  const [hydrated, setHydrated] = useState(() => !isTauriRuntime());
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [profileGroups, setProfileGroups] = useState<ProfileGroup[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const documentRef = useRef(document);
  useLayoutEffect(() => { documentRef.current = document; }, [document]);

  const refreshProfiles = useCallback(async () => {
    if (!isTauriRuntime()) return;
    const [items, groups] = await Promise.all([listProfiles(), listProfileGroups()]);
    setProfiles(items);
    setProfileGroups(groups);
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    void Promise.all([loadWorkspaces(), listProfiles(), listProfileGroups()]).then(
      ([stored, items, groups]) => {
        if (!active) return;
        if (stored) dispatch({ type: "hydrate", document: stored });
        setProfiles(items);
        setProfileGroups(groups);
        setHydrated(true);
      },
      (error: unknown) => {
        if (!active) return;
        setStorageNotice(`无法读取本地工作区：${workspaceErrorMessage(error)}`);
        setHydrated(true);
      },
    );
    return () => { active = false; };
  }, [dispatch]);

  useEffect(() => {
    if (!hydrated || !isTauriRuntime()) return;
    const timer = window.setTimeout(() => {
      void saveWorkspaces(document).catch((error: unknown) => setStorageNotice(`无法保存工作区：${workspaceErrorMessage(error)}`));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [document, hydrated]);

  useEffect(() => {
    if (!hydrated || !isTauriRuntime()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void registerCurrentWindowCloseFlush(async () => {
      await saveWorkspaces(documentRef.current).catch((error: unknown) => {
        setStorageNotice(`无法保存工作区：${workspaceErrorMessage(error)}`);
      });
    }).then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [hydrated]);

  const dismissStorageNotice = useCallback(() => setStorageNotice(""), []);

  return {
    hydrated,
    profiles,
    profileGroups,
    refreshProfiles,
    storageNotice,
    setStorageNotice,
    dismissStorageNotice,
  };
}
