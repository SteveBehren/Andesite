// A small force-directed graph in SVG. Enough for a few hundred objects:
// repulsion, springs, a centre pull and collision, integrated with damping.
// Drag nodes, drag the background to pan, wheel or pinch to zoom.
import { esc, reducedMotion } from './util.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function shapePath(shape, r) {
  const f = (v) => Math.round(v * 100) / 100;
  switch (shape) {
    case 'square': return `<rect class="nd-shape" x="${-r}" y="${-r}" width="${r * 2}" height="${r * 2}" rx="1.5"/>`;
    case 'diamond': return `<path class="nd-shape" d="M0 ${-r * 1.2}L${r * 1.2} 0 0 ${r * 1.2}${-r * 1.2} 0Z"/>`;
    case 'triangle': return `<path class="nd-shape" d="M0 ${-r * 1.15}L${f(r * 1.05)} ${f(r * 0.8)}H${f(-r * 1.05)}Z"/>`;
    case 'hex': {
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        return `${f(Math.cos(a) * r * 1.1)},${f(Math.sin(a) * r * 1.1)}`;
      });
      return `<polygon class="nd-shape" points="${pts.join(' ')}"/>`;
    }
    case 'ring': return `<circle class="nd-shape nd-ring" r="${r}"/>`;
    default: return `<circle class="nd-shape" r="${r}"/>`;
  }
}

export function createGraph(container, { nodes, links, onSelect, linkLength = () => 60, charge = 420, labelAlways = () => false }) {
  const byId = new Map();
  const W = Math.max(320, container.clientWidth || 800);
  const H = Math.max(320, container.clientHeight || 520);
  const groups = [...new Set(nodes.map((n) => n.group ?? n.type))];

  nodes.forEach((n, i) => {
    const g = groups.indexOf(n.group ?? n.type);
    const ga = (g / groups.length) * Math.PI * 2;
    const jitter = (i * 2.399963) % (Math.PI * 2);
    const rr = 80 + (i % 7) * 18;
    n.x = W / 2 + Math.cos(ga) * 140 + Math.cos(jitter) * rr * 0.5;
    n.y = H / 2 + Math.sin(ga) * 140 + Math.sin(jitter) * rr * 0.5;
    n.vx = 0; n.vy = 0;
    byId.set(n.id, n);
  });
  const edges = links.filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l, s: byId.get(l.source), t: byId.get(l.target) }));
  const adj = new Map(nodes.map((n) => [n.id, new Set()]));
  for (const e of edges) { adj.get(e.s.id).add(e.t.id); adj.get(e.t.id).add(e.s.id); }

  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'graph');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  const vp = document.createElementNS(SVGNS, 'g');
  vp.setAttribute('class', 'vp');
  vp.innerHTML = `<g class="g-links">${edges.map((e, i) => `<line class="g-link lk-${e.type}" data-i="${i}"/>`).join('')}</g>
    <g class="g-nodes">${nodes.map((n) => `<g class="g-node ${n.cls}${labelAlways(n) ? ' lbl-on' : ''}" data-id="${esc(n.id)}" tabindex="0" role="button" aria-label="${esc(n.aria || n.label)}">
      <circle class="nd-halo" r="${n.r + 7}"/>${shapePath(n.shape, n.r)}
      <text class="nd-label" y="${n.r + 12}" text-anchor="middle">${esc(n.label)}</text></g>`).join('')}</g>`;
  svg.appendChild(vp);
  container.appendChild(svg);
  const lineEls = [...vp.querySelectorAll('.g-link')];
  const nodeEls = new Map([...vp.querySelectorAll('.g-node')].map((el) => [el.dataset.id, el]));

  let view = { x: 0, y: 0, k: 1 };
  const applyView = () => vp.setAttribute('transform', `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);

  const draw = () => {
    edges.forEach((e, i) => {
      const el = lineEls[i];
      el.setAttribute('x1', e.s.x.toFixed(1)); el.setAttribute('y1', e.s.y.toFixed(1));
      el.setAttribute('x2', e.t.x.toFixed(1)); el.setAttribute('y2', e.t.y.toFixed(1));
    });
    for (const n of nodes) nodeEls.get(n.id).setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`);
  };

  let alpha = 1;
  const tick = () => {
    const cx = W / 2;
    const cy = H / 2;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.25; }
        const d = Math.sqrt(d2);
        let f = (charge * alpha) / d2;
        const min = a.r + b.r + 10;
        if (d < min) f += ((min - d) / d) * 0.5;
        const fxv = (dx / d) * f;
        const fyv = (dy / d) * f;
        a.vx -= fxv; a.vy -= fyv;
        b.vx += fxv; b.vy += fyv;
      }
    }
    for (const e of edges) {
      const dx = e.t.x - e.s.x;
      const dy = e.t.y - e.s.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = ((d - linkLength(e)) / d) * 0.06 * alpha;
      e.s.vx += dx * f; e.s.vy += dy * f;
      e.t.vx -= dx * f; e.t.vy -= dy * f;
    }
    for (const n of nodes) {
      n.vx += (cx - n.x) * 0.004 * alpha;
      n.vy += (cy - n.y) * 0.004 * alpha;
      if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-30, Math.min(30, n.vx));
      n.y += Math.max(-30, Math.min(30, n.vy));
    }
    alpha *= 0.985;
  };

  let raf = 0;
  const loop = () => {
    tick(); tick();
    draw();
    if (alpha > 0.012) raf = requestAnimationFrame(loop);
    else raf = 0;
  };
  const reheat = (to = 0.35) => {
    alpha = Math.max(alpha, to);
    if (!raf && !reducedMotion()) raf = requestAnimationFrame(loop);
  };

  const fit = (animate = true) => {
    if (!nodes.length) return;
    const xs = nodes.map((n) => n.x);
    const ys = nodes.map((n) => n.y);
    const minX = Math.min(...xs) - 40; const maxX = Math.max(...xs) + 40;
    const minY = Math.min(...ys) - 40; const maxY = Math.max(...ys) + 40;
    const k = Math.min(2.2, Math.min(W / (maxX - minX), H / (maxY - minY)));
    const target = { k, x: W / 2 - ((minX + maxX) / 2) * k, y: H / 2 - ((minY + maxY) / 2) * k };
    if (!animate || reducedMotion()) { view = target; applyView(); return; }
    const from = { ...view };
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / 500);
      const e = 1 - Math.pow(1 - p, 3);
      view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      applyView();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  if (reducedMotion()) {
    for (let i = 0; i < 360; i++) tick();
    draw();
    fit(false);
  } else {
    for (let i = 0; i < 40; i++) tick();
    draw();
    fit(false);
    raf = requestAnimationFrame(loop);
    setTimeout(() => fit(true), 1400);
  }

  // ---- Highlighting ----
  let selected = null;
  const highlight = (id) => {
    svg.classList.toggle('is-focus', Boolean(id));
    const nb = id ? adj.get(id) : null;
    for (const [nid, el] of nodeEls) {
      el.classList.toggle('is-nb', Boolean(nb && (nb.has(nid) || nid === id)));
      el.classList.toggle('is-hot', nid === id);
    }
    edges.forEach((e, i) => lineEls[i].classList.toggle('is-nb', Boolean(id && (e.s.id === id || e.t.id === id))));
  };
  const select = (id, notify = true) => {
    selected = id;
    for (const [nid, el] of nodeEls) el.classList.toggle('is-sel', nid === id);
    highlight(id);
    if (notify && onSelect) onSelect(id);
  };

  // ---- Pointer handling ----
  const toGraph = (clientX, clientY) => {
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / r.width) * W;
    const sy = ((clientY - r.top) / r.height) * H;
    return { x: (sx - view.x) / view.k, y: (sy - view.y) / view.k, sx, sy };
  };
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, mid: toGraph((a.x + b.x) / 2, (a.y + b.y) / 2) };
      if (drag?.node) drag.node.fixed = false;
      drag = null;
      return;
    }
    const nodeEl = e.target.closest('.g-node');
    const p = toGraph(e.clientX, e.clientY);
    if (nodeEl) {
      const node = byId.get(nodeEl.dataset.id);
      drag = { node, moved: 0, ox: p.x - node.x, oy: p.y - node.y, sx: e.clientX, sy: e.clientY };
      node.fixed = true;
    } else {
      drag = { pan: true, moved: 0, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = Math.max(0.3, Math.min(4, (pinch.k * d) / pinch.d));
      const m = toGraph((a.x + b.x) / 2, (a.y + b.y) / 2);
      view.x = m.sx - pinch.mid.x * k;
      view.y = m.sy - pinch.mid.y * k;
      view.k = k;
      applyView();
      return;
    }
    if (!drag) {
      const nodeEl = e.target.closest?.('.g-node');
      if (!selected) highlight(nodeEl ? nodeEl.dataset.id : null);
      return;
    }
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy));
    if (drag.node) {
      const p = toGraph(e.clientX, e.clientY);
      drag.node.x = p.x - drag.ox;
      drag.node.y = p.y - drag.oy;
      if (drag.moved > 3) reheat(0.25);
      draw();
    } else if (drag.pan) {
      const r = svg.getBoundingClientRect();
      view.x = drag.vx + ((e.clientX - drag.sx) / r.width) * W;
      view.y = drag.vy + ((e.clientY - drag.sy) / r.height) * H;
      applyView();
    }
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (!drag) return;
    if (drag.node) {
      drag.node.fixed = false;
      if (drag.moved < 5) select(selected === drag.node.id ? null : drag.node.id);
    } else if (drag.pan && drag.moved < 5) {
      select(null);
    }
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('pointerleave', () => { if (!selected && !drag) highlight(null); });
  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey && !container.classList.contains('is-active')) return;
    e.preventDefault();
    const p = toGraph(e.clientX, e.clientY);
    const k = Math.max(0.3, Math.min(4, view.k * Math.exp(-e.deltaY * 0.0015)));
    view.x = p.sx - p.x * k;
    view.y = p.sy - p.y * k;
    view.k = k;
    applyView();
  }, { passive: false });
  // Wheel zooms once the visitor has clicked into the graph, so the page still scrolls past it.
  svg.addEventListener('pointerdown', () => container.classList.add('is-active'));
  const deactivate = (e) => { if (!container.contains(e.target)) container.classList.remove('is-active'); };
  document.addEventListener('pointerdown', deactivate);

  svg.addEventListener('keydown', (e) => {
    const nodeEl = e.target.closest('.g-node');
    if (nodeEl && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(nodeEl.dataset.id); }
  });
  svg.addEventListener('focusin', (e) => {
    const nodeEl = e.target.closest('.g-node');
    if (nodeEl && !selected) highlight(nodeEl.dataset.id);
  });

  const zoomBy = (f) => {
    const k = Math.max(0.3, Math.min(4, view.k * f));
    view.x = W / 2 - ((W / 2 - view.x) / view.k) * k;
    view.y = H / 2 - ((H / 2 - view.y) / view.k) * k;
    view.k = k;
    applyView();
  };

  return {
    select: (id) => select(id, false),
    fit: () => fit(true),
    zoomIn: () => zoomBy(1.3),
    zoomOut: () => zoomBy(1 / 1.3),
    reheat: () => reheat(0.6),
    destroy() {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', deactivate);
      svg.remove();
    },
  };
}
