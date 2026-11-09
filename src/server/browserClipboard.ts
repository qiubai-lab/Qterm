/** Browser-only clipboard access. Never sends clipboard contents to the server. */
export function pasteShortcutHint(): string {
  const mac = /mac/i.test(`${navigator.platform} ${navigator.userAgent}`);
  return `浏览器无法直接读取剪贴板，请在目标位置按 ${mac ? "⌘V" : "Ctrl+V"} 粘贴。`;
}

export async function readText(): Promise<string> {
  try {
    if (navigator.clipboard?.readText) return await navigator.clipboard.readText();
  } catch { /* Permissions may deny access even in a secure context. */ }
  throw new Error(pasteShortcutHint());
}

export async function writeText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* Try user-initiated legacy copy before reporting failure. */ }
  }
  // With no async API, run synchronously within the original user gesture.
  if (!copyWithSelection(text)) throw new Error("浏览器未允许剪贴板写入，请手动选择文本复制。");
}

function copyWithSelection(text: string): boolean {
  const focused = document.activeElement;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, i) => selection.getRangeAt(i).cloneRange()) : [];
  const inputSelection = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement
    ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : null;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.tabIndex = -1;
  field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
  document.body.append(field);
  try {
    field.focus({ preventScroll: true });
    field.select();
    return document.execCommand?.("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus({ preventScroll: true });
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach(range => selection.addRange(range));
    }
    if (inputSelection?.start != null && inputSelection.end != null && (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)) {
      focused.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
    }
  }
}
