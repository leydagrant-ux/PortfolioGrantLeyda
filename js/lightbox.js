/**
 * Accessible image lightbox and the FEA before/after compare slider.
 *
 * The lightbox is keyboard-complete: Enter or Space opens (the triggers are real
 * buttons), arrows page, Escape closes, focus is trapped while open and returned to the
 * trigger on close.
 */

/* -------------------------------------------------------------------------- */
/* Lightbox                                                                    */
/* -------------------------------------------------------------------------- */

export function initLightbox() {
  const shots = [...document.querySelectorAll('.shot[data-full]')];
  if (!shots.length) return;

  const box = document.createElement('div');
  box.className = 'lightbox';
  box.dataset.open = 'false';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Image viewer');
  box.innerHTML = `
    <button class="icon-btn lightbox__close" data-lb-close aria-label="Close image viewer">✕</button>
    <button class="icon-btn lightbox__nav lightbox__nav--prev" data-lb-prev aria-label="Previous image">‹</button>
    <button class="icon-btn lightbox__nav lightbox__nav--next" data-lb-next aria-label="Next image">›</button>
    <figure class="lightbox__fig">
      <img alt="">
      <figcaption></figcaption>
    </figure>`;
  document.body.appendChild(box);

  const img = box.querySelector('img');
  const cap = box.querySelector('figcaption');
  const closeBtn = box.querySelector('[data-lb-close]');

  let i = 0;
  let opener = null;

  const show = (n) => {
    i = (n + shots.length) % shots.length;
    const s = shots[i];
    img.src = s.dataset.full;
    img.alt = s.dataset.alt || s.querySelector('img')?.alt || '';
    cap.textContent = s.dataset.caption || s.querySelector('figcaption')?.textContent || '';
  };

  const open = (n, trigger) => {
    opener = trigger;
    show(n);
    box.dataset.open = 'true';
    document.body.style.overflow = 'hidden';
    // Force a style flush so visibility:visible is in effect, then focus synchronously.
    // focus() is a silent no-op on a visibility:hidden element, and deferring it to
    // requestAnimationFrame would never run at all in a backgrounded document.
    void box.offsetWidth;
    closeBtn.focus();
  };

  const close = () => {
    box.dataset.open = 'false';
    document.body.style.overflow = '';
    // Free the decoded image; a 1600px WebP left in memory for every gallery is waste.
    img.removeAttribute('src');
    opener?.focus();
    opener = null;
  };

  shots.forEach((s, n) => s.addEventListener('click', () => open(n, s)));

  box.querySelector('[data-lb-prev]').addEventListener('click', () => show(i - 1));
  box.querySelector('[data-lb-next]').addEventListener('click', () => show(i + 1));
  closeBtn.addEventListener('click', close);

  box.addEventListener('click', (e) => {
    if (e.target === box) close();
  });

  addEventListener('keydown', (e) => {
    if (box.dataset.open !== 'true') return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'Tab') {
      // Trap focus inside the dialog.
      const f = [...box.querySelectorAll('button')];
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Compare slider                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Wipes one image across another. Driven by a real range input underneath, so it is
 * keyboard operable and screen-reader legible for free — the visible handle is
 * decoration over a working control.
 */
export function initCompare() {
  document.querySelectorAll('.compare').forEach((c) => {
    const range = c.querySelector('input[type="range"]');
    if (!range) return;

    const paint = () => c.style.setProperty('--pos', `${range.value}%`);
    range.addEventListener('input', paint);
    paint();
  });
}
