import { expect, it } from "vitest";
import { blockIds, findLeaf, moveTerminal, splitTerminal } from "./layout";
import { workspaceReducer } from "./reducer";
import type { LayoutLeaf, WorkspaceDocument } from "./model";

const web: LayoutLeaf = { type: "web", blockId: "web", profileId: "remote" };
const others: LayoutLeaf[] = [
  { type: "terminal", blockId: "terminal", profileId: null, restoreDirectory: null },
  { type: "files", blockId: "files", profileId: null, path: "/" },
  { type: "network", blockId: "network", profileId: null },
  { type: "git", blockId: "git", target: { type: "local", path: "/repo" } },
  { type: "web", blockId: "other-web", profileId: null },
];
it.each(others)("preserves both identities and connection state when splitting a browser with $type", source => {
  const layout = splitTerminal(web, web.blockId, "horizontal", source, "original");
  for (const position of ["left", "right", "top", "bottom", "center"] as const) {
    const moved = moveTerminal(layout, source.blockId, web.blockId, position, "new-split");
    expect(blockIds(moved).sort()).toEqual([web.blockId, source.blockId].sort());
    expect(findLeaf(moved, web.blockId)).toBe(web);
    expect(findLeaf(moved, source.blockId)).toBe(source);
  }
});

it.each(["horizontal", "vertical"] as const)("creates a separate remote browser in a %s split", direction => {
  const state: WorkspaceDocument = { schemaVersion: 10, activeWorkspaceId: "w", recentProfileIds: [], recentGitRepositories: [], workspaces: [{ id: "w", name: "W", activeBlockId: "web", layout: web }] };
  const result = workspaceReducer(state, { type: "openWeb", workspaceId: "w", anchorBlockId: "web", profileId: "remote", newBlockId: "new-web", direction });
  expect(result.workspaces[0]).toMatchObject({ activeBlockId: "new-web", layout: { type: "split", direction,
    first: web, second: { type: "web", blockId: "new-web", profileId: "remote" } } });
  expect(findLeaf(result.workspaces[0].layout, "web")).toBe(web);
});
