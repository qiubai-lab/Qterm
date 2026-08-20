export function parseOsc7Cwd(data: string): string | null {
  try {
    const url = new URL(data);
    if (url.protocol !== "file:") return null;
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    if (!path || path.includes("\0")) return null;
    return path;
  } catch {
    return null;
  }
}
