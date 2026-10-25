// Geometry is in viewport CSS pixels; scroll offsets stay in the element's own coordinates.
((document, window, element, axis) => {
  const root = element === document.scrollingElement || element === document.documentElement;
  const style = window.getComputedStyle(element);
  const vertical = axis === "y", rtl = style.direction === "rtl";
  const client = vertical ? element.clientHeight : element.clientWidth;
  const extent = vertical ? element.scrollHeight : element.scrollWidth;
  const overflow = vertical ? style.overflowY : style.overflowX;
  if ((!root && !/^(auto|scroll|overlay)$/.test(overflow)) || /^(hidden|clip)$/.test(overflow) || extent <= client + 1 || client <= 0) return null;
  const raw = root ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight } : element.getBoundingClientRect();
  if (raw.width <= 0 || raw.height <= 0) return null;
  const scaleX = root ? 1 : raw.width / element.offsetWidth, scaleY = root ? 1 : raw.height / element.offsetHeight;
  const left = root ? 0 : raw.left + element.clientLeft * scaleX;
  const top = root ? 0 : raw.top + element.clientTop * scaleY;
  const right = root ? window.innerWidth : left + element.clientWidth * scaleX;
  const bottom = root ? window.innerHeight : top + element.clientHeight * scaleY;
  let clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  if (!root) for (let parent = element.parentElement; parent && parent !== document.documentElement; parent = parent.parentElement) {
    const css = window.getComputedStyle(parent), rect = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { clip.left = Math.max(clip.left, rect.left); clip.right = Math.min(clip.right, rect.right); }
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { clip.top = Math.max(clip.top, rect.top); clip.bottom = Math.min(clip.bottom, rect.bottom); }
  }
  const edge = vertical ? (rtl ? left : right) : bottom;
  if (vertical ? edge < clip.left || edge > clip.right + 1 : edge < clip.top || edge > clip.bottom + 1) return null;
  const start = vertical ? top : left, length = Math.max(0, (vertical ? bottom - top : right - left) - 2);
  const size = Math.min(length, Math.max(24, length * client / extent));
  const range = extent - client, travel = length - size;
  const offset = vertical ? element.scrollTop : element.scrollLeft * (rtl ? -1 : 1);
  const position = travel * Math.max(0, Math.min(range, offset)) / range;
  const visibleStart = Math.max(start, vertical ? clip.top : clip.left);
  const visibleEnd = Math.min(start + length, vertical ? clip.bottom : clip.right);
  if (visibleEnd <= visibleStart) return null;
  return { axis, root, rtl, edge, start, length, size, range, travel, offset, position, visibleStart, visibleEnd,
    left: vertical ? (rtl ? edge : edge - 12) : left, top: vertical ? top : edge - 12,
    width: vertical ? 12 : length, height: vertical ? length : 12 };
})
