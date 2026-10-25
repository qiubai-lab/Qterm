import { expect, it } from "vitest";
import { createWebTabSessionStore } from "./webTabSessionStore";
import { createWorkspaceDocument, type WorkspaceDocument } from "../workspace/model";
import type { WebTabCache } from "../lib/tauri/webTabs";

const cache: WebTabCache = { blocks: ["a", "b"].map(blockId => ({ blockId, profileId: null, selectedTabId: "2", tabs: [
  { id: "1", address: `https://example.test/${blockId}`, title: blockId }, { id: "2", address: "", title: "" },
] })) };
function layout(profileId: string | null = null, includeB = true): WorkspaceDocument {
  const doc = createWorkspaceDocument();
  doc.workspaces[0].layout = includeB ? { type: "split", id: "s", ratio: 0.5, direction: "horizontal",
    first: { type: "web", blockId: "a", profileId }, second: { type: "web", blockId: "b", profileId: null } } : { type: "web", blockId: "a", profileId };
  return doc;
}
it("restores same-target blocks independently and preserves state across remount", () => {
  const store = createWebTabSessionStore(); store.restore(cache, layout());
  const a = store.bind("a", null); a.activate();
  a.update({ selectedTabId: "1", tabs: [cache.blocks[0].tabs[0]] });
  expect(store.bind("a", null).initial?.tabs).toHaveLength(1);
  expect(store.bind("a", null).initial?.selectedTabId).toBe("1");
  expect(store.bind("b", null).initial).toEqual(cache.blocks[1]);
  const remount = store.bind("a", null); remount.activate();
  a.update(cache.blocks[0]);
  expect(remount.initial?.tabs).toHaveLength(1);
  expect(store.snapshot()?.blocks[0].tabs).toHaveLength(1);
});
it("deletes only removed blocks and rejects stale deleted/retargeted callbacks", () => {
  const store = createWebTabSessionStore(); store.restore(cache, layout());
  const a = store.bind("a", null), b = store.bind("b", null); a.activate(); b.activate();
  store.reconcile(layout(null, false)); b.update(cache.blocks[1]);
  expect(store.snapshot()?.blocks.map(block => block.blockId)).toEqual(["a"]);
  store.reconcile(layout("remote", false)); a.update(cache.blocks[0]);
  expect(store.snapshot()?.blocks).toEqual([]);
  expect(store.bind("a", "remote").initial).toBeUndefined();
});
it("never writes before successful hydration and strips transient/unsafe page state", () => {
  const store = createWebTabSessionStore(); const binding = store.bind("a", null); binding.activate(); binding.update(cache.blocks[0]);
  expect(store.snapshot()).toBeNull();
  store.restore(cache, layout());
  binding.update({ selectedTabId: "x", tabs: [{ id: "x", address: "file:///private", title: "line\nwith\tcontrols\u0085" }] });
  expect(store.snapshot()?.blocks[0].tabs).toEqual([{ id: "x", address: "", title: "linewithcontrols" }]);
  store.reconcile(createWorkspaceDocument());
  expect(store.snapshot()?.blocks).toEqual([]);
});
