export function fileTextShortcutLabels() {
  const platform = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`.toLowerCase();
  const modifier = platform.includes("mac") ? "⌘" : "Ctrl+";
  return {
    undo: `${modifier}Z`,
    redo: platform.includes("mac") ? `⇧${modifier}Z` : `${modifier}Shift+Z`,
    cut: `${modifier}X`,
    copy: `${modifier}C`,
    paste: `${modifier}V`,
    selectAll: `${modifier}A`,
  };
}

export function selectedTextWithin(root: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return "";
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (!root.contains(selection.getRangeAt(index).commonAncestorContainer)) return "";
  }
  return selection.toString();
}

export function selectAllTextWithin(root: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(root);
  selection.removeAllRanges();
  selection.addRange(range);
}
