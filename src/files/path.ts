export function parentPath(path: string, local: boolean): string | null {
  if (local && /^[A-Za-z]:[\\/]?$/.test(path)) return null;
  if (!local && path === "/") return null;
  const normalized = path.replace(/[\\/]+$/, "");
  const separator = local && normalized.includes("\\") ? "\\" : "/";
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  if (index < 0) return null;
  if (index === 0) return separator;
  const parent = normalized.slice(0, index);
  return /^[A-Za-z]:$/.test(parent) ? `${parent}${separator}` : parent;
}
