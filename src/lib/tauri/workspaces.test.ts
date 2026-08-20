import { describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { createWorkspaceDocument } from "../../workspace/model";
import { loadWorkspaces, saveWorkspaces } from "./workspaces";

describe("workspace IPC client", () => {
  it("loads and saves only the persisted workspace document", async () => {
    const document = createWorkspaceDocument();
    invoke.mockResolvedValueOnce(document).mockResolvedValueOnce(undefined);
    expect(await loadWorkspaces()).toBe(document);
    await saveWorkspaces(document);
    expect(invoke).toHaveBeenLastCalledWith("workspace_save", { document });
  });
});
