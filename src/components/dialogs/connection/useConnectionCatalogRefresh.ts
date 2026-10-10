import { useEffect, type Dispatch, type SetStateAction } from "react";
import { listProfileGroups, type ProfileGroup } from "../../../lib/tauri/profiles";
import { onSyncProfilesChanged } from "../../../lib/tauri/sync";
import { connectionErrorCode, connectionErrorMessage } from "./connectionDialogModel";

export function useConnectionCatalogRefresh(
  setGroups: Dispatch<SetStateAction<ProfileGroup[]>>,
  setCollapsedGroupIds: Dispatch<SetStateAction<Set<string>>>,
  setUnsupported: Dispatch<SetStateAction<boolean>>,
  setMessage: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;
    let generation = 0;
    async function refresh(initial: boolean) {
      const request = ++generation;
      try {
        const items = await listProfileGroups();
        if (!active || generation !== request) return;
        setGroups(items); setUnsupported(false);
        if (initial) setCollapsedGroupIds(new Set(items.map((group) => group.id)));
      } catch (error) {
        if (!active || generation !== request) return;
        setUnsupported(connectionErrorCode(error) === "profileStorageVersionUnsupported");
        setMessage(connectionErrorMessage(error));
      }
    }
    void refresh(true);
    if ("__TAURI_INTERNALS__" in window) {
      void onSyncProfilesChanged(() => { void refresh(false); }).then((unlisten) => {
        if (active) stop = unlisten; else unlisten();
      }).catch(() => { if (active) setMessage("无法监听连接分组同步更新"); });
    }
    return () => { active = false; stop?.(); };
  }, [setGroups, setCollapsedGroupIds, setUnsupported, setMessage]);
}
