import { subscribeDataAccess, dataPaused } from "../dataAccess";
import type * as Desktop from "../../lib/tauri/workspaces";
import type { WorkspaceDocument } from "../../workspace/model";
import { api } from "../http";
let revision = 0;
let uncertain = false;
subscribeDataAccess(() => { if (dataPaused()) uncertain = true; });
export const loadWorkspaces: typeof Desktop.loadWorkspaces = async () => {
  const value = await api<{ document: WorkspaceDocument | null; revision: number }>("/workspace"); revision = value.revision; uncertain = false; return value.document;
};
export const saveWorkspaces: typeof Desktop.saveWorkspaces = async document => {
  if (uncertain) { const value = await api<{revision:number}>("/workspace"); revision = value.revision; uncertain = false; }
  const value = await api<{ revision: number }>("/workspace", "PUT", { document, revision }); revision = value.revision;
};
