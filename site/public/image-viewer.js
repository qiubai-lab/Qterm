(() => {
  const links = document.querySelectorAll('[data-image-viewer]');
  if (!links.length || typeof HTMLDialogElement.prototype.showModal !== 'function') return;
  const dialog = document.createElement('dialog');
  dialog.className = 'image-viewer';
  dialog.setAttribute('aria-label', '图片预览');
  dialog.innerHTML = `
    <div class="image-viewer-stage" tabindex="0" aria-label="图片区域，双击或按 Enter 缩放，放大后拖动或使用方向键浏览">
      <div class="image-viewer-canvas"><img alt="" draggable="false" /></div>
    </div>
    <div class="image-viewer-scroll image-viewer-scroll-x" aria-hidden="true"><i></i></div>
    <div class="image-viewer-scroll image-viewer-scroll-y" aria-hidden="true"><i></i></div>
    <button type="button" data-close aria-label="关闭图片预览" autofocus><span aria-hidden="true">×</span> 关闭</button>`;
  document.body.append(dialog);
  const image = dialog.querySelector('img');
  const stage = dialog.querySelector('.image-viewer-stage');
  const close = dialog.querySelector('[data-close]');
  const canvas = dialog.querySelector('.image-viewer-canvas');
  const bars = ['x', 'y'].map(axis => dialog.querySelector(`.image-viewer-scroll-${axis}`));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let closeTimer;
  let closing = false;
  function finishClose() {
    clearTimeout(closeTimer);
    if (closing && dialog.open) dialog.close();
  }
  function requestClose() {
    if (closing || !dialog.open) return;
    closing = true;
    dialog.classList.add('image-viewer-closing');
    dialog.classList.remove('image-viewer-visible');
    if (reducedMotion.matches) finishClose();
    else closeTimer = setTimeout(finishClose, 220);
  }
  dialog.addEventListener('transitionend', event => {
    if (event.target === dialog && event.propertyName === 'opacity') finishClose();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) finishClose(); });
  let opener, drag, lastTap, hideTimer;
  let lastTouchTime = -Infinity;
  let zoomed = false;
  let backdropPress = false;

  function updateBars() {
    [
      [stage.clientWidth, stage.scrollWidth, stage.scrollLeft],
      [stage.clientHeight, stage.scrollHeight, stage.scrollTop],
    ].forEach(([visible, total, offset], index) => {
      const bar = bars[index];
      bar.hidden = total <= visible;
      const length = Math.min(100, Math.max(8, visible / (total || 1) * 100));
      const position = Math.max(0, Math.min(100 - length, offset / (total - visible || 1) * (100 - length)));
      bar.firstElementChild.style[index ? 'height' : 'width'] = `${length}%`;
      bar.firstElementChild.style[index ? 'top' : 'left'] = `${position}%`;
    });
  }
  function showBars() {
    if (!dialog.open) return;
    updateBars();
    clearTimeout(hideTimer);
    dialog.classList.add('image-viewer-scrolling');
    hideTimer = setTimeout(() => dialog.classList.remove('image-viewer-scrolling'), 1100);
  }
  function layout() {
    const fit = Math.min(1, stage.clientWidth / image.width, stage.clientHeight / image.height) || 1;
    const scale = zoomed ? Math.max(1, fit * 2) : fit;
    image.style.width = `${image.width * scale}px`;
    image.style.height = `${image.height * scale}px`;
    dialog.classList.toggle('image-viewer-zoomed', zoomed);
    updateBars();
  }
  function toggleZoom(x, y) {
    const before = image.getBoundingClientRect();
    const viewport = stage.getBoundingClientRect();
    const px = x ?? viewport.left + viewport.width / 2;
    const py = y ?? viewport.top + viewport.height / 2;
    const fractionX = Math.max(0, Math.min(1, (px - before.left) / (before.width || 1)));
    const fractionY = Math.max(0, Math.min(1, (py - before.top) / (before.height || 1)));
    zoomed = !zoomed;
    layout();
    const after = image.getBoundingClientRect();
    stage.scrollLeft += after.left + fractionX * after.width - px;
    stage.scrollTop += after.top + fractionY * after.height - py;
    showBars();
  }
  links.forEach(link => {
    link.setAttribute('role', 'button');
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', event => {
      event.preventDefault();
      const thumbnail = link.querySelector('img');
      opener = link;
      zoomed = false;
      lastTap = drag = undefined;
      image.src = link.href;
      image.alt = thumbnail.alt;
      image.width = Number(thumbnail.getAttribute('width'));
      image.height = Number(thumbnail.getAttribute('height'));
      clearTimeout(closeTimer);
      closing = false;
      dialog.classList.remove('image-viewer-closing', 'image-viewer-visible');
      dialog.showModal();
      document.documentElement.classList.add('image-viewer-open');
      layout();
      stage.scrollTop = stage.scrollLeft = 0;
      // Establish the transparent state before transitioning the modal and its backdrop.
      getComputedStyle(dialog).opacity;
      getComputedStyle(dialog, '::backdrop').opacity;
      dialog.classList.add('image-viewer-visible');
    });
    link.addEventListener('keydown', event => {
      if (event.key === ' ') { event.preventDefault(); link.click(); }
    });
  });
  stage.addEventListener('dblclick', event => {
    if (event.target !== image && !zoomed) return;
    // Touch double taps are handled below so browser double-click synthesis cannot toggle twice.
    if (event.sourceCapabilities?.firesTouchEvents || performance.now() - lastTouchTime < 500) return;
    event.preventDefault();
    toggleZoom(event.clientX, event.clientY);
  });
  stage.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: stage.scrollLeft, top: stage.scrollTop, moved: false, touch: event.pointerType === 'touch' };
    if (zoomed && !drag.touch) {
      stage.setPointerCapture(event.pointerId);
      dialog.classList.add('image-viewer-dragging');
      event.preventDefault();
    }
  });
  stage.addEventListener('pointermove', event => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) drag.moved = true;
    if (zoomed && !drag.touch) {
      stage.scrollLeft = drag.left - dx;
      stage.scrollTop = drag.top - dy;
      showBars();
    }
  });
  stage.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.touch) lastTouchTime = performance.now();
    if (drag.touch && !drag.moved && event.target === image) {
      const now = performance.now();
      if (lastTap && now - lastTap.time < 300 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 30) {
        event.preventDefault();
        toggleZoom(event.clientX, event.clientY);
        lastTap = undefined;
      } else lastTap = { time: now, x: event.clientX, y: event.clientY };
    } else lastTap = undefined;
    drag = undefined;
    dialog.classList.remove('image-viewer-dragging');
  });
  function cancelDrag() {
    drag = lastTap = undefined;
    dialog.classList.remove('image-viewer-dragging');
  }
  stage.addEventListener('pointercancel', cancelDrag);
  stage.addEventListener('lostpointercapture', () => { if (drag) cancelDrag(); });
  stage.addEventListener('scroll', showBars, { passive: true });
  window.addEventListener('resize', () => { if (dialog.open) { layout(); showBars(); } });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target === stage) { event.preventDefault(); toggleZoom(); }
    if (event.key === 'Tab') {
      if (event.shiftKey && event.target === stage) { event.preventDefault(); close.focus(); }
      else if (!event.shiftKey && event.target === close) { event.preventDefault(); stage.focus(); }
    }
  });
  close.addEventListener('click', requestClose);
  const isBackdrop = target => target === dialog || target === stage || target === canvas;
  dialog.addEventListener('pointerdown', event => { backdropPress = isBackdrop(event.target); });
  dialog.addEventListener('click', event => {
    if (isBackdrop(event.target) && backdropPress && !zoomed) requestClose();
    backdropPress = false;
  });
  dialog.addEventListener('close', () => {
    clearTimeout(closeTimer);
    closing = false;
    dialog.classList.remove('image-viewer-visible', 'image-viewer-closing');
    clearTimeout(hideTimer);
    cancelDrag();
    dialog.classList.remove('image-viewer-scrolling');
    document.documentElement.classList.remove('image-viewer-open');
    image.removeAttribute('src');
    opener?.focus({ preventScroll: true });
  });
})();
