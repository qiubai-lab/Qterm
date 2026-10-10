/** OSC 0/2 titles are free text; only suppress complete, recognizable path titles. */
export function applicationTerminalTitle(title: string): string {
  const value = title.trim();
  const shellTitle = /^[^\s@:]+@(?:\[[^\]]+\]|[^\s:]+):\s*(.*)$/.exec(value);
  const path = shellTitle?.[1] ?? value;
  const isPath = /^(?:\/|~(?:\/|$)|[A-Za-z]:[\\/]|\\\\[^\\]+\\)/.test(path);
  return isPath ? "" : value;
}
