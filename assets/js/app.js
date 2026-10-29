// Andesite front end: boot, rendering, filters, live updates.
import { LANGS, LANG_NAMES, resolveLang, loadLang, lang, t, formatNumber, formatDate, formatRange, today } from './i18n.js';
import { verifyLedger } from './seal.js';

const REPO = 'https://github.com/SteveBehren/Andesite';
const TIERS = ['court', 'acknowledged', 'documented', 'alleged', 'unverified'];
const HEADLINE_TIERS = TIERS.slice(0, 4);
const CATEGORIES = ['press', 'expression', 'assembly', 'information'];
const CHECKS = ['date_matches', 'location_geolocated', 'independent_second_angle', 'no_earlier_copy_found', 'account_not_new'];
const POLL_MS = 2 * 60 * 1000;

const state = {
  data: null,
  view: [],
  seal: null,
  search: '',
  tiers: new Set(),
  cats: new Set(),
  showField: true,
  law: null,
};

const $ = (id) => document.getElementById(id);

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function storeSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage blocked */ }
}

function siteUrl() {
  return location.origin + location.pathname.replace(/index\.html$/, '').replace(/\/$/, '');
}

function pick(i18nObj) {
  if (!i18nObj) return '';
  return i18nObj[lang()] || i18nObj.en || '';
}

// ---------- Data ----------

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function loadData() {
  const [entries, lock, amendments, laws] = await Promise.all([
    fetchJson('data/entries.json'),
    fetchJson('data/ledger.lock.json'),
    fetchJson('data/amendments.json'),
    fetchJson('data/laws.json'),
  ]);
  return { entries, lock, amendments, laws };
}

// Sealed entries never change; amendments are applied on top for display.
function buildView(data) {
  const byEntry = new Map();
  for (const a of data.amendments) {
    if (!byEntry.has(a.entry)) byEntry.set(a.entry, []);
    byEntry.get(a.entry).push(a);
  }
  return data.entries.map((entry) => {
    const amendments = (byEntry.get(entry.id) || []).slice().sort((x, y) => x.date.localeCompare(y.date));
    let tier = entry.tier;
    let withdrawn = false;
    let reviewed = entry.intake !== 'automated';
    let postsRemoved = false;
    const extraSources = [];
    for (const a of amendments) {
      if (a.type === 'tier_change' && a.toTier) tier = a.toTier;
      if (a.type === 'withdrawn') withdrawn = true;
      if (a.reviewed) reviewed = true;
      if (a.postsRemoved) postsRemoved = true;
      if (a.sources) extraSources.push(...a.sources);
    }
    return { entry, tier, withdrawn, reviewed, postsRemoved, amendments, extraSources };
  });
}

function counts(view) {
  const live = view.filter((v) => !v.withdrawn);
  const byTier = Object.fromEntries(TIERS.map((k) => [k, 0]));
  for (const v of live) byTier[v.tier] += 1;
  const lawCounts = {};
  for (const v of live) for (const ref of v.entry.laws) lawCounts[ref.law] = (lawCounts[ref.law] || 0) + 1;
  const years = view.map((v) => Number(v.entry.date.slice(0, 4)));
  const first = years.length ? Math.min(...years) : new Date().getFullYear();
  return {
    headline: HEADLINE_TIERS.reduce((n, k) => n + byTier[k], 0),
    field: byTier.unverified,
    byTier,
    lawCounts,
    lawsCited: Object.keys(lawCounts).length,
    first,
    years: new Date().getFullYear() - first + 1,
  };
}

// ---------- Small render helpers ----------

function glyph(tier) {
  const shapes = {
    court: '<rect class="g" x="1.5" y="1.5" width="9" height="9"/>',
    acknowledged: '<path class="g" d="M6 .9 11.1 6 6 11.1.9 6z"/>',
    documented: '<circle class="g" cx="6" cy="6" r="4.6"/>',
    alleged: '<path class="g-outline" d="M6 1.4 10.9 10.4H1.1z"/>',
    unverified: '<circle class="g-dash" cx="6" cy="6" r="4.4"/>',
  };
  return `<svg class="tier-glyph c-${tier}" viewBox="0 0 12 12" aria-hidden="true">${shapes[tier]}</svg>`;
}

function tierPill(tier) {
  return `<span class="tier-pill c-${tier}" title="${esc(t(`tiers.${tier}.desc`))}">${glyph(tier)}${esc(t(`tiers.${tier}.name`))}</span>`;
}

function shortPinpoint(pinpoint) {
  if (!pinpoint) return '';
  const m = pinpoint.match(/\(([^)]+)\)/);
  return m ? `(${m[1]})` : ` ${pinpoint}`;
}

function waybackUrl(url) {
  return `https://web.archive.org/web/*/${url}`;
}

// ---------- Static strings ----------

function renderStatic() {
  document.title = t('meta.title');
  document.querySelector('meta[name="description"]').setAttribute('content', t('meta.description'));
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);

  $('menu-toggle').setAttribute('aria-label', t('nav.menu'));
  $('menu-close').setAttribute('aria-label', t('nav.close'));
  $('menu-panel').setAttribute('aria-label', t('nav.menu'));
  $('seal-copy').textContent = t('seal.copy');
  $('seal-head-label').textContent = t('seal.head');
  $('seal-explain').textContent = t('seal.explain');

  $('strip-label').textContent = t('strip.label');
  $('strip-body').textContent = t('strip.body');
  $('strip-more').textContent = t('strip.more');
  $('strip-dismiss').textContent = t('strip.dismiss');

  $('not-court').textContent = t('hero.notCourt');
  $('tagline').textContent = t('hero.tagline');
  $('what-is').textContent = t('hero.whatIs');
  $('stat-years-label').textContent = t('hero.years');
  $('stat-laws-label').textContent = t('hero.lawsCited');

  $('filters-title').textContent = t('filters.title');
  $('search-label').textContent = t('filters.searchLabel');
  $('search').placeholder = t('filters.search');
  $('tier-chips-label').textContent = t('filters.tiers');
  $('cat-chips-label').textContent = t('filters.categories');
  $('year-label').textContent = t('filters.year');
  $('field-toggle-label').textContent = t('filters.showField');
  $('filters-reset').textContent = t('filters.reset');

  $('field-title').textContent = t('field.title');
  $('field-body').textContent = t('field.body');
  $('field-button').textContent = t('field.button');
  $('field-safety').textContent = t('field.safety');

  $('laws-title').textContent = t('lawsIndex.title');
  $('laws-intro').textContent = t('lawsIndex.intro');

  $('method-title').textContent = t('method.title');
  $('method-lead').textContent = t('method.lead');
  $('method-body').innerHTML = proseHtml(t('method.sections'));
  $('about-title').textContent = t('about.title');
  $('about-body').innerHTML = proseHtml(t('about.sections'), 'about');

  $('footer-licences').textContent = t('footer.licences');
  $('footer-repo').textContent = t('footer.repo');
  $('footer-built').textContent = t('footer.builtBy');
  $('footer-last-label').textContent = t('footer.lastAdded') + ':';
  $('footer-head-label').textContent = t('footer.head') + ':';

  renderLangList();
  renderThemeControls();
}

function linkify(text) {
  return esc(text).replace(/https:\/\/github\.com\/SteveBehren\b/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);
}

function proseHtml(sections, prefix) {
  if (!Array.isArray(sections)) return '';
  return sections.map((s, i) => {
    // The "How to read an entry" section is the target of the first-visit strip link.
    const id = prefix === 'about' && i === 5 ? ' id="about-read"' : '';
    return `<h3${id}>${esc(s.h)}</h3>${s.p.map((p) => `<p>${linkify(p)}</p>`).join('')}`;
  }).join('');
}

function renderLangList() {
  $('lang-list').innerHTML = LANGS.map((code) => {
    const current = code === lang();
    return `<li><a href="?lang=${code}${location.hash}" data-lang="${code}" lang="${code}" hreflang="${code}"${current ? ' aria-current="true"' : ''}>${esc(LANG_NAMES[code])}</a></li>`;
  }).join('');
}

// ---------- Theme ----------

function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  storeSet('andesite.theme', theme);
  renderThemeControls();
}

function renderThemeControls() {
  const theme = currentTheme();
  const btn = $('theme-toggle');
  btn.setAttribute('aria-label', theme === 'dark' ? t('nav.toLight') : t('nav.toDark'));
  btn.title = btn.getAttribute('aria-label');
  for (const b of document.querySelectorAll('[data-theme-set]')) {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === theme));
  }
  document.querySelector('meta[name="theme-color"]').setAttribute('content', theme === 'dark' ? '#141a19' : '#e8eeed');
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
  $('footer-head').textContent = s.head;
  if (s.unavailable) {
    badge.dataset.state = 'pending';
    text.textContent = t('seal.unavailable');
    banner.hidden = true;
    return;
  }
  if (s.ok) {
    badge.dataset.state = 'ok';
    const full = t('seal.ok', { n: s.verified, total: s.total });
    const short = t('seal.okShort', { n: s.verified, total: s.total });
    const narrow = window.matchMedia('(max-width: 420px)').matches;
    const small = window.matchMedia('(max-width: 640px)').matches;
    text.textContent = narrow ? `${s.verified}/${s.total}` : small ? short : `${full} · ${s.head.slice(0, 8)}`;
    badge.title = full;
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

// ---------- Hero ----------

function renderHero() {
  const c = counts(state.view);
  $('hero-count').textContent = formatNumber(c.headline);
  $('hero-line').textContent = t('hero.line', { from: c.first });
  $('stat-years').textContent = formatNumber(c.years);
  $('stat-laws').textContent = formatNumber(c.lawsCited);
  $('hero-field').textContent = t('hero.fieldReports', { n: formatNumber(c.field) });

  const total = c.headline || 1;
  $('tierbar').innerHTML = HEADLINE_TIERS
    .filter((k) => c.byTier[k] > 0)
    .map((k) => `<span class="bg-${k}" data-w="${(c.byTier[k] / total) * 100}"></span>`)
    .join('');
  // Set widths through the CSSOM so the strict CSP needs no 'unsafe-inline'.
  for (const span of $('tierbar').children) span.style.width = `${span.dataset.w}%`;
  $('tierbar').setAttribute('aria-label', `${t('hero.tierBar')}: ` + HEADLINE_TIERS.map((k) => `${t(`tiers.${k}.name`)} ${c.byTier[k]}`).join(', '));
  $('tier-legend').innerHTML = HEADLINE_TIERS.map((k) =>
    `<li>${glyph(k)}<span>${esc(t(`tiers.${k}.name`))}</span><span class="n">${formatNumber(c.byTier[k])}</span></li>`
  ).join('');
}

// ---------- Filters ----------

function renderFilterControls() {
  $('tier-chips').innerHTML = TIERS.map((k) =>
    `<button type="button" class="chip" data-tier="${k}" aria-pressed="${state.tiers.has(k)}">${glyph(k)}${esc(t(`tiers.${k}.short`))}</button>`
  ).join('');
  $('cat-chips').innerHTML = CATEGORIES.map((k) =>
    `<button type="button" class="chip" data-cat="${k}" aria-pressed="${state.cats.has(k)}">${esc(t(`categories.${k}`))}</button>`
  ).join('');
  const years = [...new Set(state.view.map((v) => v.entry.date.slice(0, 4)))].sort().reverse();
  $('year-jump').innerHTML = `<option value="">${esc(t('filters.allYears'))}</option>` +
    years.map((y) => `<option value="${y}">${y}</option>`).join('');
  $('field-toggle').checked = state.showField;
}

function normalise(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function matches(v) {
  const e = v.entry;
  if (v.tier === 'unverified' && !state.showField) return false;
  if (state.tiers.size && !state.tiers.has(v.tier)) return false;
  if (state.cats.size && !e.category.some((c) => state.cats.has(c))) return false;
  if (state.law && !e.laws.some((l) => l.law === state.law)) return false;
  if (state.search) {
    const hay = normalise([e.id, pick(e.title), pick(e.summary), e.title.en, e.actor, e.location.place, e.location.province].join(' '));
    const terms = normalise(state.search).split(/\s+/).filter(Boolean);
    if (!terms.every((term) => hay.includes(term))) return false;
  }
  return true;
}

function filtersActive() {
  return Boolean(state.search || state.tiers.size || state.cats.size || state.law || !state.showField);
}

function resetFilters() {
  state.search = '';
  state.tiers.clear();
  state.cats.clear();
  state.law = null;
  state.showField = true;
  $('search').value = '';
  renderFilterControls();
  renderTimeline();
}

// ---------- Timeline ----------

function entryHtml(v) {
  const e = v.entry;
  const classes = ['entry', `t-${v.tier}`];
  if (v.withdrawn) classes.push('is-withdrawn');
  const cats = e.category.map((c) => `<span class="cat-tag">${esc(t(`categories.${c}`) === `categories.${c}` ? c : t(`categories.${c}`))}</span>`).join('');
  const auto = e.intake === 'automated' && !v.reviewed
    ? `<span class="auto-tag" title="${esc(t('entry.autoRecordedNote'))}">${esc(t('entry.autoRecorded'))}</span>` : '';
  const amended = v.amendments.length ? `<span class="cat-tag">${esc(t('entry.amended'))}</span>` : '';
  const ctx = e.context ? `<p class="entry-context"><strong>${esc(t('entry.context'))}.</strong> ${esc(pick(e.context))}</p>` : '';

  return `<article class="${classes.join(' ')}" id="${e.id}" tabindex="-1" aria-labelledby="${e.id}-title">
    <div class="entry-head">
      <a class="entry-id" href="#${e.id}">${e.id}</a>
      <time class="entry-date" datetime="${e.date}">${esc(formatRange(e.date, e.dateEnd, e.datePrecision))}</time>
      ${tierPill(v.tier)}
      ${auto}${amended}
      ${cats}
    </div>
    <h3 id="${e.id}-title">${esc(pick(e.title))}</h3>
    <dl class="entry-meta">
      <div><dt>${esc(t('entry.place'))}</dt><dd>${esc(e.location.place)}</dd></div>
      <div><dt>${esc(t('entry.actor'))}</dt><dd>${esc(e.actor)}</dd></div>
    </dl>
    ${v.withdrawn ? `<p class="withdrawn-note">${esc(t('entry.withdrawnNote'))}</p>` : ''}
    ${auto ? `<p class="auto-note">${esc(t('entry.autoRecordedNote'))}</p>` : ''}
    <p class="entry-summary">${esc(pick(e.summary))}</p>
    ${ctx}
    ${e.field ? fieldHtml(e, v) : ''}
    <h4 class="block-title">${esc(t('entry.laws'))}</h4>
    <div class="laws-list">${e.laws.map(lawHtml).join('')}</div>
    <h4 class="block-title">${esc(t('entry.sources'))}</h4>
    <ul class="sources">${[...e.sources, ...v.extraSources].map(sourceHtml).join('')}</ul>
    ${v.amendments.length ? `<h4 class="block-title">${esc(t('entry.history'))}</h4><ul class="amendments">${v.amendments.map(amendmentHtml).join('')}</ul>` : ''}
    <div class="entry-actions">
      <button type="button" class="btn btn-small btn-quiet" data-action="cite" data-id="${e.id}">${esc(t('entry.cite'))}</button>
      <button type="button" class="btn btn-small btn-quiet" data-action="link" data-id="${e.id}">${esc(t('entry.copyLink'))}</button>
    </div>
    <div class="cite-box" id="${e.id}-cite" hidden></div>
  </article>`;
}

function lawHtml(ref) {
  const law = state.data.laws[ref.law];
  if (!law) return '';
  const ui = lang();
  const citation = law.citation.includes('; ratified')
    ? law.citation.replace(law.article, law.article + (ref.pinpoint ? ` ${ref.pinpoint}` : ''))
    : law.citation + (ref.pinpoint ? ` ${ref.pinpoint}` : '');
  const short = law.short + shortPinpoint(ref.pinpoint);
  const instrument = ui === 'id' ? law.instrument.id : law.instrument.en;
  let translation = '';
  if (ui !== law.originalLang && law.translations[ui]) {
    const official = law.translationNote?.[ui] === 'official';
    const label = official ? t('entry.officialTranslation') : t('entry.unofficialTranslation');
    const src = official && law.translationSources?.[ui] ? ` <a href="${esc(law.translationSources[ui])}" rel="noopener">OHCHR</a>` : '';
    translation = `<p class="law-translation" lang="${ui}"><span class="label">${esc(label)}${src}</span>${esc(law.translations[ui])}</p>`;
  }
  return `<details class="law-card">
    <summary><span class="law-short">${esc(short)}</span><span class="law-instrument">${esc(instrument)}</span></summary>
    <div class="law-body">
      <p class="law-citation">${esc(citation)}</p>
      <span class="law-original-label">${esc(t('entry.original'))}</span>
      <blockquote class="law-original" lang="${law.originalLang}">${esc(law.text)}</blockquote>
      ${translation}
      ${law.note ? `<p class="law-note">${linkifyUrls(law.note)}</p>` : ''}
      <a href="${esc(law.source)}" rel="noopener">${esc(t('entry.lawSource'))}</a>
    </div>
  </details>`;
}

function linkifyUrls(text) {
  return esc(text).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);
}

function sourceHtml(s) {
  const typeLabel = t(`entry.sourceTypes.${s.type}`);
  const date = s.published ? `<span>${esc(formatDate(s.published))}</span>` : '';
  // Never offer an archive link for social posts: a deleted post must stay deleted.
  const archived = s.type === 'social' ? '' : `<a href="${esc(waybackUrl(s.url))}" rel="noopener nofollow">${esc(t('entry.archived'))}</a>`;
  const rel = s.type === 'social' ? 'noopener noreferrer nofollow' : 'noopener';
  return `<li>
    <a class="src-title" href="${esc(s.url)}" rel="${rel}">${esc(s.title)}</a>
    <span class="src-meta"><span>${esc(s.publisher)}</span>${date}<span class="lang" title="${esc(s.lang)}">${esc(s.lang)}</span><span>${esc(typeLabel)}</span>${archived}</span>
  </li>`;
}

function fieldHtml(e, v) {
  const f = e.field;
  const checks = CHECKS.map((c) => {
    const ok = f.corroboration.checks.includes(c);
    return `<li class="${ok ? 'yes' : 'no'}"><span class="mark" aria-hidden="true">${ok ? '✓' : '·'}</span><span>${esc(t(`entry.checkNames.${c}`))}</span><span class="visually-hidden">${ok ? 'yes' : 'no'}</span></li>`;
  }).join('');
  const posts = v.postsRemoved
    ? `<p class="small">${esc(t('entry.originalUnavailable'))}</p>`
    : `<ul class="sources">${f.postUrls.map((u) => `<li><a href="${esc(u)}" rel="noopener noreferrer nofollow">${esc(new URL(u).hostname)}</a></li>`).join('')}</ul>`;
  return `<div class="field-block">
    <h4 class="block-title">${esc(t('entry.shows'))}</h4>
    <p>${esc(pick(f.shows))}</p>
    ${posts}
    <h4 class="block-title">${esc(t('entry.checks'))} · ${esc(t('entry.corroboration', { n: f.corroboration.count }))}</h4>
    <ul class="checks">${checks}</ul>
  </div>`;
}

function amendmentHtml(a) {
  const head = `${esc(formatDate(a.date))} · ${esc(t(`entry.amendTypes.${a.type}`))}`;
  const change = a.type === 'tier_change'
    ? ` (${esc(t('entry.fromTier', { from: t(`tiers.${a.fromTier}.name`), to: t(`tiers.${a.toTier}.name`) }))})` : '';
  return `<li><span class="a-head">${head}${change}</span><br>${esc(pick(a.note))}</li>`;
}

function renderTimeline() {
  const shown = state.view.filter(matches);
  // Newest first; entries with the same date keep ledger order reversed.
  shown.sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.id.localeCompare(a.entry.id));
  const groups = new Map();
  for (const v of shown) {
    const y = v.entry.date.slice(0, 4);
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(v);
  }
  const html = [...groups].map(([year, items]) => `<section class="year-group" id="year-${year}" aria-label="${year}">
      <div class="year-rail"><h2 class="year-mark">${year}</h2></div>
      <div class="year-entries">${items.map(entryHtml).join('')}</div>
    </section>`).join('');
  $('timeline').innerHTML = html || `<p class="empty-state">${esc(t('filters.none'))}</p>`;
  $('timeline').classList.remove('is-loading');

  const lawTag = state.law
    ? `<span class="law-tag">${esc(t('filters.lawFilter', { law: state.data.laws[state.law]?.short || state.law }))}<button type="button" data-action="clear-law" aria-label="${esc(t('filters.reset'))}">×</button></span>` : '';
  $('filter-count').innerHTML = esc(t('filters.count', { n: formatNumber(shown.length), total: formatNumber(state.view.length) })) + lawTag;
  $('filters-reset').hidden = !filtersActive();
  for (const b of document.querySelectorAll('#tier-chips .chip')) b.setAttribute('aria-pressed', String(state.tiers.has(b.dataset.tier)));
  for (const b of document.querySelectorAll('#cat-chips .chip')) b.setAttribute('aria-pressed', String(state.cats.has(b.dataset.cat)));
}

// ---------- Laws index, field section, footer ----------

function renderLawsIndex() {
  const c = counts(state.view);
  const ui = lang();
  const keys = Object.keys(state.data.laws).sort((a, b) => (c.lawCounts[b] || 0) - (c.lawCounts[a] || 0) || a.localeCompare(b));
  $('laws-index').innerHTML = keys.map((key) => {
    const law = state.data.laws[key];
    const n = c.lawCounts[key] || 0;
    return `<li class="${n ? '' : 'unused'}">
      <div class="li-top"><span class="law-short">${esc(law.short)}</span><span class="li-count">${esc(n ? t('lawsIndex.count', { n }) : t('lawsIndex.none'))}</span></div>
      <span class="li-name">${esc(ui === 'id' ? law.instrument.id : law.instrument.en)}, ${esc(law.article)}</span>
      ${n ? `<button type="button" class="btn btn-small btn-quiet" data-action="filter-law" data-law="${key}">${esc(t('lawsIndex.filter'))}</button>` : ''}
    </li>`;
  }).join('');
}

function renderFieldSection() {
  const c = counts(state.view);
  $('field-empty').textContent = c.field ? '' : t('field.empty');
  $('field-empty').hidden = Boolean(c.field);
}

function renderFooter() {
  const last = state.data.entries.map((e) => e.addedOn).sort().at(-1);
  $('footer-last').textContent = last ? formatDate(last) : '';
}

function renderAll() {
  renderStatic();
  renderSeal();
  renderHero();
  renderFilterControls();
  renderTimeline();
  renderLawsIndex();
  renderFieldSection();
  renderFooter();
}

// ---------- Interactions ----------

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    return false;
  }
}

function entryUrl(id) {
  return `${siteUrl()}/${lang() === 'en' ? '' : `?lang=${lang()}`}#${id}`;
}

function citeText(id) {
  const v = state.view.find((x) => x.entry.id === id);
  const year = v.entry.addedOn.slice(0, 4);
  return `Andesite. (${year}). ${pick(v.entry.title)}. ${t('entry.ledgerEntry')} ${id}. ${siteUrl()}/#${id}. ${t('entry.accessed')} ${today()}.`;
}

function showCopyFallback(id, text) {
  const box = $(`${id}-cite`);
  box.hidden = false;
  box.innerHTML = `<p class="small">${esc(t('entry.copyFailed'))}</p><textarea readonly>${esc(text)}</textarea>`;
  const ta = box.querySelector('textarea');
  ta.focus();
  ta.select();
}

async function onAction(event) {
  const btn = event.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === 'cite') {
    const text = citeText(id);
    const box = $(`${id}-cite`);
    const ok = await copyText(text);
    box.hidden = false;
    box.innerHTML = `<p class="small">${ok ? esc(t('entry.copied')) : esc(t('entry.copyFailed'))}</p><textarea readonly>${esc(text)}</textarea>`;
    if (!ok) { const ta = box.querySelector('textarea'); ta.focus(); ta.select(); }
  } else if (action === 'link') {
    const url = entryUrl(id);
    if (await copyText(url)) flashLabel(btn, t('entry.copied'));
    else showCopyFallback(id, url);
  } else if (action === 'filter-law') {
    state.law = btn.dataset.law;
    renderTimeline();
    $('ledger').scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  } else if (action === 'clear-law') {
    state.law = null;
    renderTimeline();
  }
}

function flashLabel(btn, label) {
  const original = btn.textContent;
  btn.textContent = label;
  setTimeout(() => { btn.textContent = original; }, 1600);
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function focusEntryFromHash() {
  const m = location.hash.match(/^#(AND-\d{4,})$/);
  if (!m) return;
  let el = document.getElementById(m[1]);
  if (!el && state.view.some((v) => v.entry.id === m[1])) {
    resetFilters();
    el = document.getElementById(m[1]);
  }
  if (!el) return;
  el.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  el.classList.remove('highlight');
  void el.offsetWidth; // restart the animation
  el.classList.add('highlight');
  el.focus({ preventScroll: true });
}

// Menu panel with a minimal focus trap.
function openMenu() {
  $('menu-panel').hidden = false;
  $('menu-scrim').hidden = false;
  $('menu-toggle').setAttribute('aria-expanded', 'true');
  ($('lang-list').querySelector('[aria-current="true"]') || $('menu-close')).focus();
}
function closeMenu(returnFocus = true) {
  if ($('menu-panel').hidden) return;
  $('menu-panel').hidden = true;
  $('menu-scrim').hidden = true;
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  if (returnFocus) $('menu-toggle').focus();
}
function trapFocus(event) {
  if (event.key !== 'Tab' || $('menu-panel').hidden) return;
  const items = [...$('menu-panel').querySelectorAll('a, button')].filter((el) => !el.disabled);
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function switchLang(code) {
  if (code === lang()) return;
  await loadLang(code);
  const url = new URL(location.href);
  if (code === 'en') url.searchParams.delete('lang'); else url.searchParams.set('lang', code);
  history.replaceState(null, '', url);
  renderAll();
}

function toggleSealPanel(force) {
  const panel = $('seal-panel');
  const open = force ?? panel.hidden;
  panel.hidden = !open;
  $('seal-badge').setAttribute('aria-expanded', String(open));
}

// Visibility is decided before first paint by the inline script in index.html.
function setupStrip() {
  $('strip-dismiss').addEventListener('click', () => {
    document.documentElement.classList.add('strip-off');
    storeSet('andesite.stripDismissed', '1');
  });
}

function bindEvents() {
  document.addEventListener('click', onAction);
  $('theme-toggle').addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
  $('theme-switch').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-set]');
    if (b) setTheme(b.dataset.themeSet);
  });
  $('menu-toggle').addEventListener('click', openMenu);
  $('menu-close').addEventListener('click', () => closeMenu());
  $('menu-scrim').addEventListener('click', () => closeMenu());
  $('menu-panel').addEventListener('keydown', trapFocus);
  $('menu-panel').addEventListener('click', async (e) => {
    const langLink = e.target.closest('[data-lang]');
    if (langLink) {
      e.preventDefault();
      await switchLang(langLink.dataset.lang);
      $('lang-list').querySelector('[aria-current="true"]')?.focus();
      return;
    }
    if (e.target.closest('.menu-links a')) closeMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeMenu(); toggleSealPanel(false); }
  });
  $('seal-badge').addEventListener('click', () => toggleSealPanel());
  document.addEventListener('click', (e) => {
    if (!$('seal-panel').hidden && !e.target.closest('.seal-wrap')) toggleSealPanel(false);
  });
  $('seal-copy').addEventListener('click', async () => {
    if (await copyText(state.seal?.head || '')) flashLabel($('seal-copy'), t('seal.copied'));
    else {
      const range = document.createRange();
      range.selectNodeContents($('seal-hash'));
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    }
  });

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = e.target.value.trim(); renderTimeline(); }, 120);
  });
  $('tier-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tier]');
    if (!b) return;
    const k = b.dataset.tier;
    state.tiers.has(k) ? state.tiers.delete(k) : state.tiers.add(k);
    renderTimeline();
  });
  $('cat-chips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]');
    if (!b) return;
    const k = b.dataset.cat;
    state.cats.has(k) ? state.cats.delete(k) : state.cats.add(k);
    renderTimeline();
  });
  $('field-toggle').addEventListener('change', (e) => { state.showField = e.target.checked; renderTimeline(); });
  $('filters-reset').addEventListener('click', resetFilters);
  $('year-jump').addEventListener('change', (e) => {
    const y = e.target.value;
    if (!y) return;
    const target = document.getElementById(`year-${y}`);
    if (target) target.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    e.target.value = '';
  });
  window.addEventListener('hashchange', focusEntryFromHash);
  window.matchMedia('(max-width: 640px)').addEventListener('change', renderSeal);
  window.matchMedia('(max-width: 420px)').addEventListener('change', renderSeal);
}

// ---------- Live updates ----------
// The ledger is append-only, so a changed lock head means new entries (or a tampered copy).

function showToast(message, onShow) {
  const toast = $('toast');
  toast.innerHTML = `<span>${esc(message)}</span>` + (onShow ? `<button type="button">${esc(t('live.show'))}</button>` : '');
  toast.hidden = false;
  if (onShow) toast.querySelector('button').addEventListener('click', () => { toast.hidden = true; onShow(); });
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 15000);
}

async function refresh() {
  let lock;
  try {
    lock = await fetchJson('data/ledger.lock.json');
  } catch (e) {
    return;
  }
  const amendmentsChanged = await amendmentsDiffer();
  const head = lock.at(-1)?.hash;
  if (head === state.data.lock.at(-1)?.hash && !amendmentsChanged) return;
  const before = new Set(state.data.entries.map((e) => e.id));
  const data = await loadData();
  state.data = data;
  state.view = buildView(data);
  state.seal = await verifyLedger(data.entries, data.lock);
  renderAll();
  const added = data.entries.filter((e) => !before.has(e.id));
  if (added.length) {
    const key = added.length === 1 ? 'live.new' : 'live.newPlural';
    const newest = added.at(-1).id;
    showToast(t(key, { n: added.length }), () => { location.hash = newest; });
  } else {
    showToast(t('live.updated'));
  }
}

async function amendmentsDiffer() {
  try {
    const amendments = await fetchJson('data/amendments.json');
    return JSON.stringify(amendments) !== JSON.stringify(state.data.amendments);
  } catch (e) {
    return false;
  }
}

function startPolling() {
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
}

// ---------- Boot ----------

async function boot() {
  const initialLang = resolveLang();
  const [, data] = await Promise.all([loadLang(initialLang), loadData()]);
  state.data = data;
  state.view = buildView(data);
  bindEvents();
  setupStrip();
  renderAll();
  state.seal = await verifyLedger(data.entries, data.lock);
  renderSeal();
  focusEntryFromHash();
  startPolling();
}

boot().catch((err) => {
  console.error(err);
  $('timeline').innerHTML = `<p class="empty-state">The ledger could not be loaded. The raw data is in <a href="data/entries.json">data/entries.json</a>.</p>`;
});
