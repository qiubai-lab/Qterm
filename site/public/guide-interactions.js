// Progressive enhancement: instructions and anchors remain usable without JS.
const english = document.documentElement.lang === 'en';
const compact = window.matchMedia('(max-width: 760px)');
for (const details of document.querySelectorAll('.article-toc details')) {
  details.open = !compact.matches;
}
for (const block of document.querySelectorAll('.site-article pre')) {
  const code = block.querySelector('code');
  if (!code || !navigator.clipboard?.writeText) continue;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  const label = english ? 'Copy command' : '复制命令';
  button.textContent = label;
  button.setAttribute('aria-live', 'polite');
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = english ? 'Copied' : '已复制';
    } catch {
      button.textContent = english ? 'Select and copy manually' : '请选中命令手动复制';
    }
    setTimeout(() => { button.textContent = label; }, 2400);
  });
  block.append(button);
}
