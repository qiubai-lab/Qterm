import type * as Desktop from "../../lib/tauri/files";
import { getDemoProject, type DemoFile } from "../demoProject";
import { DEMO_HOME } from "../fixtures";
import { featureTarget, openFeatureSession } from "../featureSessions";
export type * from "../../lib/tauri/files";

function project(id: string | null) { return getDemoProject(id ? featureTarget(id, "files") : null); }
function document(file: DemoFile): Desktop.FileDocument { return { content: file.content, revision: String(file.revision), modifiedAt: null, size: new TextEncoder().encode(file.content).length }; }
function listing(id: string | null, input: string): Desktop.DirectoryListing {
  const owner = project(id); const path = owner.resolve(DEMO_HOME, input);
  return { path, entries: owner.list(path).map(entry => ({ ...entry, isSymlink: false, size: entry.isDirectory ? 0 : document(owner.read(entry.path)).size, modifiedAt: null, permissionMode: entry.isDirectory ? 493 : 420 })) };
}
export const listLocalDirectory: typeof Desktop.listLocalDirectory = async path => listing(null, path);
export const listRemoteDirectory: typeof Desktop.listRemoteDirectory = async (id, path) => listing(id, path);
export const listLocalRoots: typeof Desktop.listLocalRoots = async () => [{ name: "演示项目", path: DEMO_HOME }];
export const readTextFile: typeof Desktop.readTextFile = async (id, path) => document(project(id).read(path));
export const writeTextFile: typeof Desktop.writeTextFile = async (id, path, content, revision) => document(project(id).write(path, content, Number(revision)));
export const connectFileSession: typeof Desktop.connectFileSession = async (input, event) => openFeatureSession("files", input.profileId, event);
const unavailable = async (): Promise<never> => { throw new Error("此文件操作尚未模拟；可体验文本预览、编辑和保存。"); };
export const readBinaryFile: typeof Desktop.readBinaryFile = unavailable;
export const copyFile: typeof Desktop.copyFile = unavailable;
export const createEntry: typeof Desktop.createEntry = unavailable;
export const renameEntry: typeof Desktop.renameEntry = unavailable;
export const deleteEntry: typeof Desktop.deleteEntry = unavailable;
