import { useReducer } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspacePersistence } from "./useWorkspacePersistence";
import { workspaceReducer } from "./reducer";
import { createWorkspaceDocument } from "./model";
import type { WebTabCache } from "../lib/tauri/webTabs";

const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), tabsLoad: vi.fn(), tabsSave: vi.fn(), close: null as null | (() => Promise<void>) }));
vi.mock("../lib/runtime/environment", () => ({ hasWorkspaceRuntime: () => true }));
vi.mock("../lib/tauri/workspaces", () => ({ loadWorkspaces: mocks.load, saveWorkspaces: mocks.save }));
vi.mock("../lib/tauri/profiles", () => ({ listProfiles: async () => [], listProfileGroups: async () => [] }));
vi.mock("../lib/tauri/webTabs", () => ({ loadWebTabCache: mocks.tabsLoad, saveWebTabCache: mocks.tabsSave }));
vi.mock("../lib/tauri/window", () => ({ registerCurrentWindowCloseFlush: async (flush: () => Promise<void>) => { mocks.close = flush; return () => { mocks.close = null; }; } }));

function workspace() {
  const doc = createWorkspaceDocument(), layout = doc.workspaces[0].layout;
  doc.workspaces[0].layout = { type: "split", id: "split", direction: "horizontal", ratio: 0.5, first: layout, second: { type: "web", blockId: "browser", profileId: null } };
  return doc;
}
const cache: WebTabCache = { blocks: [{ blockId: "browser", profileId: null, selectedTabId: "tab", tabs: [{ id: "tab", address: "https://example.test/restored", title: "Restored" }] }] };
function useHarness() {
  const [document, dispatch] = useReducer(workspaceReducer, undefined, createWorkspaceDocument);
  return { ...useWorkspacePersistence(document, dispatch), document, dispatch };
}
beforeEach(() => {
  mocks.load.mockReset().mockResolvedValue(workspace()); mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.tabsLoad.mockReset().mockResolvedValue(cache); mocks.tabsSave.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("waits for tab hydration and closes with the current edited snapshot", async () => {
  let resolve!: (cache: WebTabCache) => void;
  mocks.tabsLoad.mockReturnValue(new Promise<WebTabCache>(done => { resolve = done; }));
  const view = renderHook(useHarness);
  expect(view.result.current.hydrated).toBe(false);
  expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.tabsSave).not.toHaveBeenCalled();
  await act(async () => resolve(cache));
  await waitFor(() => expect(mocks.close).not.toBeNull());
  const binding = view.result.current.webTabSessions.bind("browser", null); binding.activate();
  expect(binding.initial?.tabs[0].address).toBe(cache.blocks[0].tabs[0].address);
  binding.update({ tabs: [{ id: "new", address: "https://example.test/latest", title: "Latest" }], selectedTabId: "new" });
  await act(async () => { await mocks.close!(); });
  expect(mocks.tabsSave).toHaveBeenLastCalledWith({ blocks: [expect.objectContaining({ selectedTabId: "new" })] });
  expect(mocks.save).toHaveBeenLastCalledWith(view.result.current.document);
});

it("explicit block deletion removes its record and an old page callback cannot recreate it", async () => {
  const view = renderHook(useHarness);
  await waitFor(() => expect(view.result.current.hydrated).toBe(true));
  const binding = view.result.current.webTabSessions.bind("browser", null); binding.activate();
  act(() => view.result.current.dispatch({ type: "closeBlock", workspaceId: view.result.current.document.workspaces[0].id, blockId: "browser" }));
  binding.update(cache.blocks[0]);
  await act(async () => { await mocks.close!(); });
  expect(mocks.tabsSave).toHaveBeenLastCalledWith({ blocks: [] });
});

it("reports a cache read failure without writing an empty replacement", async () => {
  mocks.tabsLoad.mockRejectedValue(new Error("future version"));
  const view = renderHook(useHarness);
  await waitFor(() => expect(view.result.current.hydrated).toBe(true));
  expect(view.result.current.storageNotice).toContain("无法恢复浏览器标签");
  await act(async () => { await mocks.close!(); });
  expect(mocks.save).toHaveBeenCalled(); expect(mocks.tabsSave).not.toHaveBeenCalled();
});
