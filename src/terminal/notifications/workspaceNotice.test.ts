import { describe, expect, it } from "vitest";
import { createWorkspaceNotice } from "./workspaceNotice";
describe("workspace notice presentation", () => {
  it("merges the current workspace, replaces others and rejects stale dismissals", () => {
    const store = createWorkspaceNotice();
    const input = { workspaceId: "a", blockId: "one", epoch: 1, body: "first" };
    store.show(input);
    const first = store.getSnapshot()!;
    store.show({ ...input, blockId: "two", body: "latest" });
    expect(store.getSnapshot()).toMatchObject({ count: 2, blockId: "two", body: "latest" });
    store.dismiss(first.revision);
    expect(store.getSnapshot()).not.toBeNull();
    store.show({ ...input, workspaceId: "b" });
    expect(store.getSnapshot()).toMatchObject({ count: 1, workspaceId: "b" });
    store.prune(item => item.epoch === 2);
    expect(store.getSnapshot()).toBeNull();
  });
});
