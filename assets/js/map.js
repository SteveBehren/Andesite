// Dot-matrix map of Indonesia with event markers.
import { GRID, INDONESIA, NEIGHBOURS } from './geo-dots.js';
import { esc } from './util.js';

function runs(rows) {
  const out = [];
  rows.forEach((row, r) => {
    for (const run of row.split(',').filter(Boolean)) {
      const [a, b] = run.split('.').map((v) => parseInt(v, 36));
      for (let c = a; c < a + b; c++) out.push([c, r]);
    }
  });
  return out;
}

let cache = null;
function dots() {
  if (!cache) cache = { indo: runs(INDONESIA), near: runs(NEIGHBOURS) };
  return cache;
}

export function project(lat, lon) {
  return { x: (lon - GRID.lon0) / GRID.step, y: (GRID.lat0 - lat) / GRID.step };
}

// markers: [{ id, lat, lon, cls, tip, size, href, national }]
export function dotMap(markers, { label = '' } = {}) {
  const { indo, near } = dots();
  const W = GRID.cols;
  const H = GRID.rows;
  const dot = (cls) => ([c, r]) => `<circle class="${cls}" cx="${c + 0.5}" cy="${r + 0.5}" r="0.2"/>`;
  // Group markers that fall on the same spot so stacked events read as one bigger point.
  const spots = new Map();
  for (const m of markers) {
    const p = project(m.lat, m.lon);
    const k = `${Math.round(p.x)}:${Math.round(p.y)}`;
    const s = spots.get(k) || { x: p.x, y: p.y, items: [] };
    s.items.push(m);
    spots.set(k, s);
  }
  const marks = [...spots.values()].map((s, i) => {
    const r = 0.7 + Math.min(2.2, Math.sqrt(s.items.length) * 0.55);
    const lead = s.items[0];
    const tip = s.items.map((m) => m.tip).join(' · ');
    return `<g class="mk ${lead.cls}" data-delay="${i}" data-tip="${esc(tip)}" ${s.items.length === 1 && lead.href ? `data-href="${esc(lead.href)}"` : ''} data-ids="${esc(s.items.map((m) => m.id).join(' '))}" tabindex="0">
      <circle class="mk-pulse" cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="${r.toFixed(2)}"/>
      <circle class="mk-dot" cx="${s.x.toFixed(2)}" cy="${s.y.toFixed(2)}" r="${(r * 0.55).toFixed(2)}"/>
      ${s.items.length > 1 ? `<text class="mk-n" x="${s.x.toFixed(2)}" y="${(s.y - r - 0.6).toFixed(2)}" text-anchor="middle">${s.items.length}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="dotmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    <g class="dm-near">${near.map(dot('d-near')).join('')}</g>
    <g class="dm-land">${indo.map(dot('d-land')).join('')}</g>
    <g class="dm-marks">${marks}</g>
  </svg>`;
}
