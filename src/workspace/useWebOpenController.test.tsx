import { act, renderHook } from "@testing-library/react";
import { useReducer } from "react";
import { expect, it, vi } from "vitest";
import { createWorkspaceDocument, type WorkspaceDocument } from "./model";
import { workspaceReducer } from "./reducer";
import { useWebOpenController } from "./useWebOpenController";
import { resolveWebLinkOrigin } from "../web/webLinkOrigin";
import type { ConnectionProfile } from "../lib/tauri/profiles";
import { blockIds, findLeaf } from "./layout";

vi.mock("../web/webModel", async original => ({ ...await original<typeof import("../web/webModel")>(), supportsWebBlocks: () => true }));
const profile: ConnectionProfile = { id: "server", name: "Server", host: "host", username: "user", port: 22, authPreference: "manual", groupId: null };
function fixture(remote = false) {
  const document = createWorkspaceDocument();
  const workspace = document.workspaces[0];
  if (workspace.layout.type === "terminal") workspace.layout.profileId = remote ? profile.id : null;
  const origin = resolveWebLinkOrigin(document, [profile], workspace.activeBlockId)!;
  return { document, workspace, origin };
}
function useFixture(initial: WorkspaceDocument, profiles = [profile]) {
  const [document, dispatch] = useReducer(workspaceReducer, initial);
  return { document, dispatch, ...useWebOpenController(document, profiles, dispatch) };
}

it("opens a local block beside the source and consumes its transient URL once without persistence", () => {
  const { document, workspace, origin } = fixture();
  const hook = renderHook(() => useFixture(document));
  act(() => hook.result.current.openTerminalWebLink(origin, "http://localhost:3000"));
  const updated = hook.result.current.document.workspaces[0];
  const web = findLeaf(updated.layout, updated.activeBlockId)!;
  expect(web).toMatchObject({ type: "web", profileId: null });
  expect(blockIds(updated.layout)).toContain(origin.blockId);
  expect(JSON.stringify(hook.result.current.document)).not.toContain("localhost");
  const open = vi.fn();
  let unregister!: () => void;
  act(() => { unregister = hook.result.current.registerWebOpener(web.blockId, null, open); });
  expect(open).toHaveBeenCalledExactlyOnceWith("http://localhost:3000/");
  unregister();
  act(() => { hook.result.current.registerWebOpener(web.blockId, null, open); });
  expect(open).toHaveBeenCalledOnce();
  expect(hook.result.current.document.activeWorkspaceId).toBe(workspace.id);
});

it("reuses only a same-target browser in the source workspace and propagates tab capacity errors", () => {
  const { document, workspace, origin } = fixture(true);
  const withWeb = workspaceReducer(document, { type: "openWeb", workspaceId: workspace.id, anchorBlockId: origin.blockId, profileId: profile.id, newBlockId: "browser" });
  const hook = renderHook(() => useFixture(withWeb));
  const open = vi.fn();
  act(() => { hook.result.current.registerWebOpener("browser", profile.id, open); });
  act(() => hook.result.current.dispatch({ type: "addWorkspace" }));
  act(() => hook.result.current.openTerminalWebLink(origin, "https://example.test"));
  expect(open).toHaveBeenCalledExactlyOnceWith("https://example.test/");
  expect(hook.result.current.document.activeWorkspaceId).toBe(workspace.id);
  expect(blockIds(hook.result.current.document.workspaces[0].layout)).toHaveLength(2);
  open.mockImplementation(() => { throw new Error("标签页已满"); });
  expect(() => hook.result.current.openTerminalWebLink(origin, "http://localhost")).toThrow("标签页已满");
  expect(blockIds(hook.result.current.document.workspaces[0].layout)).toHaveLength(2);
});

it("captures the source independently of active selection and never falls back from missing Remote to Local", () => {
  const { document, origin } = fixture(true);
  const hook = renderHook(({ profiles }) => useFixture(document, profiles), { initialProps: { profiles: [profile] } });
  act(() => hook.result.current.dispatch({ type: "setBlockProfile", workspaceId: origin.workspaceId, blockId: origin.blockId, profileId: null }));
  act(() => hook.result.current.openTerminalWebLink(origin, "http://localhost"));
  const updated = hook.result.current.document.workspaces[0];
  expect(findLeaf(updated.layout, updated.activeBlockId)).toMatchObject({ type: "web", profileId: profile.id });
  hook.rerender({ profiles: [] });
  expect(() => hook.result.current.openTerminalWebLink(origin, "http://localhost")).toThrow("来源连接已删除");
  expect(resolveWebLinkOrigin(document, [profile], "missing")).toBeNull();
  expect(() => hook.result.current.openTerminalWebLink({ ...origin, blockId: "closed" }, "http://localhost")).toThrow("来源终端已关闭");
});

it("does not deliver a pending URL to a retargeted browser", () => {
  const { document, origin } = fixture(true);
  const hook = renderHook(() => useFixture(document));
  act(() => hook.result.current.openTerminalWebLink(origin, "http://localhost"));
  const id = hook.result.current.document.workspaces[0].activeBlockId;
  act(() => hook.result.current.dispatch({ type: "setNetworkProfile", workspaceId: origin.workspaceId, blockId: id, profileId: null }));
  const open = vi.fn();
  act(() => { hook.result.current.registerWebOpener(id, null, open); });
  expect(open).not.toHaveBeenCalled();
});
