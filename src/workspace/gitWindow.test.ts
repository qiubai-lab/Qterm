import { describe, expect, it } from "vitest";

import { createFilesNode, createTerminalNode, type Workspace } from "./model";
import { openGitWindowAction } from "./gitWindow";
import { defaultRuntime } from "./workspaceRuntime";

describe("openGitWindowAction", () => {
  it("inherits only absolute local Files paths", () => {
    const files = createFilesNode(null, "D:/work/project");
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: files.blockId, layout: files };
    expect(openGitWindowAction(workspace, {})).toMatchObject({ type: "openGit", target: { type: "local", path: "D:/work/project" } });
    expect(openGitWindowAction({ ...workspace, layout: { ...files, profileId: "remote" } }, {})).toMatchObject({ target: { type: "remote", profileId: "remote", path: "D:/work/project" } });
  });

  it("inherits a local terminal OSC 7 directory but not startup or remote paths", () => {
    const terminal = createTerminalNode(null, "terminal-1");
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: terminal.blockId, layout: terminal };
    expect(openGitWindowAction(workspace, { "terminal-1": { ...defaultRuntime, kind: "local", status: "connected", cwd: "/work/project", cwdSource: "osc7" } })).toMatchObject({ target: { type: "local", path: "/work/project" } });
    expect(openGitWindowAction(workspace, { "terminal-1": { ...defaultRuntime, kind: "local", cwd: "/work/project", cwdSource: "initial" } })).toMatchObject({ target: { type: "unbound" } });
    expect(openGitWindowAction({ ...workspace, layout: { ...terminal, profileId: "remote" } }, { "terminal-1": { ...defaultRuntime, kind: "ssh", status: "connected", cwd: "/srv/project", cwdSource: "osc7" } })).toMatchObject({ target: { type: "remote", profileId: "remote", path: "/srv/project" } });
  });
});
