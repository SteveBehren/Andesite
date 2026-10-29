// Andesite front end: boot, routing, the application shell and live updates.
// Each page lives in views/*.js and exports render(root, ctx), which may return a cleanup function.
import { LANGS, LANG_NAMES, resolveLang, loadLang, lang, t, formatDate } from './i18n.js';
import { verifyLedger } from './seal.js';
import { $, qsa, esc, pick, icon, storeSet, copyText, flashLabel, normalise, REPO, catName, reducedMotion } from './util.js';
import { buildView, buildOntology, counts, latest } from './model.js';
import { installTooltip, applyDelays } from './charts.js';
import * as overview from './views/overview.js';
import * as ledger from './views/ledger.js';
import * as ontology from './views/ontology.js';
import * as legal from './views/legal.js';
import * as field from './views/field.js';
import * as integrity from './views/integrity.js';
import * as docs from './views/docs.js';

const POLL_MS = 2 * 60 * 1000;

// priority 1 pages sit in the top bar from 1024px; priority 2 join them from 1280px.
const PAGES = [
  { key: 'overview', icon: 'overview', priority: 1, view: overview },
  { key: 'ledger', icon: 'ledger', priority: 1, view: ledger },
  { key: 'ontology', icon: 'ontology', priority: 1, view: ontology, subs: ['semantic', 'kinetic', 'dynamic'] },
  { key: 'legal', icon: 'legal', priority: 1, view: legal },
  { key: 'integrity', icon: 'integrity', priority: 1, view: integrity },
  { key: 'field', icon: 'field', priority: 2, view: field },
  { key: 'method', icon: 'method', priority: 2, view: docs },
  { key: 'about', icon: 'about', priority: 2, view: docs },
];
const TABBAR = ['overview', 'ledger', 'ontology', 'legal'];

const state = {
  data: null,
  view: [],
  model: null,
  seal: null,
  route: { page: 'overview', sub: null, id: null, params: new URLSearchParams() },
  lastCheck: null,
  cleanup: null,
};

// ---------- Data ----------

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  const [entries, lock, amendments, laws, ontologyData] = await Promise.all([
    fetchJson('data/entries.json'),
    fetchJson('data/ledger.lock.json'),
    fetchJson('data/amendments.json'),
    fetchJson('data/laws.json'),
    fetchJson('data/ontology.json'),
  ]);
  return { entries, lock, amendments, laws, ontology: ontologyData };
}

function setData(data) {
  state.data = data;
  state.view = buildView(data);
  state.model = buildOntology(data, state.view);
}

// ---------- Routing ----------
// Routes: #/page, #/page/sub-or-id, optional ?query. Old single-page anchors keep working.

const LEGACY = { ledger: '/ledger', laws: '/legal', method: '/method', about: '/about', 'field-reports': '/field', top: '/overview', 'about-read': '/about?s=read' };

function parseRoute() {
  let hash = location.hash.replace(/^#/, '');
  const legacyEntry = hash.match(/^(AND-\d{4,})$/);
  if (legacyEntry) hash = `/ledger/${legacyEntry[1]}`;
  else if (LEGACY[hash]) hash = LEGACY[hash];
  if (!hash.startsWith('/')) hash = '/overview';
  const [path, query = ''] = hash.split('?');
  const [page = 'overview', second = null] = path.split('/').filter(Boolean);
  const cfg = PAGES.find((p) => p.key === page) || PAGES[0];
  const route = { page: cfg.key, sub: null, id: null, params: new URLSearchParams(query) };
  if (cfg.subs) route.sub = cfg.subs.includes(second) ? second : cfg.subs[0];
  else if (second) route.id = decodeURIComponent(second);
  return route;
}

export function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function pageLabel(key) { return t(`nav.${key}`); }

// ---------- Shell ----------

function renderNav() {
  const active = state.route.page;
  $('tb-nav').innerHTML = PAGES.map((p) => `<a class="tb-link" data-priority="${p.priority}" href="#/${p.key}" ${p.key === active ? 'aria-current="page"' : ''}>${icon(p.icon)}<span>${esc(pageLabel(p.key))}</span></a>`).join('');
  $('tabbar').innerHTML = TABBAR.map((k) => {
    const p = PAGES.find((x) => x.key === k);
    return `<a class="tab" href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(p.icon)}<span>${esc(t(`nav.short.${k}`))}</span></a>`;
  }).join('') + `<button type="button" class="tab" data-open-menu ${TABBAR.includes(active) ? '' : 'aria-current="page"'}>${icon('menu')}<span>${esc(t('nav.more'))}</span></button>`;
  renderSubbar();
}

function renderSubbar() {
  const r = state.route;
  const cfg = PAGES.find((p) => p.key === r.page);
  const crumbs = [`<a href="#/overview">Andesite</a>`, `<a href="#/${r.page}" ${!r.sub && !r.id ? 'aria-current="page"' : ''}>${esc(pageLabel(r.page))}</a>`];
  if (r.id) crumbs.push(`<span aria-current="page" class="mono">${esc(r.id)}</span>`);
  const tabs = cfg.subs ? `<div class="sub-tabs" role="tablist">${cfg.subs.map((s, i) => `<a role="tab" href="#/${r.page}/${s}" aria-selected="${s === r.sub}" class="sub-tab"><span class="st-n mono">0${i + 1}</span>${esc(t(`ontology.layers.${s}.name`))}</a>`).join('')}</div>` : '';
  $('subbar').innerHTML = `<nav class="crumbs" aria-label="${esc(t('nav.breadcrumb'))}">${crumbs.join('<span class="sep" aria-hidden="true">/</span>')}</nav>${tabs}
    <p class="sub-meta mono">${esc(t('nav.objects', { n: state.view.length }))}</p>`;
}

function renderStatic() {
  document.title = `${pageLabel(state.route.page)} · Andesite`;
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta.description'));
  $('skip-link').textContent = t('nav.skip');
  $('brand-sub').textContent = t('meta.sub');
  $('search-label').textContent = t('nav.search');
  $('open-search').setAttribute('aria-label', t('nav.searchHint'));
  $('live-label').textContent = t('nav.live');
  $('menu-toggle').setAttribute('aria-label', t('nav.menu'));
  $('menu-close').setAttribute('aria-label', t('nav.close'));
  $('menu-title').textContent = t('nav.menu');
  $('menu-panel').setAttribute('aria-label', t('nav.menu'));
  $('seal-copy').textContent = t('seal.copy');
  $('seal-more').textContent = t('seal.open');
  $('seal-head-label').textContent = t('seal.head');
  $('seal-explain').textContent = t('seal.explain');
  $('palette-input').placeholder = t('palette.placeholder');
  $('lang-current').textContent = lang().toUpperCase();
  $('lang-btn').setAttribute('aria-label', `${t('nav.language')}: ${LANG_NAMES[lang()]}`);
  $('lang-pop').innerHTML = LANGS.map((code) => `<li><a href="?lang=${code}${location.hash}" data-lang="${code}" lang="${code}" hreflang="${code}" ${code === lang() ? 'aria-current="true"' : ''}>${esc(LANG_NAMES[code])}<span class="mono">${code.toUpperCase()}</span></a></li>`).join('');
  $('footer-notcourt').textContent = t('hero.notCourt');
  $('footer-licences').textContent = t('footer.licences');
  $('footer-repo').textContent = t('footer.repo');
  $('footer-built').textContent = t('footer.builtBy');
  $('footer-last-label').textContent = `${t('footer.lastAdded')}:`;
  $('footer-head-label').textContent = `${t('footer.head')}:`;
  const last = state.data.entries.map((e) => e.addedOn).sort().at(-1);
  $('footer-last').textContent = last ? formatDate(last) : '';
  renderThemeControls();
  renderLive();
}

function renderMenu() {
  const r = state.route;
  const pages = PAGES.map((p) => `<li><a class="dm-link" href="#/${p.key}" ${p.key === r.page ? 'aria-current="page"' : ''}>${icon(p.icon)}<span class="dm-text"><span class="dm-name">${esc(pageLabel(p.key))}</span><span class="dm-desc">${esc(t(`nav.desc.${p.key}`))}</span></span>${icon('chevron', 'dm-chev')}</a>
    ${p.subs ? `<ul class="dm-subs">${p.subs.map((s) => `<li><a href="#/${p.key}/${s}" ${r.page === p.key && r.sub === s ? 'aria-current="page"' : ''}>${esc(t(`ontology.layers.${s}.name`))}</a></li>`).join('')}</ul>` : ''}</li>`).join('');
  const theme = currentTheme();
  $('menu-body').innerHTML = `
    <p class="dm-label">${esc(t('nav.pages'))}</p>
    <ul class="dm-pages">${pages}</ul>
    <p class="dm-label">${esc(t('nav.language'))}</p>
    <ul class="dm-langs">${LANGS.map((code) => `<li><a href="?lang=${code}${location.hash}" data-lang="${code}" lang="${code}" hreflang="${code}" ${code === lang() ? 'aria-current="true"' : ''}>${esc(LANG_NAMES[code])}</a></li>`).join('')}</ul>
    <p class="dm-label">${esc(t('nav.theme'))}</p>
    <div class="seg" role="group">${['dark', 'light'].map((k) => `<button type="button" data-theme-set="${k}" aria-pressed="${theme === k}">${esc(t(`nav.${k}`))}</button>`).join('')}</div>
    <p class="dm-label">${esc(t('nav.contribute'))}</p>
    <ul class="dm-ext">
      <li><a href="${REPO}" rel="noopener">${icon('github')}<span>${esc(t('nav.repo'))}</span>${icon('external', 'dm-chev')}</a></li>
      <li><a href="${REPO}/issues/new/choose" rel="noopener">${icon('plus')}<span>${esc(t('nav.submit'))}</span>${icon('external', 'dm-chev')}</a></li>
    </ul>
    <p class="dm-foot small">${esc(t('hero.notCourt'))}</p>`;
}

// ---------- Theme ----------

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storeSet('andesite.theme', theme);
  renderThemeControls();
  renderMenu();
}

function renderThemeControls() {
  const theme = currentTheme();
  const btn = $('theme-toggle');
  btn.setAttribute('aria-label', theme === 'dark' ? t('nav.toLight') : t('nav.toDark'));
  btn.dataset.tip = btn.getAttribute('aria-label');
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#0d1117' : '#f6f7f9');
}

// ---------- Seal ----------

function renderSeal() {
  const badge = $('seal-badge');
  const text = $('seal-text');
  const banner = $('seal-banner');
  const s = state.seal;
  if (!s) {
    badge.dataset.state = 'pending';
    text.textContent = t('seal.verifying');
    return;
  }
  $('seal-hash').textContent = s.head;
  $('footer-head').textContent = s.head.slice(0, 16);
  $('footer-head').dataset.tip = s.head;
  if (s.unavailable) {
    badge.dataset.state = 'pending';
    text.textContent = t('seal.unavailable');
    banner.hidden = true;
    return;
  }
  if (s.ok) {
    badge.dataset.state = 'ok';
    const full = t('seal.ok', { n: s.verified, total: s.total });
    text.innerHTML = `<span class="st-long">${esc(t('seal.okShort', { n: s.verified, total: s.total }))}</span><span class="st-short">${s.verified}/${s.total}</span><span class="st-hash mono">${esc(s.head.slice(0, 8))}</span>`;
    badge.dataset.tip = full;
    $('seal-sr').textContent = ` ${full}. ${t('seal.head')}: ${s.head}`;
    banner.hidden = true;
  } else {
    badge.dataset.state = 'broken';
    text.textContent = t('seal.broken');
    $('seal-sr').textContent = '';
    banner.innerHTML = `<div>${esc(t('seal.brokenBanner', { id: s.brokenAt }))} <a href="${REPO}" rel="noopener">GitHub</a></div>`;
    banner.hidden = false;
  }
}

function renderLive() {
  const when = state.lastCheck ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(state.lastCheck) : '';
  $('live').dataset.tip = t('nav.liveTip', { time: when || '…' });
}

// ---------- Page rendering ----------

function ctx() {
  return { state, go, counts: counts(state.view), rerender: render };
}

function render() {
  state.route = parseRoute();
  if (typeof state.cleanup === 'function') { try { state.cleanup(); } catch (e) { console.error(e); } }
  state.cleanup = null;
  const cfg = PAGES.find((p) => p.key === state.route.page);
  renderStatic();
  renderNav();
  renderMenu();
  const main = $('main');
  main.className = `view page-${cfg.key}`;
  main.innerHTML = '';
  state.cleanup = cfg.view.render(main, { ...ctx(), page: cfg.key });
  applyDelays(main);
  // Restart the entry animation on every navigation.
  void main.offsetWidth;
  main.classList.add('view-enter');
}

function onRouteChange() {
  const prev = state.route;
  const next = parseRoute();
  closeMenu(false);
  closePalette(false);
  // Selecting an object inside the same page should not throw the visitor back to the top.
  const samePage = prev.page === next.page && prev.sub === next.sub;
  render();
  if (!samePage) window.scrollTo({ top: 0, behavior: 'auto' });
  if (!samePage) $('main').focus({ preventScroll: true });
}

// ---------- Menu drawer ----------

function openMenu() {
  renderMenu();
  $('menu-panel').hidden = false;
  $('menu-scrim').hidden = false;
  document.body.classList.add('has-drawer');
  $('menu-toggle').setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => $('menu-panel').classList.add('is-open'));
  ($('menu-panel').querySelector('.dm-pages [aria-current="page"]') || $('menu-close')).focus();
}

function closeMenu(returnFocus = true) {
  if ($('menu-panel').hidden) return;
  $('menu-panel').classList.remove('is-open');
  $('menu-scrim').hidden = true;
  document.body.classList.remove('has-drawer');
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  const done = () => { $('menu-panel').hidden = true; };
  if (reducedMotion()) done(); else setTimeout(done, 220);
  if (returnFocus) $('menu-toggle').focus();
}

function trapFocus(event, container) {
  if (event.key !== 'Tab') return;
  const items = qsa('a, button, input', container).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// ---------- Command palette ----------

let paletteItems = [];
let paletteIndex = 0;

function paletteSource() {
  const items = [];
  for (const p of PAGES) {
    items.push({ group: t('palette.pages'), label: pageLabel(p.key), sub: t(`nav.desc.${p.key}`), href: `#/${p.key}`, icon: p.icon });
    for (const s of p.subs || []) items.push({ group: t('palette.pages'), label: `${pageLabel(p.key)} / ${t(`ontology.layers.${s}.name`)}`, sub: t(`ontology.layers.${s}.tag`), href: `#/${p.key}/${s}`, icon: p.icon });
  }
  for (const v of latest(state.view)) {
    items.push({ group: t('palette.entries'), label: pick(v.entry.title), sub: `${v.entry.id} · ${v.entry.location.place}`, href: `#/ledger/${v.entry.id}`, icon: 'ledger', hay: `${v.entry.id} ${v.entry.title.en} ${v.entry.actor}` });
  }
  for (const [key, a] of Object.entries(state.data.ontology.actors)) {
    if (!state.model.objects.has(`actor:${key}`)) continue;
    items.push({ group: t('palette.actors'), label: pick(a.name), sub: a.short, href: `#/ledger?actor=${key}`, icon: 'ontology', hay: a.aliases.join(' ') });
  }
  for (const [key, law] of Object.entries(state.data.laws)) {
    items.push({ group: t('palette.laws'), label: law.short, sub: lang() === 'id' ? law.instrument.id : law.instrument.en, href: `#/legal/${key}`, icon: 'legal', hay: law.citation });
  }
  for (const c of ['press', 'expression', 'assembly', 'information']) {
    items.push({ group: t('palette.rights'), label: catName(c), sub: t('palette.filterLedger'), href: `#/ledger?cat=${c}`, icon: 'filter' });
  }
  return items;
}

function renderPalette() {
  const q = normalise($('palette-input').value.trim());
  const all = paletteSource();
  paletteItems = q ? all.filter((i) => normalise(`${i.label} ${i.sub} ${i.hay || ''}`).includes(q)).slice(0, 40) : all.slice(0, 18);
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  let group = '';
  $('palette-list').innerHTML = paletteItems.length ? paletteItems.map((it, i) => {
    const head = it.group !== group ? `<li class="pal-group" role="presentation">${esc(it.group)}</li>` : '';
    group = it.group;
    return `${head}<li role="option" id="pal-${i}" aria-selected="${i === paletteIndex}"><a href="${esc(it.href)}" data-i="${i}">${icon(it.icon)}<span class="pal-text"><span class="pal-label">${esc(it.label)}</span><span class="pal-sub">${esc(it.sub || '')}</span></span>${icon('arrow', 'pal-go')}</a></li>`;
  }).join('') : `<li class="pal-empty">${esc(t('palette.none'))}</li>`;
  $('palette-input').setAttribute('aria-activedescendant', paletteItems.length ? `pal-${paletteIndex}` : '');
  $('palette-list').querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  $('palette').hidden = false;
  $('palette-scrim').hidden = false;
  $('palette-input').value = '';
  paletteIndex = 0;
  renderPalette();
  requestAnimationFrame(() => $('palette').classList.add('is-open'));
  $('palette-input').focus();
}

function closePalette(returnFocus = true) {
  if ($('palette').hidden) return;
  $('palette').classList.remove('is-open');
  $('palette').hidden = true;
  $('palette-scrim').hidden = true;
  if (returnFocus) $('open-search').focus();
}

// ---------- Language ----------

async function switchLang(code) {
  if (code === lang()) return;
  await loadLang(code);
  const url = new URL(location.href);
  if (code === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', code);
  history.replaceState(null, '', url);
  render();
  renderSeal();
}

function togglePop(btnId, popId, force) {
  const pop = $(popId);
  const open = force ?? pop.hidden;
  pop.hidden = !open;
  $(btnId).setAttribute('aria-expanded', String(open));
}

// ---------- Events ----------

function bindEvents() {
  window.addEventListener('hashchange', onRouteChange);
  $('theme-toggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  $('menu-toggle').addEventListener('click', openMenu);
  $('menu-close').addEventListener('click', () => closeMenu());
  $('menu-scrim').addEventListener('click', () => closeMenu());
  $('menu-panel').addEventListener('keydown', (e) => trapFocus(e, $('menu-panel')));
  $('palette').addEventListener('keydown', (e) => trapFocus(e, $('palette')));
  $('tabbar').addEventListener('click', (e) => { if (e.target.closest('[data-open-menu]')) openMenu(); });

  document.addEventListener('click', async (e) => {
    const langLink = e.target.closest('[data-lang]');
    if (langLink) {
      e.preventDefault();
      togglePop('lang-btn', 'lang-pop', false);
      await switchLang(langLink.dataset.lang);
      if (!$('menu-panel').hidden) { renderMenu(); $('menu-body').querySelector('.dm-langs [aria-current="true"]')?.focus(); }
      return;
    }
    const themeBtn = e.target.closest('[data-theme-set]');
    if (themeBtn) { setTheme(themeBtn.dataset.themeSet); return; }
    if (e.target.closest('#menu-panel a[href^="#"]')) closeMenu(false);
    // Chart marks that carry a destination behave like links.
    const href = e.target.closest('[data-href]');
    if (href && !e.target.closest('a')) go(href.dataset.href);
    if (!$('seal-panel').hidden && !e.target.closest('.seal-wrap')) togglePop('seal-badge', 'seal-panel', false);
    if (!$('lang-pop').hidden && !e.target.closest('.lang-wrap')) togglePop('lang-btn', 'lang-pop', false);
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
      e.preventDefault();
      if ($('palette').hidden) openPalette(); else closePalette();
      return;
    }
    if (e.key === 'Escape') {
      closePalette();
      closeMenu();
      togglePop('seal-badge', 'seal-panel', false);
      togglePop('lang-btn', 'lang-pop', false);
    }
    const href = e.target.closest?.('[data-href]');
    if (href && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('a')) { e.preventDefault(); go(href.dataset.href); }
  });

  $('seal-badge').addEventListener('click', () => togglePop('seal-badge', 'seal-panel'));
  $('lang-btn').addEventListener('click', () => togglePop('lang-btn', 'lang-pop'));
  $('seal-copy').addEventListener('click', async () => {
    if (await copyText(state.seal?.head || '')) flashLabel($('seal-copy'), t('seal.copied'));
    else {
      const range = document.createRange();
      range.selectNodeContents($('seal-hash'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });
  $('seal-more').addEventListener('click', () => togglePop('seal-badge', 'seal-panel', false));

  $('open-search').addEventListener('click', openPalette);
  $('palette-scrim').addEventListener('click', () => closePalette());
  $('palette-input').addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
  $('palette-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); renderPalette(); }
    else if (e.key === 'Enter' && paletteItems[paletteIndex]) { e.preventDefault(); closePalette(false); go(paletteItems[paletteIndex].href); }
  });
  $('palette-list').addEventListener('click', (e) => { if (e.target.closest('a')) closePalette(false); });

  // Keep the header compact once the page scrolls.
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { document.body.classList.toggle('is-scrolled', window.scrollY > 4); ticking = false; });
  }, { passive: true });
}

// ---------- Live updates ----------
// The ledger is append-only, so a changed lock head means new entries (or a tampered copy).

function showToast(message, onShow) {
  const toast = $('toast');
  toast.innerHTML = `<span class="live-dot" aria-hidden="true"></span><span>${esc(message)}</span>` + (onShow ? `<button type="button" class="btn btn-small">${esc(t('live.show'))}</button>` : '');
  toast.hidden = false;
  if (onShow) toast.querySelector('button').addEventListener('click', () => { toast.hidden = true; onShow(); });
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 15000);
}

async function refresh() {
  let lock;
  let amendments;
  try {
    [lock, amendments] = await Promise.all([fetchJson('data/ledger.lock.json'), fetchJson('data/amendments.json')]);
  } catch (e) {
    return;
  }
  state.lastCheck = new Date();
  renderLive();
  const amendmentsChanged = JSON.stringify(amendments) !== JSON.stringify(state.data.amendments);
  if (lock.at(-1)?.hash === state.data.lock.at(-1)?.hash && !amendmentsChanged) return;
  $('progress').classList.add('is-on');
  const before = new Set(state.data.entries.map((e) => e.id));
  setData(await loadData());
  state.seal = await verifyLedger(state.data.entries, state.data.lock);
  render();
  renderSeal();
  $('progress').classList.remove('is-on');
  const added = state.data.entries.filter((e) => !before.has(e.id));
  if (added.length) {
    const key = added.length === 1 ? 'live.new' : 'live.newPlural';
    showToast(t(key, { n: added.length }), () => go(`#/ledger/${added.at(-1).id}`));
  } else {
    showToast(t('live.updated'));
  }
}

function startPolling() {
  state.lastCheck = new Date();
  renderLive();
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

// ---------- Boot ----------

async function boot() {
  $('progress').classList.add('is-on');
  const [, data] = await Promise.all([loadLang(resolveLang()), loadData()]);
  setData(data);
  installTooltip();
  bindEvents();
  render();
  $('progress').classList.remove('is-on');
  state.seal = await verifyLedger(data.entries, data.lock);
  renderSeal();
  // Pages that visualise the seal update in place once the result is in.
  const cfg = PAGES.find((p) => p.key === state.route.page);
  cfg.view.onSeal?.($('main'), { ...ctx(), page: cfg.key });
  startPolling();
}

boot().catch((err) => {
  console.error(err);
  $('main').innerHTML = `<p class="noscript">The ledger could not be loaded. The raw data is in <a href="data/entries.json">data/entries.json</a>.</p>`;
});
