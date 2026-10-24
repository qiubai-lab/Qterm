import { describe, expect, it } from "vitest";
import { normalizeWebAddress, webSurfaceVisible } from "./webModel";
import { createWorkspaceDocument } from "../workspace/model";
import { workspaceReducer } from "../workspace/reducer";
import { blockIds, findLeaf, terminalBlockIds } from "../workspace/layout";

describe("web block boundaries", () => {
  it("normalizes remote loopback and internal domains but rejects privileged and credential URLs", () => {
    expect(normalizeWebAddress("127.0.0.1:3000")).toBe("http://127.0.0.1:3000/");
    expect(normalizeWebAddress("https://dashboard.internal")).toBe("https://dashboard.internal/");
    for (const url of ["file:///secret", "https://user:password@host", "https://tauri.localhost", "http://asset.localhost", "http://host/a\nb", ""]) expect(() => normalizeWebAddress(url)).toThrow();
  });
  it("adds and closes Web while preserving the terminal and serializing no runtime state", () => {
    const initial = createWorkspaceDocument();
    const original = initial.workspaces[0];
    const added = workspaceReducer(initial, { type: "openWeb", workspaceId: original.id, anchorBlockId: original.activeBlockId, profileId: "profile" });
    const workspace = added.workspaces[0];
    expect(findLeaf(workspace.layout, workspace.activeBlockId)).toEqual({ type: "web", blockId: workspace.activeBlockId, profileId: "profile" });
    expect(terminalBlockIds(workspace.layout)).toEqual([original.activeBlockId]);
    expect(blockIds(workspace.layout)).toHaveLength(2);
    const switched = workspaceReducer(added, { type: "setNetworkProfile", workspaceId: workspace.id, blockId: workspace.activeBlockId, profileId: "next-profile" });
    expect(findLeaf(switched.workspaces[0].layout, workspace.activeBlockId)).toEqual({ type: "web", blockId: workspace.activeBlockId, profileId: "next-profile" });
    expect(findLeaf(switched.workspaces[0].layout, original.activeBlockId)).toEqual(original.layout);
    expect(workspaceReducer(added, { type: "closeBlock", workspaceId: workspace.id, blockId: workspace.activeBlockId }).workspaces[0].layout).toEqual(original.layout);
  });
  it("hides native content behind dialogs, menus, lock and inactive workspaces", () => {
    const stage = document.createElement("div");
    const surface = document.createElement("div");
    stage.append(surface); document.body.append(stage);
    expect(webSurfaceVisible(surface, true)).toBe(true);
    expect(webSurfaceVisible(surface, false)).toBe(false);
    stage.setAttribute("inert", ""); expect(webSurfaceVisible(surface, true)).toBe(false);
    stage.removeAttribute("inert");
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
    expect(webSurfaceVisible(surface, true)).toBe(false);
    dialog.dataset.webNativeOverlay = "library";
    expect(webSurfaceVisible(surface, true)).toBe(true);
    const confirmation = document.createElement("div"); confirmation.setAttribute("role", "dialog"); document.body.append(confirmation);
    expect(webSurfaceVisible(surface, true)).toBe(false);
    confirmation.remove();
    dialog.remove(); stage.remove();
  });
});
