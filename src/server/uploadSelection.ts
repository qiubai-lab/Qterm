import { randomId } from "../lib/randomId";
/** Browser-selected handles only; never interprets client OS paths as server paths. */
export interface UploadEntry { path: string; file?: File }
const selections = new Map<string, UploadEntry[] | Error>();
export function registerUpload(entries: UploadEntry[]): string {
  if (entries.length > 10000 || entries.reduce((sum, e) => sum + (e.file?.size ?? 0), 0) > 128 * 1024 * 1024) throw new Error("一次上传最多 10,000 项、128 MiB");
  for (const entry of entries) if (!entry.path || entry.path.length > 4096 || entry.path.split("/").some(p => !p || p === "." || p === ".." || /[\\:\0]/.test(p))) throw new Error("上传目录包含无效路径");
  if (selections.size >= 32) selections.delete(selections.keys().next().value!);
  const id = randomId(); selections.set(id, entries); return id;
}
export function registerUploadError(reason: unknown): string {
  if (selections.size >= 32) selections.delete(selections.keys().next().value!);
  const id = randomId();
  selections.set(id, reason instanceof Error ? reason : new Error("读取上传文件失败"));
  return id;
}
export function takeUpload(id: string): UploadEntry[] {
  const entries = selections.get(id); selections.delete(id);
  if (!entries) throw new Error("请重新选择上传文件");
  if (entries instanceof Error) throw entries;
  return entries;
}
export function selectUpload(folder: boolean, multiple = true): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.multiple = multiple; input.webkitdirectory = folder;
    input.addEventListener("cancel", () => resolve([]), { once: true });
    input.addEventListener("change", () => {
      try { const entries = Array.from(input.files ?? []).map(file => ({ file, path: folder ? file.webkitRelativePath : file.name })); resolve(entries.length ? [registerUpload(entries)] : []); }
      catch (error) { reject(error); }
    }, { once: true }); input.click();
  });
}
export async function collectDrop(data: DataTransfer): Promise<string[]> {
  const entries: UploadEntry[] = [];
  async function walk(entry: FileSystemEntry, prefix = "", depth = 0): Promise<void> {
    if (depth > 64 || entries.length >= 10000) throw new Error("上传目录过深或项目过多");
    const path = prefix + entry.name;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      entries.push({ path, file });
    } else if (entry.isDirectory) {
      entries.push({ path });
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${path}/`, depth + 1);
      }
    }
  }
  // Acquire entries synchronously; DataTransfer becomes protected after dispatch.
  const roots = Array.from(data.items ?? []).map(item => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  const fallback = Array.from(data.files);
  if (roots.length) for (const root of roots) await walk(root);
  else entries.push(...fallback.map(file => ({ path: file.name, file })));
  return entries.length ? [registerUpload(entries)] : [];
}
