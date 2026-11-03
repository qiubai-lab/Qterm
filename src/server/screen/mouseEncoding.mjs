/**
 * addon-serialize 0.14 restores tracking but omits the mouse wire encoding.
 * xterm 6 exposes no public encoding getter; isolate the pinned-version adapter
 * here. Derive current state instead of replaying historical DECSET sequences.
 */
export function serializeMouseEncoding(terminal) {
  const encoding = terminal._core.coreMouseService.activeEncoding;
  switch (encoding) {
    case 'DEFAULT': return '';
    case 'SGR': return '\x1b[?1006h';
    case 'SGR_PIXELS': return '\x1b[?1016h';
    default: throw new Error('unsupportedMouseEncoding');
  }
}
