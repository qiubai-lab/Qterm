// Read the author's viewport policy without mistaking our native-bar suppression for it.
((document, window, element) => {
  const sheet = document.getElementById("qterm-native-scrollbars")?.sheet;
  const disabled = sheet?.disabled;
  if (sheet) sheet.disabled = true;
  try {
    const style = window.getComputedStyle(element);
    const body = document.body && window.getComputedStyle(document.body);
    const pseudo = window.getComputedStyle(element, "::-webkit-scrollbar");
    const invisible = style.visibility === "hidden" || style.visibility === "collapse"
      || style.display === "none" || style.opacity === "0" || style.contentVisibility === "hidden";
    const hidden = invisible || style.scrollbarWidth === "none" || pseudo.display === "none";
    // In standards mode a visible html overflow delegates the viewport policy to body.
    const overflow = style.overflowX === "visible" && style.overflowY === "visible" && body?.display !== "none" ? body || style : style;
    return {
      x: !hidden && parseFloat(pseudo.height) !== 0 && !/^(hidden|clip)$/.test(overflow.overflowX),
      y: !hidden && parseFloat(pseudo.width) !== 0 && !/^(hidden|clip)$/.test(overflow.overflowY),
    };
  } finally {
    if (sheet) sheet.disabled = disabled;
  }
})
