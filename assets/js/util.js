// Small helpers shared by every view. No framework: views render HTML strings,
// then wire behaviour with event delegation. Nothing here uses inline styles,
// because the Content Security Policy forbids them; geometry goes through the CSSOM.
import { lang, t, formatNumber } from './i18n.js';

export const REPO = 'https://github.com/SteveBehren/Andesite';
export const TIERS = ['court', 'acknowledged', 'documented', 'alleged', 'unverified'];
export const HEADLINE_TIERS = TIERS.slice(0, 4);
export const CATEGORIES = ['press', 'expression', 'assembly', 'information'];
export const OUTCOME_CLASSES = ['remedy', 'partial', 'deflected', 'adverse', 'none'];

export const $ = (id) => document.getElementById(id);
export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function pick(i18nObj) {
  if (!i18nObj) return '';
  return i18nObj[lang()] || i18nObj.en || '';
}

export function storeGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
export function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
}

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function siteUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
}

// Category names fall back to the raw key for categories added later by the monitor.
export function catName(key) {
  const name = t(`categories.${key}`);
  return name === `categories.${key}` ? key : name;
}

export function tierGlyph(tier, cls = '') {
  const shapes = {
    court: '<rect class="g" x="1.5" y="1.5" width="9" height="9"/>',
    acknowledged: '<path class="g" d="M6 .9 11.1 6 6 11.1.9 6z"/>',
    documented: '<circle class="g" cx="6" cy="6" r="4.6"/>',
    alleged: '<path class="g-outline" d="M6 1.6 10.8 10.3H1.2z"/>',
    unverified: '<circle class="g-dash" cx="6" cy="6" r="4.4"/>',
  };
  return `<svg class="tier-glyph c-${tier} ${cls}" viewBox="0 0 12 12" aria-hidden="true" focusable="false">${shapes[tier] || shapes.documented}</svg>`;
}

export function tierPill(tier) {
  return `<span class="pill tier-pill c-${tier}" data-tip="${esc(t(`tiers.${tier}.desc`))}">${tierGlyph(tier)}<span>${esc(t(`tiers.${tier}.name`))}</span></span>`;
}

// Line icons used across the shell. 16x16, stroked with currentColor.
const ICONS = {
  overview: '<path d="M2 2h5v5H2zM9 2h5v3H9zM9 7h5v7H9zM2 9h5v5H2z"/>',
  ledger: '<path d="M3 2.5h10v11H3zM5.5 5.5h5M5.5 8h5M5.5 10.5h3"/>',
  ontology: '<circle cx="8" cy="3" r="1.6"/><circle cx="3" cy="12" r="1.6"/><circle cx="13" cy="12" r="1.6"/><path d="M7.2 4.4 3.8 10.6M8.8 4.4l3.4 6.2M4.6 12h6.8"/>',
  legal: '<path d="M8 2v12M4 14h8M3 5h10M3 5l-1.6 4h3.2zM13 5l-1.6 4h3.2zM8 2.8 3 5M8 2.8 13 5"/>',
  field: '<path d="M2.5 4.5h7v7h-7zM9.5 7l4-2.5v7l-4-2.5"/>',
  integrity: '<path d="M8 1.8 13 4v4c0 3-2.2 5.2-5 6.2C5.2 13.2 3 11 3 8V4z"/><path d="m5.6 8 1.7 1.7 3.2-3.4"/>',
  method: '<path d="M4 2h6l3 3v9H4zM10 2v3h3M6 8h5M6 10.5h5"/>',
  about: '<circle cx="8" cy="8" r="6"/><path d="M8 7v4.5M8 4.6v.2"/>',
  search: '<circle cx="7" cy="7" r="4.5"/><path d="m10.4 10.4 3.6 3.6"/>',
  menu: '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  close: '<path d="m4 4 8 8M12 4l-8 8"/>',
  moon: '<path d="M12.8 10.4A5.4 5.4 0 0 1 5.6 3.2a5.4 5.4 0 1 0 7.2 7.2z"/>',
  sun: '<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>',
  globe: '<circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2 2.6 4 2.6 6S10 12 8 14C6 12 5.4 10 5.4 8S6 4 8 2z"/>',
  arrow: '<path d="M3 8h10M9 4l4 4-4 4"/>',
  back: '<path d="M13 8H3M7 4 3 8l4 4"/>',
  external: '<path d="M9 2.5h4.5V7M13.5 2.5 7 9M11 9.5v4H2.5V5h4"/>',
  play: '<path d="M4.5 3v10l8.5-5z"/>',
  pause: '<path d="M4.5 3h2.5v10H4.5zM9 3h2.5v10H9z"/>',
  copy: '<path d="M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3"/>',
  link: '<path d="M6.8 9.2 9.2 6.8M5.6 7.6 4 9.2a2.3 2.3 0 0 0 3.2 3.2l1.6-1.6M10.4 8.4 12 6.8a2.3 2.3 0 0 0-3.2-3.2L7.2 5.2"/>',
  filter: '<path d="M2 3h12L9.5 8.5V13l-3-1.5v-3z"/>',
  reset: '<path d="M3 8a5 5 0 1 0 1.5-3.6M3 2.5v3h3"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  github: '<path d="M8 1.6a6.4 6.4 0 0 0-2 12.5c.3 0 .4-.1.4-.3v-1.1c-1.8.4-2.2-.8-2.2-.8-.3-.7-.7-.9-.7-.9-.6-.4 0-.4 0-.4.6 0 1 .7 1 .7.6 1 1.5.7 1.9.5 0-.4.2-.7.4-.9-1.4-.2-2.9-.7-2.9-3.2 0-.7.2-1.3.7-1.7-.1-.2-.3-.8 0-1.7 0 0 .6-.2 1.8.7a6 6 0 0 1 3.2 0c1.2-.9 1.8-.7 1.8-.7.3.9.1 1.5 0 1.7.4.4.7 1 .7 1.7 0 2.5-1.5 3-2.9 3.2.2.2.4.6.4 1.1v1.7c0 .2.1.3.4.3A6.4 6.4 0 0 0 8 1.6z"/>',
  chevron: '<path d="m6 4 4 4-4 4"/>',
  down: '<path d="m4 6 4 4 4-4"/>',
  live: '<circle cx="8" cy="8" r="2.5"/><path d="M4.2 4.2a5.4 5.4 0 0 0 0 7.6M11.8 4.2a5.4 5.4 0 0 1 0 7.6"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

// Count a number up from 0 when it first renders. Purely visual; the final
// text is always the real formatted value.
export function countUp(root = document) {
  const els = qsa('[data-count]', root);
  if (reducedMotion()) {
    for (const el of els) el.textContent = formatNumber(Number(el.dataset.count));
    return;
  }
  for (const el of els) {
    const to = Number(el.dataset.count);
    const dur = 900 + Math.min(600, to * 20);
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = formatNumber(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = formatNumber(0);
    requestAnimationFrame(step);
  }
}

// Staggered reveal: children with [data-reveal] get an index the CSS uses for delay.
export function stagger(root = document) {
  qsa('[data-reveal]', root).forEach((el, i) => el.style.setProperty('--i', String(i)));
}

// Elements with data-w / data-h / data-x carry geometry that must be applied through the CSSOM.
export function applyGeometry(root = document) {
  for (const el of qsa('[data-w]', root)) el.style.setProperty('--w', `${el.dataset.w}%`);
  for (const el of qsa('[data-h]', root)) el.style.setProperty('--h', `${el.dataset.h}%`);
  for (const el of qsa('[data-x]', root)) el.style.setProperty('--x', `${el.dataset.x}%`);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

export function flashLabel(btn, label) {
  const target = btn.querySelector('.lbl') || btn;
  const original = target.textContent;
  target.textContent = label;
  btn.classList.add('is-flash');
  setTimeout(() => { target.textContent = original; btn.classList.remove('is-flash'); }, 1600);
}

export function normalise(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// A labelled panel, the basic building block of every page.
export function panel({ id = '', title, sub = '', actions = '', body, cls = '', span = '' }) {
  return `<section class="panel ${cls}" ${id ? `id="${id}"` : ''} ${span ? `data-span="${span}"` : ''} data-reveal>
    <header class="panel-head">
      <div class="panel-titles"><h2 class="panel-title">${title}</h2>${sub ? `<p class="panel-sub">${sub}</p>` : ''}</div>
      ${actions ? `<div class="panel-actions">${actions}</div>` : ''}
    </header>
    <div class="panel-body">${body}</div>
  </section>`;
}

export function n(value) {
  return formatNumber(value);
}
