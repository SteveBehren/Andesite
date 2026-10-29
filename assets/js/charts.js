// SVG chart primitives. Every function returns markup; animation is CSS driven
// (pathLength="1" plus a draw keyframe), so charts stay static under reduced motion.
// Tooltips: any element with data-tip shows it in one shared floating label.
import { esc, qs } from './util.js';
import { formatNumber } from './i18n.js';

const TAU = Math.PI * 2;
const fx = (v) => Math.round(v * 100) / 100;

function arc(cx, cy, r, a0, a1) {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.sin(a0);
  const y0 = cy - r * Math.cos(a0);
  const x1 = cx + r * Math.sin(a1);
  const y1 = cy - r * Math.cos(a1);
  return `M${fx(x0)} ${fx(y0)}A${r} ${r} 0 ${large} 1 ${fx(x1)} ${fx(y1)}`;
}

// segments: [{ key, value, cls, label, href? }]
export function donut(segments, { size = 180, thickness = 18, center = '', centerSub = '' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2 - 2;
  const c = size / 2;
  let a = 0;
  const gap = segments.filter((s) => s.value > 0).length > 1 ? 0.035 : 0;
  const arcs = segments.filter((s) => s.value > 0).map((s, i) => {
    const span = (s.value / total) * TAU;
    const d = arc(c, c, r, a + gap / 2, a + span - gap / 2);
    a += span;
    return `<path class="donut-seg anim-draw ${s.cls}" d="${d}" pathLength="1" stroke-width="${thickness}" data-tip="${esc(`${s.label}: ${formatNumber(s.value)}`)}" ${s.href ? `data-href="${esc(s.href)}"` : ''} data-delay="${i}"/>`;
  }).join('');
  return `<svg class="donut" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(segments.map((s) => `${s.label} ${s.value}`).join(', '))}">
    <circle class="donut-track" cx="${c}" cy="${c}" r="${r}" stroke-width="${thickness}"/>
    ${arcs}
    <text class="donut-n" x="${c}" y="${c + 4}" text-anchor="middle">${esc(center)}</text>
    <text class="donut-sub" x="${c}" y="${c + 22}" text-anchor="middle">${esc(centerSub)}</text>
  </svg>`;
}

// Columns per year, stacked by key. rows: [{ year, parts: [{ key, value, cls, ids }] }]
export function yearColumns(rows, { height = 170, label = '' } = {}) {
  const W = 640;
  const H = height;
  const padL = 26;
  const padB = 22;
  const padT = 10;
  const max = Math.max(1, ...rows.map((r) => r.parts.reduce((s, p) => s + p.value, 0)));
  const step = (W - padL - 4) / rows.length;
  const bw = Math.max(3, Math.min(16, step * 0.62));
  const y = (v) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [...new Set([0, Math.ceil(max / 2), max])];
  const grid = ticks.map((t) => `<line class="grid" x1="${padL}" x2="${W}" y1="${fx(y(t))}" y2="${fx(y(t))}"/><text class="axis" x="${padL - 6}" y="${fx(y(t)) + 3}" text-anchor="end">${t}</text>`).join('');
  const labelEvery = Math.ceil(rows.length / 12);
  const cols = rows.map((r, i) => {
    const x = padL + step * i + (step - bw) / 2;
    let acc = 0;
    const segs = r.parts.filter((p) => p.value > 0).map((p) => {
      const y0 = y(acc + p.value);
      const h = y(acc) - y0;
      acc += p.value;
      return `<rect class="col-seg ${p.cls}" x="${fx(x)}" y="${fx(y0)}" width="${fx(bw)}" height="${fx(Math.max(0, h - 1))}" rx="1"/>`;
    }).join('');
    const total = r.parts.reduce((s, p) => s + p.value, 0);
    const tick = i % labelEvery === 0 || i === rows.length - 1
      ? `<text class="axis" x="${fx(x + bw / 2)}" y="${H - 6}" text-anchor="middle">${r.year}</text>` : '';
    return `<g class="col${total ? ' has' : ''}" data-delay="${i}" ${total ? `data-year="${r.year}" data-tip="${esc(`${r.year}: ${r.tip || total}`)}" tabindex="0"` : ''}>
      <rect class="col-hit" x="${fx(padL + step * i)}" y="${padT}" width="${fx(step)}" height="${H - padT - padB}"/>
      ${segs}${tick}
    </g>`;
  }).join('');
  return `<svg class="cols" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}<line class="baseline" x1="${padL}" x2="${W}" y1="${fx(y(0))}" y2="${fx(y(0))}"/>${cols}</svg>`;
}

// Horizontal bars in HTML so labels wrap on small screens. items: [{ label, value, cls, href, sub }]
export function barList(items, { max } = {}) {
  const m = max || Math.max(1, ...items.map((i) => i.value));
  return `<ul class="barlist">${items.map((it, i) => {
    const inner = `<span class="bl-label">${it.labelHtml || esc(it.label)}${it.sub ? `<span class="bl-sub">${esc(it.sub)}</span>` : ''}</span>
      <span class="bl-track"><span class="bl-fill ${it.cls || ''}" data-w="${fx((it.value / m) * 100)}" data-delay="${i}"></span></span>
      <span class="bl-n tnum">${formatNumber(it.value)}</span>`;
    return `<li>${it.href ? `<a class="bl-row" href="${esc(it.href)}">${inner}</a>` : `<div class="bl-row">${inner}</div>`}</li>`;
  }).join('')}</ul>`;
}

// Thin stacked bar. parts: [{ value, cls, label }]
export function stackBar(parts, { label = '' } = {}) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return `<div class="stackbar" role="img" aria-label="${esc(label)}">${parts.filter((p) => p.value > 0).map((p, i) =>
    `<span class="sb-seg ${p.cls}" data-w="${fx((p.value / total) * 100)}" data-delay="${i}" data-tip="${esc(`${p.label}: ${formatNumber(p.value)}`)}"></span>`).join('')}</div>`;
}

export function sparkline(values, { w = 120, h = 28, cls = '' } = {}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${fx(i * step)},${fx(h - 2 - (v / max) * (h - 4))}`);
  const area = `M0,${h} L${pts.join(' L')} L${w},${h} Z`;
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path class="spark-area" d="${area}"/><path class="spark-line anim-draw" d="M${pts.join(' L')}" pathLength="1"/></svg>`;
}

// Sankey with N columns. columns: [[{ id, label, cls }]], links: [{ from, to, value, ids }]
export function sankey(columns, links, { width = 760, height = 360, nodeW = 10, gap = 10, label = '' } = {}) {
  const nodes = new Map();
  columns.forEach((col, ci) => col.forEach((n) => nodes.set(n.id, { ...n, col: ci, in: 0, out: 0 })));
  for (const l of links) {
    if (nodes.has(l.from)) nodes.get(l.from).out += l.value;
    if (nodes.has(l.to)) nodes.get(l.to).in += l.value;
  }
  const padX = 4;
  const colX = (ci) => padX + ((width - nodeW - padX * 2) * ci) / Math.max(1, columns.length - 1);
  // One vertical scale for all columns so bands keep their width end to end.
  const colTotals = columns.map((col) => col.reduce((s, n) => s + Math.max(nodes.get(n.id).in, nodes.get(n.id).out), 0));
  const counts = columns.map((col) => col.length);
  const k = Math.min(...colTotals.map((tot, i) => (height - gap * Math.max(0, counts[i] - 1)) / (tot || 1)));
  columns.forEach((col, ci) => {
    const used = col.reduce((s, n) => s + Math.max(nodes.get(n.id).in, nodes.get(n.id).out) * k, 0) + gap * Math.max(0, col.length - 1);
    let y = (height - used) / 2;
    for (const n of col) {
      const node = nodes.get(n.id);
      node.x = colX(ci);
      node.y = y;
      node.h = Math.max(2, Math.max(node.in, node.out) * k);
      node.oy = 0;
      node.iy = 0;
      y += node.h + gap;
    }
  });
  const sorted = links.filter((l) => nodes.has(l.from) && nodes.has(l.to))
    .sort((a, b) => nodes.get(a.from).y - nodes.get(b.from).y || nodes.get(a.to).y - nodes.get(b.to).y);
  const bands = sorted.map((l, i) => {
    const s = nodes.get(l.from);
    const t = nodes.get(l.to);
    const h = l.value * k;
    const x0 = s.x + nodeW;
    const x1 = t.x;
    const y0 = s.y + s.oy;
    const y1 = t.y + t.iy;
    s.oy += h;
    t.iy += h;
    const xm = (x0 + x1) / 2;
    const d = `M${fx(x0)} ${fx(y0)}C${fx(xm)} ${fx(y0)} ${fx(xm)} ${fx(y1)} ${fx(x1)} ${fx(y1)}L${fx(x1)} ${fx(y1 + h)}C${fx(xm)} ${fx(y1 + h)} ${fx(xm)} ${fx(y0 + h)} ${fx(x0)} ${fx(y0 + h)}Z`;
    const mid = `M${fx(x0)} ${fx(y0 + h / 2)}C${fx(xm)} ${fx(y0 + h / 2)} ${fx(xm)} ${fx(y1 + h / 2)} ${fx(x1)} ${fx(y1 + h / 2)}`;
    const tip = `${s.label} → ${t.label}: ${formatNumber(l.value)}`;
    return `<g class="sk-link" data-from="${esc(l.from)}" data-to="${esc(l.to)}" data-tip="${esc(tip)}" data-delay="${i}" ${l.ids?.length ? `data-ids="${esc(l.ids.join(' '))}"` : ''}>
      <path class="sk-band ${s.cls || ''}" d="${d}"/>
      <path class="sk-flow" d="${mid}" stroke-width="${fx(Math.max(1, Math.min(3, h / 4)))}"/>
    </g>`;
  }).join('');
  const nodeSvg = [...nodes.values()].map((n) => {
    const right = n.col === columns.length - 1;
    const tx = right ? n.x - 6 : n.x + nodeW + 6;
    return `<g class="sk-node" data-node="${esc(n.id)}" tabindex="0" data-tip="${esc(`${n.label}: ${formatNumber(Math.max(n.in, n.out))}`)}">
      <rect class="${n.cls || ''}" x="${fx(n.x)}" y="${fx(n.y)}" width="${nodeW}" height="${fx(n.h)}" rx="1"/>
      <text class="sk-label" x="${fx(tx)}" y="${fx(n.y + n.h / 2 + 4)}" text-anchor="${right ? 'end' : 'start'}">${esc(n.label)}</text>
    </g>`;
  }).join('');
  return `<svg class="sankey" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${bands}${nodeSvg}</svg>`;
}

// Sankey hover: highlight the links touching a node or a single band.
export function wireSankey(root) {
  for (const svg of root.querySelectorAll('.sankey')) {
    const clear = () => svg.classList.remove('is-focus');
    svg.addEventListener('pointerover', (e) => {
      const node = e.target.closest('.sk-node');
      const band = e.target.closest('.sk-link');
      if (!node && !band) return;
      svg.classList.add('is-focus');
      for (const l of svg.querySelectorAll('.sk-link')) {
        const on = node ? (l.dataset.from === node.dataset.node || l.dataset.to === node.dataset.node) : l === band;
        l.classList.toggle('is-on', on);
      }
    });
    svg.addEventListener('pointerleave', clear);
  }
}

// Shared tooltip. Follows the pointer; on touch it shows on tap and hides on the next tap.
export function installTooltip() {
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  let current = null;
  const place = (x, y) => {
    const r = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  };
  const show = (el, x, y) => {
    current = el;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    place(x, y);
  };
  const hide = () => { current = null; tip.hidden = true; };
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (!el) { if (current) hide(); return; }
    if (el !== current) show(el, e.clientX, e.clientY);
    else place(e.clientX, e.clientY);
  });
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = e.target.closest?.('[data-tip]');
    if (el && el !== current) show(el, e.clientX, e.clientY - 30);
    else hide();
  });
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (!el || !el.matches(':focus-visible')) return;
    const r = el.getBoundingClientRect();
    show(el, r.left + r.width / 2, r.bottom);
  });
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
  return { hide };
}

// Apply per-element animation delays (CSSOM, not inline style attributes).
export function applyDelays(root) {
  for (const el of root.querySelectorAll('[data-delay]')) el.style.setProperty('--d', el.dataset.delay);
}

export function legend(items) {
  return `<ul class="legend">${items.map((i) => `<li>${i.swatch || `<span class="sw ${i.cls}"></span>`}<span>${esc(i.label)}</span>${i.value != null ? `<span class="lg-n tnum">${formatNumber(i.value)}</span>` : ''}</li>`).join('')}</ul>`;
}

export function emptyChart(text) {
  return `<p class="chart-empty">${esc(text)}</p>`;
}

export { qs };
