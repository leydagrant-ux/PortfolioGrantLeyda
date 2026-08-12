/**
 * Interactive pin sizing study.
 *
 * This is a continuous version of the hand calculation Grant ran for the capstone's
 * central pin — the one holding the third top arm to the rotator plate. The formulas
 * below are lifted directly from `Pin stress calculations.xlsx` and reproduce every
 * value in the Critical Component Analysis report exactly:
 *
 *     tau     = 4P / (pi d^2)          single shear across the pin
 *     sigma_b = P / (d t)              bearing on the projected contact area
 *     sigma_v = sqrt(sigma_b^2 + 3 tau^2)   von Mises
 *     FOS     = Su / sigma_v           Su = 58,000 psi, A36 ultimate tensile
 *
 * Reference points from the report, asserted by the self-test below:
 *
 *     d = 1.0 in -> tau 11,704.84   sigma_b 1,149.12   sigma_v 20,305.92   FOS  2.856
 *     d = 1.5 in -> tau  5,202.15   sigma_b   766.08   sigma_v  9,042.90   FOS  6.414
 *     d = 2.0 in -> tau  2,926.21   sigma_b   574.56   sigma_v  5,100.81   FOS 11.371
 */

const DEFAULTS = {
  // 9,192.96 lbf, not 9,192 — the report rounds it in prose, but both tabulated columns
  // back-solve to the same exact figure (4P/pi = 11,704.84 and P/8 = 1,149.12), and the
  // rounded value is off by enough to miss the reference stresses in the fourth digit.
  P: 9192.96,
  t: 8,      // in, bearing thickness
  Su: 58000, // psi, A36 ultimate tensile strength
};

/** The ASD reference factor of safety the capstone report benchmarks against. */
const FOS_REF = 1.67;

/** The three diameters actually analyzed and FEA-checked in the report. */
export const VALIDATED = [
  { d: 1.0, fos: 2.856 },
  { d: 1.5, fos: 6.414 },
  { d: 2.0, fos: 11.371 },
];

export function solve(d, P = DEFAULTS.P, t = DEFAULTS.t, Su = DEFAULTS.Su) {
  const tau = (4 * P) / (Math.PI * d * d);
  const bearing = P / (d * t);
  const vm = Math.sqrt(bearing * bearing + 3 * tau * tau);
  return { tau, bearing, vm, fos: Su / vm };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */

const psi = (v) =>
  v >= 10000
    ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : v.toLocaleString('en-US', { maximumFractionDigits: 1 });

/* -------------------------------------------------------------------------- */
/* Chart                                                                       */
/* -------------------------------------------------------------------------- */

const VB = { w: 640, h: 300, l: 46, r: 14, t: 16, b: 34 };
const D_MIN = 0.75;
const D_MAX = 2.5;

function buildChart(svg, state) {
  const { P, t, Su } = state;
  const plotW = VB.w - VB.l - VB.r;
  const plotH = VB.h - VB.t - VB.b;

  // Scale the y axis to whatever the current inputs actually produce, so the curve
  // stays readable when the load slider moves.
  const fosAt = (d) => solve(d, P, t, Su).fos;
  const yMax = Math.max(fosAt(D_MAX) * 1.08, FOS_REF * 2, 4);

  const x = (d) => VB.l + ((d - D_MIN) / (D_MAX - D_MIN)) * plotW;
  const y = (f) => VB.t + plotH - (Math.min(f, yMax) / yMax) * plotH;

  const parts = [];

  // Danger band: everything below the ASD reference FOS.
  const bandTop = y(FOS_REF);
  parts.push(
    `<rect x="${VB.l}" y="${bandTop}" width="${plotW}" height="${VB.t + plotH - bandTop}"
       fill="var(--warn-glow)"/>`,
    `<line x1="${VB.l}" y1="${bandTop}" x2="${VB.l + plotW}" y2="${bandTop}"
       stroke="var(--warn)" stroke-width="1" stroke-dasharray="4 3"/>`,
    `<text x="${VB.l + plotW - 4}" y="${bandTop - 5}" text-anchor="end"
       fill="var(--warn)" font-size="10" font-family="var(--mono)">ASD reference FOS ${FOS_REF}</text>`,
  );

  // Axes
  parts.push(
    `<line x1="${VB.l}" y1="${VB.t}" x2="${VB.l}" y2="${VB.t + plotH}" stroke="var(--line-strong)"/>`,
    `<line x1="${VB.l}" y1="${VB.t + plotH}" x2="${VB.l + plotW}" y2="${VB.t + plotH}" stroke="var(--line-strong)"/>`,
  );

  // Y gridlines and labels
  const steps = 4;
  for (let i = 1; i <= steps; i++) {
    const f = (yMax / steps) * i;
    const yy = y(f);
    parts.push(
      `<line x1="${VB.l}" y1="${yy}" x2="${VB.l + plotW}" y2="${yy}" stroke="var(--grid-strong)"/>`,
      `<text x="${VB.l - 7}" y="${yy + 3.5}" text-anchor="end" fill="var(--ink-3)"
         font-size="10" font-family="var(--mono)">${f.toFixed(0)}</text>`,
    );
  }

  // X ticks
  for (let d = 1.0; d <= 2.5001; d += 0.5) {
    const xx = x(d);
    parts.push(
      `<line x1="${xx}" y1="${VB.t + plotH}" x2="${xx}" y2="${VB.t + plotH + 4}" stroke="var(--line-strong)"/>`,
      `<text x="${xx}" y="${VB.t + plotH + 17}" text-anchor="middle" fill="var(--ink-3)"
         font-size="10" font-family="var(--mono)">${d.toFixed(1)}"</text>`,
    );
  }

  parts.push(
    `<text x="${VB.l + plotW / 2}" y="${VB.h - 2}" text-anchor="middle" fill="var(--ink-3)"
       font-size="10" font-family="var(--mono)">PIN DIAMETER</text>`,
    `<text x="10" y="${VB.t + plotH / 2}" text-anchor="middle" fill="var(--ink-3)"
       font-size="10" font-family="var(--mono)"
       transform="rotate(-90 10 ${VB.t + plotH / 2})">FACTOR OF SAFETY</text>`,
  );

  // The curve
  let dPath = '';
  for (let i = 0; i <= 120; i++) {
    const d = D_MIN + ((D_MAX - D_MIN) * i) / 120;
    dPath += `${i ? 'L' : 'M'}${x(d).toFixed(2)} ${y(fosAt(d)).toFixed(2)}`;
  }
  parts.push(`<path d="${dPath}" fill="none" stroke="var(--ok)" stroke-width="2"
    stroke-linejoin="round" stroke-linecap="round"/>`);

  // The three diameters that were actually analyzed. Only meaningful at the report's
  // own load case, so they fade out once the load slider is moved away from it.
  const atReport = Math.abs(P - DEFAULTS.P) < 1 && Math.abs(t - DEFAULTS.t) < 0.01
    && Math.abs(Su - DEFAULTS.Su) < 1;
  VALIDATED.forEach((v) => {
    parts.push(
      `<circle cx="${x(v.d)}" cy="${y(v.fos)}" r="4.5" fill="var(--bg-2)"
         stroke="var(--ink)" stroke-width="1.75" opacity="${atReport ? 1 : 0.22}"/>`,
      `<text x="${x(v.d)}" y="${y(v.fos) - 11}" text-anchor="middle" fill="var(--ink-2)"
         font-size="10" font-family="var(--mono)" opacity="${atReport ? 1 : 0.22}">${v.fos.toFixed(2)}</text>`,
    );
  });

  // Live marker
  const lf = fosAt(state.d);
  parts.push(
    `<line x1="${x(state.d)}" y1="${VB.t}" x2="${x(state.d)}" y2="${VB.t + plotH}"
       stroke="var(--ok)" stroke-width="1" stroke-dasharray="3 3" opacity=".55"/>`,
    `<circle cx="${x(state.d)}" cy="${y(lf)}" r="6" fill="var(--ok)"
       stroke="var(--bg-2)" stroke-width="2"/>`,
  );

  svg.innerHTML = parts.join('');
}

/* -------------------------------------------------------------------------- */
/* Gauge                                                                       */
/* -------------------------------------------------------------------------- */

const GA_START = -220; // degrees
const GA_END = 40;
const GAUGE_MAX = 14;

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function arcPath(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function buildGauge(svg) {
  const cx = 100;
  const cy = 100;
  const r = 78;
  svg.setAttribute('viewBox', '0 0 200 150');
  svg.innerHTML = `
    <path d="${arcPath(cx, cy, r, GA_START, GA_END)}" stroke="var(--line-strong)"
      stroke-width="9" fill="none" stroke-linecap="round"/>
    <path data-gauge-fill d="" stroke="var(--ok)" stroke-width="9" fill="none"
      stroke-linecap="round"/>
    <path data-gauge-ref d="" stroke="var(--warn)" stroke-width="2" fill="none"/>`;
}

function paintGauge(svg, fos) {
  const cx = 100;
  const cy = 100;
  const r = 78;
  const span = GA_END - GA_START;

  const frac = Math.max(0, Math.min(1, fos / GAUGE_MAX));
  const to = GA_START + span * frac;

  const fill = svg.querySelector('[data-gauge-fill]');
  fill.setAttribute('d', frac < 0.002 ? '' : arcPath(cx, cy, r, GA_START, to));
  fill.setAttribute('stroke', fos < FOS_REF ? 'var(--warn)' : 'var(--ok)');

  // Tick showing where the ASD reference sits on the dial.
  const refDeg = GA_START + span * (FOS_REF / GAUGE_MAX);
  const [rx1, ry1] = polar(cx, cy, r - 8, refDeg);
  const [rx2, ry2] = polar(cx, cy, r + 8, refDeg);
  svg.querySelector('[data-gauge-ref]').setAttribute('d', `M${rx1} ${ry1} L${rx2} ${ry2}`);
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                      */
/* -------------------------------------------------------------------------- */

export function initPinStudy() {
  const root = document.querySelector('[data-pin-study]');
  if (!root) return;

  const el = (sel) => root.querySelector(sel);

  const inputs = {
    d: el('[data-in="d"]'),
    P: el('[data-in="P"]'),
    t: el('[data-in="t"]'),
    Su: el('[data-in="Su"]'),
  };

  const out = {
    d: el('[data-out="d"]'),
    P: el('[data-out="P"]'),
    t: el('[data-out="t"]'),
    Su: el('[data-out="Su"]'),
    tau: el('[data-out="tau"]'),
    bearing: el('[data-out="bearing"]'),
    vm: el('[data-out="vm"]'),
    fos: el('[data-out="fos"]'),
    verdict: el('[data-out="verdict"]'),
  };

  const chart = el('[data-chart]');
  const gauge = el('[data-gauge]');
  const gaugeSvg = gauge.querySelector('svg');

  chart.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
  buildGauge(gaugeSvg);

  function update() {
    const state = {
      d: parseFloat(inputs.d.value),
      P: parseFloat(inputs.P.value),
      t: parseFloat(inputs.t.value),
      Su: parseFloat(inputs.Su.value),
    };

    const r = solve(state.d, state.P, state.t, state.Su);

    out.d.textContent = state.d.toFixed(2);
    out.P.textContent = state.P.toLocaleString('en-US', { maximumFractionDigits: 2 });
    out.t.textContent = state.t.toFixed(1);
    out.Su.textContent = state.Su.toLocaleString('en-US');

    out.tau.textContent = psi(r.tau);
    out.bearing.textContent = psi(r.bearing);
    out.vm.textContent = psi(r.vm);
    out.fos.textContent = r.fos.toFixed(2);

    const safe = r.fos >= FOS_REF;
    gauge.dataset.state = safe ? 'ok' : 'warn';
    out.verdict.textContent = safe
      ? `Above the ${FOS_REF} ASD reference`
      : `Below the ${FOS_REF} ASD reference`;
    out.verdict.className = safe ? 'ok mono' : 'warn mono';

    paintGauge(gaugeSvg, r.fos);
    buildChart(chart, state);
  }

  Object.values(inputs).forEach((i) => i.addEventListener('input', update));

  const reset = el('[data-study-reset]');
  if (reset) {
    reset.addEventListener('click', () => {
      inputs.d.value = '1.5';
      inputs.P.value = String(DEFAULTS.P);
      inputs.t.value = String(DEFAULTS.t);
      inputs.Su.value = String(DEFAULTS.Su);
      Object.values(inputs).forEach((i) => i.dispatchEvent(new Event('input', { bubbles: true })));
    });
  }

  update();

  if (new URLSearchParams(location.search).has('selftest')) selfTest();
}

/* -------------------------------------------------------------------------- */
/* Self-test                                                                   */
/*                                                                             */
/* Load any page carrying the study with ?selftest=1 and check the console. This */
/* guards the one thing on the site that must never silently drift: the numbers  */
/* have to keep matching the report they came from.                              */
/* -------------------------------------------------------------------------- */

export function selfTest() {
  // Values as tabulated in the Critical Component Analysis report.
  const cases = [
    { d: 1.0, tau: 11704.84, bearing: 1149.12, vm: 20305.918, fos: 2.85631 },
    { d: 1.5, tau: 5202.15, bearing: 766.08, vm: 9042.896, fos: 6.41387 },
    { d: 2.0, tau: 2926.21, bearing: 574.56, vm: 5100.807, fos: 11.37075 },
  ];

  let failures = 0;
  const rows = cases.map((c) => {
    const r = solve(c.d);
    const check = (got, want, tol) => Math.abs(got - want) <= tol;
    const ok =
      check(r.tau, c.tau, 0.01) &&
      check(r.bearing, c.bearing, 0.01) &&
      check(r.vm, c.vm, 0.01) &&
      check(r.fos, c.fos, 0.00001);
    if (!ok) failures++;
    return {
      'd (in)': c.d,
      'tau got': r.tau.toFixed(2),
      'tau want': c.tau,
      'bearing got': r.bearing.toFixed(2),
      'bearing want': c.bearing,
      'vm got': r.vm.toFixed(2),
      'vm want': c.vm,
      'FOS got': r.fos.toFixed(4),
      'FOS want': c.fos,
      pass: ok ? 'PASS' : 'FAIL',
    };
  });

  console.table(rows);
  if (failures) console.error(`pin-study self-test: ${failures} of ${cases.length} FAILED`);
  else console.info('pin-study self-test: all 3 reference cases PASS');

  return failures === 0;
}
