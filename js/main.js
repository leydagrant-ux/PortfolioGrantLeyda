/**
 * Site-wide behaviour: theme, nav state, scroll reveals, count-ups, range fills.
 *
 * Everything here degrades to a sensible static state. Nothing on the page depends on
 * JavaScript to be readable — if this file fails to load the site is still complete.
 */

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

/* -------------------------------------------------------------------------- */
/* Theme                                                                       */
/* -------------------------------------------------------------------------- */

const THEME_KEY = 'gl-theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    document.documentElement.dataset.theme = saved;
  }

  const btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;

  const sync = () => {
    const isLight = document.documentElement.dataset.theme === 'light';
    btn.setAttribute('aria-label', isLight ? 'Switch to dark theme' : 'Switch to light theme');
    btn.textContent = isLight ? '◐' : '◑';
  };

  btn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    sync();
  });

  sync();
}

/* -------------------------------------------------------------------------- */
/* Nav                                                                         */
/* -------------------------------------------------------------------------- */

export function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  const onScroll = () => {
    nav.dataset.scrolled = String(window.scrollY > 12);
  };
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
}

/* -------------------------------------------------------------------------- */
/* Scroll reveal                                                               */
/* -------------------------------------------------------------------------- */

export function initReveal() {
  const items = document.querySelectorAll('[data-reveal], .dimfig');
  if (!items.length) return;

  const root = document.documentElement;

  if (reduced.matches || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }

  // Content is visible until this class is added, so nothing here can hide the page
  // permanently. See the .reveal-ready rules in site.css.
  root.classList.add('reveal-ready');

  // Failsafe: some environments never deliver observer callbacks at all — an unpainted
  // background tab, an embedded webview that isn't compositing, a print or screenshot
  // renderer. If we hear nothing back, drop the hidden state and show everything.
  const failsafe = setTimeout(() => root.classList.remove('reveal-ready'), 1800);

  const io = new IntersectionObserver(
    (entries) => {
      // Any callback at all means the observer is alive, intersecting or not.
      clearTimeout(failsafe);
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
  );

  items.forEach((el) => io.observe(el));
}

/* -------------------------------------------------------------------------- */
/* Count-up                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Animates [data-count] elements to their numeric target on first view.
 * The element's text content is already the final value in the HTML, so with JS off or
 * motion reduced the correct number is simply what you see.
 */
export function initCountUp() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length) return;

  if (reduced.matches || !('IntersectionObserver' in window)) return;

  const run = (el) => {
    const target = parseFloat(el.dataset.count);
    if (!Number.isFinite(target)) return;
    const decimals = (el.dataset.count.split('.')[1] || '').length;
    const dur = 1100;
    const t0 = performance.now();

    const fmt = (v) =>
      v.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      // easeOutExpo — fast start, long settle, reads as a gauge coming to rest
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = fmt(target);
    };

    el.textContent = fmt(0);
    requestAnimationFrame(tick);
  };

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        run(e.target);
        io.unobserve(e.target);
      });
    },
    { threshold: 0.5 },
  );

  els.forEach((el) => io.observe(el));
}

/* -------------------------------------------------------------------------- */
/* Range fill                                                                  */
/* -------------------------------------------------------------------------- */

/** Paints the filled portion of every range input via a --fill custom property. */
export function initRangeFills(root = document) {
  const paint = (r) => {
    const min = parseFloat(r.min || '0');
    const max = parseFloat(r.max || '100');
    const pct = ((parseFloat(r.value) - min) / (max - min)) * 100;
    r.style.setProperty('--fill', `${pct}%`);
  };
  root.querySelectorAll('input[type="range"]').forEach((r) => {
    paint(r);
    r.addEventListener('input', () => paint(r));
  });
}

/* -------------------------------------------------------------------------- */
/* Pointer tilt on cards                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Subtle cursor-aware tilt. Transform-only so it stays on the compositor.
 * Skipped entirely for coarse pointers and reduced motion.
 */
export function initCardTilt() {
  if (reduced.matches) return;
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.querySelectorAll('[data-tilt]').forEach((card) => {
    let raf = 0;

    const move = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          `perspective(1000px) rotateX(${(-py * 3).toFixed(2)}deg) ` +
          `rotateY(${(px * 3).toFixed(2)}deg) translateY(-3px)`;
      });
    };

    const reset = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      card.style.transform = '';
    };

    card.addEventListener('pointermove', move);
    card.addEventListener('pointerleave', reset);
    card.addEventListener('blur', reset, true);
  });
}

/* -------------------------------------------------------------------------- */

export function initAll() {
  initTheme();
  initNav();
  initReveal();
  initCountUp();
  initRangeFills();
  initCardTilt();
}
