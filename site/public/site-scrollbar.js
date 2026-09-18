(() => {
  const root = document.documentElement;
  const bar = document.createElement('div');
  bar.className = 'site-scrollbar';
  bar.tabIndex = 0;
  bar.setAttribute('role', 'scrollbar');
  bar.setAttribute('aria-label', '页面滚动');
  bar.setAttribute('aria-controls', 'site-main');
  bar.setAttribute('aria-orientation', 'vertical');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.innerHTML = '<span></span>';
  document.body.append(bar);
  const thumb = bar.firstElementChild;
  let timer, frame, drag;
  function update() {
    frame = undefined;
    const viewport = root.clientHeight;
    const total = root.scrollHeight;
    const range = Math.max(0, total - viewport);
    bar.hidden = range === 0;
    const track = bar.clientHeight;
    const size = Math.min(track, Math.max(28, track * viewport / (total || 1)));
    const fraction = range ? Math.max(0, Math.min(1, window.scrollY / range)) : 0;
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${fraction * (track - size)}px)`;
    bar.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  }
  function schedule() {
    if (frame === undefined) frame = requestAnimationFrame(update);
  }
  function reveal() {
    clearTimeout(timer);
    bar.classList.add('is-scrolling');
    timer = setTimeout(() => {
      if (!drag) bar.classList.remove('is-scrolling');
    }, 1100);
    schedule();
  }
  window.addEventListener('scroll', reveal, { passive: true });
  window.addEventListener('resize', schedule);
  new ResizeObserver(schedule).observe(document.body);
  bar.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    const rect = thumb.getBoundingClientRect();
    const insideThumb = event.clientY >= rect.top && event.clientY <= rect.bottom;
    const grab = insideThumb ? event.clientY - rect.top : rect.height / 2;
    drag = { id: event.pointerId, grab };
    bar.setPointerCapture(event.pointerId);
    root.classList.add('site-scrollbar-dragging');
    reveal();
    move(event);
  });
  function move(event) {
    if (!drag || drag.id !== event.pointerId) return;
    const track = bar.getBoundingClientRect();
    const travel = track.height - thumb.getBoundingClientRect().height;
    const fraction = Math.max(0, Math.min(1, (event.clientY - track.top - drag.grab) / (travel || 1)));
    window.scrollTo({ top: fraction * Math.max(0, root.scrollHeight - root.clientHeight), behavior: 'instant' });
    reveal();
  }
  bar.addEventListener('pointermove', move);
  function endDrag() {
    drag = undefined;
    root.classList.remove('site-scrollbar-dragging');
    reveal();
  }
  bar.addEventListener('pointerup', endDrag);
  bar.addEventListener('pointercancel', endDrag);
  bar.addEventListener('lostpointercapture', endDrag);
  bar.addEventListener('keydown', event => {
    const target = {
      ArrowDown: window.scrollY + 48, ArrowUp: window.scrollY - 48,
      PageDown: window.scrollY + root.clientHeight * .9, PageUp: window.scrollY - root.clientHeight * .9,
      Home: 0, End: root.scrollHeight - root.clientHeight,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    window.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
    reveal();
  });
  update();
})();
