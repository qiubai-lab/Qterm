import { useCallback, useEffect, useLayoutEffect, useRef, useMemo, type Dispatch } from "react";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import type { WebLinkOrigin } from "../web/webLinkOrigin";
import { normalizeWebAddress, supportsWebBlocks } from "../web/webModel";
import { blockIds, findLeaf } from "./layout";
import { createId, type WorkspaceDocument } from "./model";
import type { WorkspaceAction } from "./reducer";

type PageOpener = (url: string) => void;
interface RegisteredBrowser { profileId: string | null; open: PageOpener }

/** Transient commands only: layout stays in the reducer, pages stay in WebTabs. */
export function useWebOpenController(document: WorkspaceDocument, profiles: ConnectionProfile[], dispatch: Dispatch<WorkspaceAction>) {
  const current = useRef({ document, profiles });
  useLayoutEffect(() => { current.current = { document, profiles }; }, [document, profiles]);
  const browsers = useRef(new Map<string, RegisteredBrowser>());
  const pending = useRef(new Map<string, { profileId: string | null; url: string }>());
  useEffect(() => {
    const ids = new Set(document.workspaces.flatMap(workspace => blockIds(workspace.layout)));
    for (const id of pending.current.keys()) if (!ids.has(id)) pending.current.delete(id);
  }, [document]);

  const registerWebOpener = useCallback((blockId: string, profileId: string | null, open: PageOpener) => {
    const entry = { profileId, open };
    browsers.current.set(blockId, entry);
    const request = pending.current.get(blockId);
    if (request) {
      pending.current.delete(blockId);
      if (request.profileId === profileId) open(request.url);
    }
    return () => { if (browsers.current.get(blockId) === entry) browsers.current.delete(blockId); };
  }, []);

  const openTerminalWebLink = useCallback((origin: WebLinkOrigin, address: string) => {
    if (!supportsWebBlocks()) throw new Error("内部浏览器目前仅支持 Windows 桌面版");
    const url = normalizeWebAddress(address);
    const { document: latest, profiles: catalog } = current.current;
    const workspace = latest.workspaces.find(item => item.id === origin.workspaceId);
    if (!workspace || findLeaf(workspace.layout, origin.blockId)?.type !== "terminal") throw new Error("来源终端已关闭，请重新选择链接");
    if (origin.profileId !== null && !catalog.some(profile => profile.id === origin.profileId)) throw new Error("来源连接已删除，请重新选择连接");
    const ids = blockIds(workspace.layout);
    const candidates = [workspace.activeBlockId, ...ids.filter(id => id !== workspace.activeBlockId)];
    const existing = candidates.find(id => {
      const node = findLeaf(workspace.layout, id);
      return node?.type === "web" && node.profileId === origin.profileId && browsers.current.get(id)?.profileId === origin.profileId;
    });
    if (existing) {
      browsers.current.get(existing)!.open(url);
      dispatch({ type: "selectBlock", workspaceId: workspace.id, blockId: existing });
    } else {
      const newBlockId = createId("web");
      pending.current.set(newBlockId, { profileId: origin.profileId, url });
      dispatch({ type: "openWeb", workspaceId: workspace.id, anchorBlockId: origin.blockId, profileId: origin.profileId, newBlockId });
    }
    dispatch({ type: "selectWorkspace", workspaceId: workspace.id });
  }, [dispatch]);

  return useMemo(() => ({ registerWebOpener, openTerminalWebLink }), [registerWebOpener, openTerminalWebLink]);
}
