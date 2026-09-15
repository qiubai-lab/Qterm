import type * as Desktop from "../../lib/tauri/workspaces";
import { createWorkspaceDocument } from "../../workspace/model";
import { DEMO_HOME } from "../fixtures";

export const loadWorkspaces: typeof Desktop.loadWorkspaces = async () => {
  const document = createWorkspaceDocument();
  const workspace = document.workspaces[0];
  workspace.name = "产品体验";
  const terminal = workspace.layout;
  if (terminal.type === "terminal") {
    terminal.restoreDirectory = DEMO_HOME;
    if (new URLSearchParams(location.search).get("scene") !== "local") terminal.profileId = "demo-development";
  }
  return document;
};
// The demo deliberately starts fresh on reload; no desktop data or session IDs are persisted.
export const saveWorkspaces: typeof Desktop.saveWorkspaces = async () => undefined;
