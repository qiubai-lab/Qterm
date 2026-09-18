(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-tabs]').forEach(tabList => {
    const tabs = Array.from(tabList.querySelectorAll('button'));
    const panels = tabs.map(tab => document.getElementById(tab.getAttribute('aria-controls')));
    if (panels.every(Boolean)) {
      tabList.setAttribute('role', 'tablist');
      function activate(index, focus = false) {
        tabs.forEach((tab, i) => {
          tab.setAttribute('role', 'tab');
          tab.setAttribute('aria-selected', String(i === index));
          tab.tabIndex = i === index ? 0 : -1;
          panels[i].setAttribute('role', 'tabpanel');
          panels[i].hidden = i !== index;
          panels[i].tabIndex = 0;
        });
        if (focus) tabs[index].focus();
        const panel = panels[index];
        panel.getAnimations?.().forEach(animation => animation.cancel());
        if (!reducedMotion.matches) {
          panel.animate?.([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
        }
      }
      tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => activate(index));
        tab.addEventListener('keydown', event => {
          const next = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
          if (next !== undefined) {
            event.preventDefault();
            activate(next, true);
          }
        });
      });
      activate(0);
    }
  });
  if (!reducedMotion.matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('reveal-pending');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0 });
    document.querySelectorAll('[data-reveal]').forEach(element => {
      if (element.getBoundingClientRect().top > window.innerHeight) {
        element.classList.add('reveal-pending');
        observer.observe(element);
      }
    });
    reducedMotion.addEventListener('change', () => {
      if (reducedMotion.matches) {
        observer.disconnect();
        document.querySelectorAll('.reveal-pending').forEach(element => element.classList.remove('reveal-pending'));
      }
    });
  }
})();
