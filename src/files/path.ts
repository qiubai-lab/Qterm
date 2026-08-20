export function parentPath(path: string, local: boolean): string | null {
  if (local) return parentLocalPath(path);
  if (!local && path === "/") return null;
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index < 0) return null;
  return index === 0 ? "/" : normalized.slice(0, index);
}

export function displayLocalPath(path: string): string {
  if (/^\\\\\?\\UNC\\/i.test(path)) return `\\\\${path.slice(8)}`;
  if (/^\\\\\?\\/.test(path)) return path.slice(4);
  return path;
}

export function isWindowsDriveRoot(path: string): boolean {
  return /^(?:\\\\\?\\)?[A-Za-z]:[\\/]?$/.test(path);
}

function parentLocalPath(path: string): string | null {
  if (isWindowsDriveRoot(path) || path === "/") return null;

  const verbatimUnc = path.match(/^\\\\\?\\UNC\\/i);
  if (verbatimUnc) return parentUncPath(path.slice(verbatimUnc[0].length), verbatimUnc[0]);
  if (/^\\\\/.test(path)) return parentUncPath(path.slice(2), "\\\\");

  const verbatimPrefix = path.match(/^\\\\\?\\/)?.[0] ?? "";
  const body = verbatimPrefix ? path.slice(verbatimPrefix.length) : path;
  const normalized = body.replace(/[\\/]+$/, "");
  const separator = normalized.includes("\\") ? "\\" : "/";
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index < 0) return null;
  if (index === 0) return `${verbatimPrefix}${separator}`;
  const parent = normalized.slice(0, index);
  const rootedParent = /^[A-Za-z]:$/.test(parent) ? `${parent}${separator}` : parent;
  return `${verbatimPrefix}${rootedParent}`;
}

function parentUncPath(body: string, prefix: string): string | null {
  const segments = body.split(/[\\/]+/).filter(Boolean);
  if (segments.length <= 2) return null;
  segments.pop();
  const parent = `${prefix}${segments.join("\\")}`;
  return segments.length === 2 ? `${parent}\\` : parent;
}
