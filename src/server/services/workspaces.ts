import type * as Desktop from "../../lib/tauri/workspaces";
import type { WorkspaceDocument } from "../../workspace/model";
import { api } from "../http";
let revision = 0;
export const loadWorkspaces: typeof Desktop.loadWorkspaces = async () => {
  const value = await api<{ document: WorkspaceDocument | null; revision: number }>("/workspace"); revision = value.revision; return value.document;
};
export const saveWorkspaces: typeof Desktop.saveWorkspaces = async document => {
  const value = await api<{ revision: number }>("/workspace", "PUT", { document, revision }); revision = value.revision;
};
