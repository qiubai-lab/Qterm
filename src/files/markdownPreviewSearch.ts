import type { FileSearchMatch } from "./fileSearchModel";

type HastNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

export function markdownSearchText(root: HTMLElement): string {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const parent = node.parentElement;
    if (!parent?.closest(".markdown-blocked-image")) parts.push(node.textContent ?? "");
    node = walker.nextNode();
  }
  return parts.join("");
}

export function markdownSearchPlugin(matches: FileSearchMatch[], activeIndex: number) {
  return () => (tree: HastNode) => {
    let offset = 0;

    function visit(node: HastNode) {
      if (!node.children) return;
      const nextChildren: HastNode[] = [];
      for (const child of node.children) {
        if (child.type !== "text" || !child.value) {
          visit(child);
          nextChildren.push(child);
          continue;
        }
        const start = offset;
        const end = start + child.value.length;
        offset = end;
        const intersections = matches
          .map((match, index) => ({ match, index }))
          .filter(({ match }) => match.from < end && match.to > start);
        if (intersections.length === 0) {
          nextChildren.push(child);
          continue;
        }
        let cursor = start;
        for (const { match, index } of intersections) {
          const matchStart = Math.max(start, match.from);
          const matchEnd = Math.min(end, match.to);
          if (matchStart > cursor) nextChildren.push(textNode(child.value.slice(cursor - start, matchStart - start)));
          nextChildren.push({
            type: "element",
            tagName: "mark",
            properties: {
              className: index === activeIndex
                ? ["file-search-match", "file-search-match-active"]
                : ["file-search-match"],
            },
            children: [textNode(child.value.slice(matchStart - start, matchEnd - start))],
          });
          cursor = matchEnd;
        }
        if (cursor < end) nextChildren.push(textNode(child.value.slice(cursor - start)));
      }
      node.children = nextChildren;
    }

    visit(tree);
  };
}

function textNode(value: string): HastNode {
  return { type: "text", value };
}
