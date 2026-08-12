/**
 * Renders the project grid and the case-study pager from data/projects.js.
 *
 * Nothing about an individual project is hardcoded in the HTML, so adding an entry to
 * the manifest is genuinely all it takes to make it appear across the site.
 */

import { projects, neighbours } from '../data/projects.js';

/** Pages inside projects/ set data-base="../" so asset paths resolve from anywhere. */
const base = () => document.body.dataset.base || './';

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

function cardHTML(p) {
  const b = base();
  const metrics = (p.metrics || [])
    .map((m) => `<span class="card__metric"><b>${esc(m.value)}</b> ${esc(m.unit)}</span>`)
    .join('');
  const tags = (p.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');

  return `
    <a class="card${p.featured ? ' card--featured' : ''}" href="${b}${esc(p.href)}"
       data-tilt data-reveal data-tags="${esc((p.tags || []).join('|'))}">
      <div class="card__media">
        <img src="${b}${esc(p.cover)}" alt="${esc(p.alt || '')}" loading="lazy" decoding="async">
      </div>
      <div class="card__body">
        <div class="card__kicker">${esc(p.kicker)}</div>
        <h3 class="card__title">${esc(p.title)}</h3>
        <p class="card__summary">${esc(p.summary)}</p>
        <div class="tags">${tags}</div>
        <div class="card__spec">
          <span class="mono">${esc(p.year)}</span>
          ${metrics}
          <span class="card__arrow" aria-hidden="true">→</span>
        </div>
      </div>
    </a>`;
}

/** Renders every project into [data-projects], featured first. */
export function renderCards() {
  const host = document.querySelector('[data-projects]');
  if (!host) return;

  const sorted = [...projects].sort((a, b) => Number(b.featured) - Number(a.featured));
  host.innerHTML = sorted.map(cardHTML).join('');

  renderFilter(host, sorted);
}

/**
 * Tag filter chips, derived from whatever tags exist in the manifest. Hidden entirely
 * when there are too few projects for filtering to be useful.
 */
function renderFilter(host, list) {
  const bar = document.querySelector('[data-project-filter]');
  if (!bar) return;

  // Filtering two cards is pointless, so the bar stays hidden until there are enough
  // projects to be worth narrowing. The markup ships with `hidden` set, so this has to
  // clear it explicitly once the chips exist.
  if (list.length < 3) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const tags = [...new Set(list.flatMap((p) => p.tags || []))].sort();
  bar.innerHTML =
    `<button class="btn btn--sm" data-filter="*" aria-pressed="true">All</button>` +
    tags.map((t) => `<button class="btn btn--sm" data-filter="${esc(t)}" aria-pressed="false">${esc(t)}</button>`).join('');

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-filter]');
    if (!btn) return;
    const want = btn.dataset.filter;

    bar.querySelectorAll('[data-filter]').forEach((b) =>
      b.setAttribute('aria-pressed', String(b === btn)),
    );

    host.querySelectorAll('.card').forEach((card) => {
      const has = want === '*' || (card.dataset.tags || '').split('|').includes(want);
      card.hidden = !has;
    });
  });
}

/** Renders prev/next links into [data-pager] on a case-study page. */
export function renderPager(slug) {
  const host = document.querySelector('[data-pager]');
  if (!host) return;

  const b = base();
  const { prev, next } = neighbours(slug);
  const parts = [];

  if (prev) {
    parts.push(`<a href="${b}${esc(prev.href)}">
      <div class="pager__k">← Previous project</div>
      <div class="pager__t">${esc(prev.title)}</div></a>`);
  }
  if (next) {
    parts.push(`<a class="pager--next" href="${b}${esc(next.href)}">
      <div class="pager__k">Next project →</div>
      <div class="pager__t">${esc(next.title)}</div></a>`);
  }

  host.innerHTML = parts.join('');
  host.hidden = parts.length === 0;
}
