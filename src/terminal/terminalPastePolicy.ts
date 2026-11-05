const LONG_PASTE_THRESHOLD = 1000;

export function isGuardedPaste(text: string): boolean {
  return text.length > LONG_PASTE_THRESHOLD || /[\r\n]/.test(text);
}

export function pasteLineCount(text: string): number {
  return text.split(/\r\n|\r|\n/).length;
}

