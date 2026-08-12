/**
 * THE project manifest.
 *
 * Everything on the site that lists projects reads from this array — the cards on the
 * home page, the tag filter, and the prev/next links at the foot of each case study.
 * Add an object here and it shows up everywhere. Nothing else needs editing.
 *
 * See ADDING_A_PROJECT.md for the full four-step loop.
 *
 * Fields
 *   slug      unique id, also used for prev/next ordering
 *   title     card and pager title
 *   kicker    small mono line above the title
 *   year      shown in the card spec line
 *   tags      strings; drive the filter chips automatically
 *   summary   one or two sentences, plain language
 *   metrics   up to two headline numbers; {value, unit}
 *   cover     path relative to the site root
 *   alt       alt text for the cover image
 *   href      page for this project, relative to the site root
 *   featured  true puts it in the wide hero card slot
 */

export const projects = [
  {
    slug: 'rotator',
    title: 'Cram-A-Lot Chassis Rotator',
    kicker: 'Senior Capstone · Sponsored by JVM / Cram-A-Lot',
    year: '2025–2026',
    tags: ['SolidWorks', 'FEA', 'Manufacturing', 'Hydraulics', 'Team of 6'],
    summary:
      'A 2,000 lb industrial chassis rotator, taken from a sponsor problem statement all the way ' +
      'to delivered, load-tested hardware on the customer’s floor. I owned the pin sizing and ' +
      'clevis mount analyses.',
    metrics: [
      { value: '2,000', unit: 'lb capacity' },
      { value: '180', unit: '° rotation' },
    ],
    cover: 'assets/img/cad-machine-loaded.webp',
    alt: 'SolidWorks render of the chassis rotator with a chassis mounted between its arms',
    href: 'projects/rotator.html',
    featured: true,
  },
  {
    slug: 'bankroll',
    title: 'Bankroll — Session Tracking PWA',
    kicker: 'Personal Project · Shipped and live',
    year: '2026',
    tags: ['JavaScript', 'Firebase', 'PWA', 'Data Viz'],
    summary:
      'A multi-user progressive web app with real authentication, per-user security rules, and ' +
      'schema-migrating data import. Built and deployed solo — evidence that a mechanical ' +
      'engineer can ship working software.',
    metrics: [
      { value: '2,200', unit: 'lines' },
      { value: '100', unit: '% uptime' },
    ],
    cover: 'assets/img/bankroll-cover.webp',
    alt: 'Screenshot of the Bankroll progressive web app leaderboard',
    href: 'projects/bankroll.html',
    featured: false,
  },
];

/** Ordered slugs, for prev/next paging between case studies. */
export const order = projects.map((p) => p.slug);

/** Look up the neighbours of a slug. Returns {prev, next}, either may be null. */
export function neighbours(slug) {
  const i = order.indexOf(slug);
  if (i === -1) return { prev: null, next: null };
  return {
    prev: i > 0 ? projects[i - 1] : null,
    next: i < projects.length - 1 ? projects[i + 1] : null,
  };
}
