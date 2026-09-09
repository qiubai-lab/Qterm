export type FileSearchMatch = { from: number; to: number };
export type FileSearchDirection = "next" | "previous";

export function findFileSearchMatches(text: string, query: string, limit = Number.POSITIVE_INFINITY): FileSearchMatch[] {
  if (!query) return [];
  const expression = new RegExp(escapeRegExp(query), "giu");
  const matches: FileSearchMatch[] = [];
  for (const match of text.matchAll(expression)) {
    matches.push({ from: match.index, to: match.index + match[0].length });
    if (matches.length >= limit) break;
  }
  return matches;
}

export function moveFileSearchIndex(current: number, count: number, direction: FileSearchDirection): number {
  if (count === 0) return -1;
  if (direction === "previous") return (current <= 0 ? count : current) - 1;
  return current < 0 || current >= count - 1 ? 0 : current + 1;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
