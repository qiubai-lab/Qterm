import { expect, it, vi } from "vitest";
import { createWorkspaceSaveQueue } from "./workspaceSaveQueue";
import { createWorkspaceDocument } from "./model";

it("flushes deletion after an in-flight tab save without reviving the deleted record", async () => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  const saveDocument = vi.fn().mockResolvedValue(undefined);
  const writes: unknown[] = [];
  const saveTabs = vi.fn(async (cache) => { if (!writes.length) await blocked; writes.push(cache); });
  const save = createWorkspaceSaveQueue(saveDocument, saveTabs);
  const doc = createWorkspaceDocument();
  const initial = { blocks: [{ blockId: "deleted", profileId: null, selectedTabId: "tab", tabs: [{ id: "tab", address: "https://example.test/", title: "old" }] }] };
  const first = save(doc, initial);
  await Promise.resolve(); await Promise.resolve();
  const last = save(doc, { blocks: [] });
  expect(saveDocument).toHaveBeenCalledTimes(1);
  release(); await Promise.all([first, last]);
  expect(saveDocument).toHaveBeenCalledTimes(2);
  expect(writes).toEqual([initial, { blocks: [] }]);
});
it("does not save tabs after a failed workspace save and permits the next retry", async () => {
  const workspace = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
  const tabs = vi.fn().mockResolvedValue(undefined);
  const save = createWorkspaceSaveQueue(workspace, tabs), doc = createWorkspaceDocument();
  await expect(save(doc, { blocks: [] })).rejects.toThrow("disk");
  expect(tabs).not.toHaveBeenCalled();
  await save(doc, null); expect(tabs).not.toHaveBeenCalled();
  await save(doc, { blocks: [] }); expect(tabs).toHaveBeenCalledOnce();
});
