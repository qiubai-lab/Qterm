import { useWorkbenchActive } from "./workbenchActivity";
import { CONFIGURATION_MERGED } from "@qterm/services/configurationMerge";
import { hasWorkspaceRuntime, isServer } from "../lib/runtime/environment";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from "react";

import { listProfileGroups, listProfiles, type ConnectionProfile, type ProfileGroup } from "@qterm/services/profiles";
import { loadWorkspaces, saveWorkspaces } from "@qterm/services/workspaces";
import { registerCurrentWindowCloseFlush } from "../lib/tauri/window";
import type { WorkspaceDocument } from "./model";
import type { WorkspaceAction } from "./reducer";
import { workspaceErrorMessage } from "./workspaceRuntime";
import { loadWebTabCache, saveWebTabCache } from "../lib/tauri/webTabs";
import { createWebTabSessionStore } from "../web/webTabSessionStore";
import { createWorkspaceSaveQueue } from "./workspaceSaveQueue";

export function useWorkspacePersistence(document: WorkspaceDocument, dispatch: Dispatch<WorkspaceAction>) {
  const active = useWorkbenchActive();
  const [hydrated, setHydrated] = useState(() => !hasWorkspaceRuntime());
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [profileGroups, setProfileGroups] = useState<ProfileGroup[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const [webTabSessions] = useState(createWebTabSessionStore);
  const [save] = useState(() => createWorkspaceSaveQueue(saveWorkspaces, saveWebTabCache));
  const documentRef = useRef(document);
  useLayoutEffect(() => {
    documentRef.current = document;
    if (hydrated) webTabSessions.reconcile(document);
  }, [document, hydrated, webTabSessions]);

  const refreshProfiles = useCallback(async () => {
    if (!active || !hasWorkspaceRuntime()) return;
    const [items, groups] = await Promise.all([listProfiles(), listProfileGroups()]);
    setProfiles(items);
    setProfileGroups(groups);
  }, [active]);

  useEffect(() => {
    const refresh = () => { void refreshProfiles().catch(() => setStorageNotice("配置已合并，但列表刷新失败，请重新打开应用")); };
    window.addEventListener(CONFIGURATION_MERGED, refresh);
    return () => window.removeEventListener(CONFIGURATION_MERGED, refresh);
  }, [refreshProfiles]);

  useEffect(() => {
    if (!active || hydrated || !hasWorkspaceRuntime()) return;
    let live = true;
    const cache = loadWebTabCache().catch((error: unknown) => {
      if (live) setStorageNotice(`无法恢复浏览器标签：${workspaceErrorMessage(error)}`);
      return null;
    });
    void Promise.all([loadWorkspaces(), listProfiles(), listProfileGroups(), cache]).then(
      ([stored, items, groups, tabs]) => {
        if (!live) return;
        if (tabs) webTabSessions.restore(tabs, stored ?? documentRef.current);
        if (stored) dispatch({ type: "hydrate", document: stored });
        setProfiles(items);
        setProfileGroups(groups);
        setHydrated(true);
      },
      (error: unknown) => {
        if (!live) return;
        setStorageNotice(`无法读取本地工作区：${workspaceErrorMessage(error)}`);
        setHydrated(true);
      },
    );
    return () => { live = false; };
  }, [active, hydrated, dispatch, webTabSessions]);

  const flush = useCallback(async () => {
    if (!active) return;
    webTabSessions.reconcile(documentRef.current);
    await save(documentRef.current, webTabSessions.snapshot()).catch((error: unknown) => {
      setStorageNotice(`无法保存工作区或浏览器标签：${workspaceErrorMessage(error)}`);
    });
  }, [active, save, webTabSessions]);

  useEffect(() => {
    if (!hydrated || !hasWorkspaceRuntime()) return;
    let timer: number;
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => { void flush(); }, isServer ? 0 : 180); };
    schedule();
    const stop = webTabSessions.subscribe(schedule);
    return () => { window.clearTimeout(timer); stop(); };
  }, [document, hydrated, flush, webTabSessions]);

  useEffect(() => {
    if (!hydrated || !hasWorkspaceRuntime()) return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void registerCurrentWindowCloseFlush(flush).then((unlisten) => {
      if (disposed) unlisten();
      else stop = unlisten;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, [hydrated, flush]);

  const dismissStorageNotice = useCallback(() => setStorageNotice(""), []);

  return {
    hydrated,
    webTabSessions,
    profiles,
    profileGroups,
    refreshProfiles,
    storageNotice,
    setStorageNotice,
    dismissStorageNotice,
  };
}
