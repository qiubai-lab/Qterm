import { describe, expect, it } from "vitest";

import type { Workspace } from "./model";
import { openFileWindowAction } from "./fileWindow";
import { defaultRuntime, type TerminalRuntime } from "./workspaceRuntime";

const connectedRuntime = (overrides: Partial<TerminalRuntime> = {}): TerminalRuntime => ({
  ...defaultRuntime,
  sessionId: "session-1",
  kind: "ssh",
  status: "connected",
  ...overrides,
});

describe("openFileWindowAction", () => {
  it("inherits a remote terminal profile and its valid OSC 7 directory", () => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "t", layout: { type: "terminal", blockId: "t", profileId: "p", restoreDirectory: null } };

    expect(openFileWindowAction(workspace, {
      t: connectedRuntime({ cwd: "/tmp", cwdSource: "osc7" }),
    }, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "t", profileId: "p", path: "/tmp",
    });
  });

  it("opens a local terminal OSC 7 directory without a remote profile", () => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "t", layout: { type: "terminal", blockId: "t", profileId: null, restoreDirectory: null } };

    expect(openFileWindowAction(workspace, {
      t: connectedRuntime({ kind: "local", initialCwd: "/Users/tester", cwd: "/Users/tester/project", cwdSource: "osc7" }),
    }, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "t", profileId: null, path: "/Users/tester/project",
    });
  });

  it.each([
    ["the feature is disabled", false, connectedRuntime({ cwd: "/srv/stale", cwdSource: "osc7" })],
    ["the terminal has not reported a path", true, connectedRuntime()],
    ["the path came from terminal startup", true, connectedRuntime({ initialCwd: "/srv/start", cwd: "/srv/start", cwdSource: "initial" })],
    ["the terminal is disconnected", true, connectedRuntime({ status: "closed", cwd: "/srv/stale", cwdSource: "osc7" })],
    ["the reported path is empty", true, connectedRuntime({ cwd: "   ", cwdSource: "osc7" })],
  ])("uses the remote home when %s", (_label, enabled, runtime) => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "t", layout: { type: "terminal", blockId: "t", profileId: "p", restoreDirectory: null } };

    expect(openFileWindowAction(workspace, { t: runtime }, enabled)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "t", profileId: "p", path: ".",
    });
  });

  it("uses the local home when no OSC 7 directory is available", () => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "t", layout: { type: "terminal", blockId: "t", profileId: null, restoreDirectory: null } };

    expect(openFileWindowAction(workspace, {
      t: connectedRuntime({ kind: "local", initialCwd: "/Users/tester", cwd: "/Users/tester", cwdSource: "initial" }),
    }, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "t", profileId: null, path: "~",
    });
  });

  it.each([
    ["files", { type: "files" as const, blockId: "active", profileId: "p", path: "/srv/current" }],
    ["network", { type: "network" as const, blockId: "active", profileId: "p" }],
  ])("inherits an active remote %s connection without cloning its path", (_label, layout) => {
    const workspace: Workspace = { id: "w", name: "W", activeBlockId: "active", layout };

    expect(openFileWindowAction(workspace, {}, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "active", profileId: "p", path: ".",
    });
  });

  it("uses the local home for an active local files connection", () => {
    const workspace: Workspace = {
      id: "w",
      name: "W",
      activeBlockId: "active",
      layout: { type: "files", blockId: "active", profileId: null, path: "/Users/tester/current" },
    };

    expect(openFileWindowAction(workspace, {}, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "active", profileId: null, path: "~",
    });
  });

  it("falls back to the first valid block when the active block id is stale", () => {
    const workspace: Workspace = {
      id: "w",
      name: "W",
      activeBlockId: "missing",
      layout: {
        type: "split",
        id: "split-1",
        direction: "horizontal",
        ratio: 0.5,
        first: { type: "terminal", blockId: "first", profileId: "p", restoreDirectory: null },
        second: { type: "files", blockId: "second", profileId: null, path: "~" },
      },
    };

    expect(openFileWindowAction(workspace, {
      first: connectedRuntime({ cwd: "/srv/project", cwdSource: "osc7" }),
    }, true)).toEqual({
      type: "openFiles", workspaceId: "w", anchorBlockId: "first", profileId: "p", path: "/srv/project",
    });
  });
});
