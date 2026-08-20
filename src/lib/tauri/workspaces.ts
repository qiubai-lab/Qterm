import { invoke } from "@tauri-apps/api/core";

import type { WorkspaceDocument } from "../../workspace/model";

export function loadWorkspaces(): Promise<WorkspaceDocument | null> {
  return invoke<WorkspaceDocument | null>("workspace_load");
}

export function saveWorkspaces(document: WorkspaceDocument): Promise<void> {
  return invoke("workspace_save", { document });
}
