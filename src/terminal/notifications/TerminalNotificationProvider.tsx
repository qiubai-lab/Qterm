import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
/* eslint-disable react-refresh/only-export-components -- feature provider and its typed hook share a boundary. */
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getNotificationSettings, sendTerminalNotification, updateNotificationSettings, getNotificationBodySettings, updateNotificationBodySettings } from "../../lib/tauri/notifications";
import { useWorkspace } from "../../workspace/WorkspaceProvider";
import { findLeaf } from "../../workspace/layout";
import { createNotificationInbox, createNotificationLimiter, createNotificationReceiver } from "./notificationAttention";

import { createWorkspaceNotice, type WorkspaceNotice } from "./workspaceNotice";

interface NotificationContext {
  notice: WorkspaceNotice | null; dismissNotice: (revision?: number) => void;
  showBody: boolean; updateBody: (enabled: boolean) => Promise<void>;
  enabled: boolean; ready: boolean; busy: boolean; error: string;
  update: (enabled: boolean) => Promise<void>;
  unread: (blockId: string) => boolean;
  acknowledge: (blockId: string) => void;
}
const Context = createContext<NotificationContext>({ notice: null, dismissNotice: () => undefined, showBody: false, updateBody: async () => undefined, enabled: false, ready: false, busy: false, error: "", update: async () => undefined, unread: () => false, acknowledge: () => undefined });
export const useTerminalNotifications = () => useContext(Context);

const errorText = (error: unknown) => typeof error === "object" && error && "message" in error ? String(error.message) : "通知设置暂时不可用";
function focusedBlock(windowFocused = document.hasFocus()): string | null {
  if (!windowFocused || document.querySelector('.workspace-stage-content[inert], [role="dialog"]')) return null;
  return document.activeElement?.closest<HTMLElement>("[data-layout-block]")?.dataset.layoutBlock ?? null;
}

export function TerminalNotificationProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspace();
  const { document: workspaceDocument, runtimes, getTerminalEpoch, registerTerminalOutputObserver } = workspace;
  const [showBody, setShowBody] = useState(false);
  const showBodyRef = useRef(false);
  const sourceContext = useRef({ document: workspaceDocument, profiles: workspace.profiles });
  useEffect(() => { sourceContext.current = { document: workspaceDocument, profiles: workspace.profiles }; }, [workspaceDocument, workspace.profiles]);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const enabledRef = useRef(false);
  const nativeFocused = useRef<boolean | null>(null);
  const busyRef = useRef(false);
  const [notices] = useState(createWorkspaceNotice);
  const notice = useSyncExternalStore(notices.subscribe, notices.getSnapshot);
  const [inbox] = useState(createNotificationInbox);
  const unreadEpochs = useSyncExternalStore(inbox.subscribe, inbox.getSnapshot);
  const [limiter] = useState(createNotificationLimiter);
  const receiver = useRef<ReturnType<typeof createNotificationReceiver> | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    let unlisten: (() => void) | undefined;
    const window = getCurrentWindow();
    void window.isFocused().then(value => { if (live && nativeFocused.current === null) nativeFocused.current = value; }).catch(() => undefined);
    void window.onFocusChanged(({ payload }) => {
      nativeFocused.current = payload;
      if (!payload) notices.dismiss();
      if (payload) { const blockId = focusedBlock(true); if (blockId) inbox.acknowledge(blockId); }
    }).then(dispose => { if (live) unlisten = dispose; else dispose(); }).catch(() => undefined);
    return () => { live = false; unlisten?.(); nativeFocused.current = null; };
  }, [inbox, notices]);
  useEffect(() => {
    const stream = createNotificationReceiver((blockId, epoch, event) => {
      if (!enabledRef.current || getTerminalEpoch(blockId) !== epoch || focusedBlock(nativeFocused.current ?? document.hasFocus()) === blockId) return;
      inbox.mark(blockId, epoch);
      const context = sourceContext.current;
      const owner = context.document.workspaces.find(item => findLeaf(item.layout, blockId)?.type === "terminal");
      if ((nativeFocused.current ?? document.hasFocus()) && owner && owner.id !== context.document.activeWorkspaceId && !document.querySelector('.workspace-stage-content[inert], [role="dialog"]')) {
        notices.show({ workspaceId: owner.id, blockId, epoch, body: [event.title, event.body].filter(Boolean).join("：") });
      }
      if (!(nativeFocused.current ?? document.hasFocus()) && limiter.allow(blockId, epoch, event)) {
        const leaf = owner && findLeaf(owner.layout, blockId);
        const profile = leaf?.type === "terminal" && leaf.profileId ? context.profiles?.find(item => item.id === leaf.profileId) : null;
        const source = `${profile?.name ?? (leaf?.type === "terminal" && leaf.profileId ? "远程终端" : "本地终端")} · ${owner?.name ?? "工作区"}`;
        const body = showBodyRef.current ? [event.title, event.body].filter(Boolean).join("：") : "";
        void sendTerminalNotification(source, body).catch(reason => { if (enabledRef.current) setError(errorText(reason)); });
      }
    });
    receiver.current = stream;
    const unregister = registerTerminalOutputObserver((blockId, epoch, data) => {
      if (enabledRef.current) stream.feed(blockId, epoch, data);
    });
    return () => { unregister(); stream.clear(); receiver.current = null; };
  }, [getTerminalEpoch, registerTerminalOutputObserver, inbox, limiter, notices]);
  useEffect(() => {
    let live = true;
    void Promise.all([getNotificationSettings(), getNotificationBodySettings()]).then(([value, body]) => {
      if (live) { enabledRef.current = value; setEnabled(value); showBodyRef.current = body; setShowBody(body); }
    }).catch(reason => { if (live) setError(errorText(reason)); }).finally(() => { if (live) setReady(true); });
    return () => { live = false; enabledRef.current = false; receiver.current?.clear(); };
  }, [receiver]);

  const acknowledge = inbox.acknowledge;
  useEffect(() => {
    const acknowledgeFocus = () => { const blockId = focusedBlock(); if (blockId) acknowledge(blockId); };
    const blur = () => notices.dismiss();
    window.addEventListener("blur", blur);
    window.addEventListener("focus", acknowledgeFocus);
    document.addEventListener("focusin", acknowledgeFocus);
    return () => { window.removeEventListener("blur", blur); window.removeEventListener("focus", acknowledgeFocus); document.removeEventListener("focusin", acknowledgeFocus); };
  }, [acknowledge, notices]);
  useEffect(() => {
    const exists = (blockId: string) => workspaceDocument.workspaces.some(item => findLeaf(item.layout, blockId)?.type === "terminal");
    const valid = (blockId: string, epoch: number) => exists(blockId) && getTerminalEpoch(blockId) === epoch;
    receiver.current?.prune(valid);
    limiter.prune(exists);
    inbox.prune(valid);
    notices.prune(item => valid(item.blockId, item.epoch) && item.workspaceId !== workspaceDocument.activeWorkspaceId);
  }, [workspaceDocument, runtimes, getTerminalEpoch, receiver, limiter, inbox, notices]);

  const update = async (value: boolean) => {
    if (busyRef.current || !ready) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      await updateNotificationSettings(value);
      enabledRef.current = value; setEnabled(value);
      receiver.current?.clear(); limiter.clear(); inbox.clear(); notices.dismiss();
    } catch (reason) { setError(errorText(reason)); throw reason; }
    finally { busyRef.current = false; setBusy(false); }
  };
  const updateBody = async (value: boolean) => {
    if (busyRef.current || !ready) return;
    busyRef.current = true; setBusy(true); setError("");
    try { await updateNotificationBodySettings(value); showBodyRef.current = value; setShowBody(value); }
    catch (reason) { setError(errorText(reason)); throw reason; }
    finally { busyRef.current = false; setBusy(false); }
  };
  return <Context.Provider value={{ notice, dismissNotice: notices.dismiss, showBody, updateBody, enabled, ready, busy, error, update, unread: blockId => enabled && unreadEpochs[blockId] !== undefined && unreadEpochs[blockId] === getTerminalEpoch(blockId), acknowledge }}>{children}</Context.Provider>;
}
