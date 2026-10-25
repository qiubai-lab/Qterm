// Geometry is in viewport CSS pixels; scroll offsets stay in the element's own coordinates.
((document, window, element, axis) => {
  const root = element === document.scrollingElement || element === document.documentElement;
  const style = window.getComputedStyle(element);
  const vertical = axis === "y", rtl = style.direction === "rtl";
  const client = vertical ? element.clientHeight : element.clientWidth;
  const extent = vertical ? element.scrollHeight : element.scrollWidth;
  const overflow = vertical ? style.overflowY : style.overflowX;
  if (!root || /^(hidden|clip)$/.test(overflow) || extent <= client + 1 || client <= 0) return null;
  const left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
  const edge = vertical ? (rtl ? left : right) : bottom;
  const start = 0, length = Math.max(0, (vertical ? bottom : right) - 2);
  const size = Math.min(length, Math.max(24, length * client / extent));
  const range = extent - client, travel = length - size;
  const offset = vertical ? element.scrollTop : element.scrollLeft * (rtl ? -1 : 1);
  const position = travel * Math.max(0, Math.min(range, offset)) / range;
  const visibleStart = 0, visibleEnd = length;
  if (visibleEnd <= visibleStart) return null;
  return { axis, root, rtl, edge, start, length, size, range, travel, offset, position, visibleStart, visibleEnd,
    left: vertical ? (rtl ? edge : edge - 12) : left, top: vertical ? top : edge - 12,
    width: vertical ? 12 : length, height: vertical ? length : 12 };
})
