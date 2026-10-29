// Ledger: every record, filterable, with a split-pane object view.
// Filters live in the URL (#/ledger?tier=court&actor=polri) so any chart can link into a filtered list.
import { t, formatNumber, formatRange } from '../i18n.js';
import { esc, pick, tierGlyph, catName, icon, normalise, TIERS, CATEGORIES, stagger, applyGeometry, $ } from '../util.js';
import { chronological, isNew, bestOutcome } from '../model.js';
import { entryDetail, wireEntryActions, actorName, actionName, outcomeName } from './parts.js';
import { applyDelays } from '../charts.js';

const FACETS = ['actor', 'action', 'outcome', 'law', 'cls'];

function readFilters(params) {
  const list = (k) => (params.get(k) || '').split(',').filter(Boolean);
  return {
    q: params.get('q') || '',
    tiers: new Set(list('tier')),
    cats: new Set(list('cat')),
    year: params.get('year') || '',
    field: params.get('field') !== '0',
    actor: params.get('actor') || '',
    action: params.get('action') || '',
    outcome: params.get('outcome') || '',
    law: params.get('law') || '',
    cls: params.get('cls') || '',
  };
}

function writeFilters(f) {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tiers.size) p.set('tier', [...f.tiers].join(','));
  if (f.cats.size) p.set('cat', [...f.cats].join(','));
  if (f.year) p.set('year', f.year);
  if (!f.field) p.set('field', '0');
  for (const k of FACETS) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

function matches(v, f, model) {
  const e = v.entry;
  const ann = model.annotations.get(e.id);
  if (v.tier === 'unverified' && !f.field) return false;
  if (f.tiers.size && !f.tiers.has(v.tier)) return false;
  if (f.cats.size && !e.category.some((c) => f.cats.has(c))) return false;
  if (f.year && !e.date.startsWith(f.year)) return false;
  if (f.law && !e.laws.some((l) => l.law === f.law)) return false;
  if (f.actor && !ann.actors.includes(f.actor) && !ann.actors.some((a) => model.ont.actors[a]?.parent === f.actor)) return false;
  if (f.action && !ann.actions.includes(f.action)) return false;
  if (f.outcome && !ann.outcomes.some((o) => o.type === f.outcome)) return false;
  if (f.cls && bestOutcome(ann) !== f.cls) return false;
  if (f.q) {
    const hay = normalise([e.id, pick(e.title), pick(e.summary), e.title.en, e.actor, e.location.place, e.location.province].join(' '));
    if (!normalise(f.q).split(/\s+/).filter(Boolean).every((term) => hay.includes(term))) return false;
  }
  return true;
}

function facetLabel(k, value, state) {
  const ont = state.data.ontology;
  if (k === 'actor') return actorName(ont, value);
  if (k === 'action') return actionName(ont, value);
  if (k === 'outcome') return outcomeName(ont, value);
  if (k === 'law') return state.data.laws[value]?.short || value;
  if (k === 'cls') return t(`dynamic.classes.${value}`);
  return value;
}

function rowHtml(v, state, query) {
  const e = v.entry;
  const ann = state.model.annotations.get(e.id);
  const fresh = isNew(v, state.view);
  const sel = state.route.id === e.id;
  return `<li><a class="lrow t-${v.tier}${v.withdrawn ? ' is-withdrawn' : ''}" href="#/ledger/${e.id}${query ? `?${query}` : ''}" ${sel ? 'aria-current="true"' : ''}>
    <span class="lr-glyph">${tierGlyph(v.tier)}</span>
    <span class="lr-main">
      <span class="lr-top"><span class="mono lr-id">${e.id}</span><time class="mono" datetime="${e.date}">${esc(formatRange(e.date, e.dateEnd, e.datePrecision))}</time>${fresh ? `<span class="pill pill-new">${esc(t('entry.new'))}</span>` : ''}</span>
      <span class="lr-title">${esc(pick(e.title))}</span>
      <span class="lr-meta">${esc(e.location.place)} · ${esc(ann.actors.map((a) => state.data.ontology.actors[a]?.short || a).join(', '))}</span>
    </span>
    <span class="lr-laws mono" data-tip="${esc(t('ledger.lawsCount', { n: e.laws.length }))}">${e.laws.length}§</span>
  </a></li>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const f = readFilters(state.route.params);
  const years = [...new Set(state.view.map((v) => v.entry.date.slice(0, 4)))].sort().reverse();
  const detail = state.route.id ? state.view.find((v) => v.entry.id === state.route.id) : null;

  root.innerHTML = `<div class="split ${detail ? 'has-detail' : ''}">
    <section class="list-pane" aria-labelledby="ledger-title">
      <div class="lp-head">
        <h1 class="page-title" id="ledger-title">${esc(t('ledger.title'))}</h1>
        <p class="page-lead">${esc(t('ledger.lead'))}</p>
      </div>
      <div class="toolbar" role="search">
        <label class="search">
          <span class="visually-hidden">${esc(t('filters.searchLabel'))}</span>
          ${icon('search')}
          <input type="search" id="lg-search" value="${esc(f.q)}" placeholder="${esc(t('filters.search'))}" autocomplete="off" spellcheck="false">
        </label>
        <div class="tb-row">
          <div class="chips" role="group" aria-label="${esc(t('filters.tiers'))}">${TIERS.map((k) => `<button type="button" class="chip chip-tier c-${k}" data-tier="${k}" aria-pressed="${f.tiers.has(k)}">${tierGlyph(k)}<span>${esc(t(`tiers.${k}.short`))}</span></button>`).join('')}</div>
        </div>
        <div class="tb-row">
          <div class="chips" role="group" aria-label="${esc(t('filters.categories'))}">${CATEGORIES.map((k) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${f.cats.has(k)}">${esc(catName(k))}</button>`).join('')}</div>
        </div>
        <div class="tb-row tb-row-end">
          <label class="select"><span>${esc(t('filters.year'))}</span>
            <select id="lg-year"><option value="">${esc(t('filters.allYears'))}</option>${years.map((y) => `<option value="${y}" ${f.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select>
          </label>
          <label class="toggle"><input type="checkbox" id="lg-field" ${f.field ? 'checked' : ''}><span class="toggle-track" aria-hidden="true"></span><span>${esc(t('filters.showField'))}</span></label>
        </div>
        <div class="facets" id="lg-facets"></div>
      </div>
      <p class="filter-count mono" id="lg-count" aria-live="polite"></p>
      <div class="lrows" id="lg-rows"></div>
    </section>
    <section class="detail-pane" aria-live="polite">
      ${detail ? `<a class="btn btn-small btn-quiet back-link" href="#/ledger${location.hash.split('?')[1] ? `?${location.hash.split('?')[1]}` : ''}">${icon('back')}<span>${esc(t('ledger.back'))}</span></a>${entryDetail(ctx, detail)}`
        : state.route.id ? `<p class="empty">${esc(t('ledger.notFound', { id: state.route.id }))}</p>`
          : `<div class="detail-empty">${icon('ledger', 'ico-xl')}<p>${esc(t('ledger.pick'))}</p><p class="small muted">${esc(t('ledger.pickHint'))}</p></div>`}
    </section>
  </div>`;

  const renderRows = () => {
    const shown = chronological(state.view).filter((v) => matches(v, f, state.model));
    const query = writeFilters(f);
    const groups = new Map();
    for (const v of shown) {
      const y = v.entry.date.slice(0, 4);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(v);
    }
    $('lg-rows').innerHTML = shown.length ? [...groups].map(([year, items]) => `<section class="lgroup" aria-label="${year}">
      <h2 class="lgroup-year mono"><span>${year}</span><span class="muted">${formatNumber(items.length)}</span></h2>
      <ul>${items.map((v) => rowHtml(v, state, query)).join('')}</ul></section>`).join('')
      : `<p class="empty">${esc(t('filters.none'))}</p>`;
    $('lg-count').textContent = t('filters.count', { n: formatNumber(shown.length), total: formatNumber(state.view.length) });
    const active = FACETS.filter((k) => f[k]);
    const any = active.length || f.q || f.tiers.size || f.cats.size || f.year || !f.field;
    $('lg-facets').innerHTML = active.map((k) => `<span class="facet"><span class="mono-label">${esc(t(`ledger.facets.${k}`))}</span>${esc(facetLabel(k, f[k], state))}<button type="button" data-clear="${k}" aria-label="${esc(t('filters.reset'))}">${icon('close')}</button></span>`).join('')
      + (any ? `<button type="button" class="btn btn-small btn-quiet" id="lg-reset">${icon('reset')}<span>${esc(t('filters.reset'))}</span></button>` : '');
    for (const b of root.querySelectorAll('[data-tier]')) b.setAttribute('aria-pressed', String(f.tiers.has(b.dataset.tier)));
    for (const b of root.querySelectorAll('[data-cat]')) b.setAttribute('aria-pressed', String(f.cats.has(b.dataset.cat)));
    applyDelays(root);
  };

  // Update the URL without a full re-render so typing in the search box keeps focus.
  const commit = () => {
    const q = writeFilters(f);
    const base = state.route.id ? `#/ledger/${state.route.id}` : '#/ledger';
    history.replaceState(null, '', `${location.pathname}${location.search}${base}${q ? `?${q}` : ''}`);
    state.route.params = new URLSearchParams(q);
    renderRows();
    const back = root.querySelector('.back-link');
    if (back) back.setAttribute('href', `#/ledger${q ? `?${q}` : ''}`);
  };

  renderRows();
  stagger(root);
  applyGeometry(root);

  let timer;
  root.querySelector('#lg-search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { f.q = e.target.value.trim(); commit(); }, 120);
  });
  root.querySelector('#lg-year').addEventListener('change', (e) => { f.year = e.target.value; commit(); });
  root.querySelector('#lg-field').addEventListener('change', (e) => { f.field = e.target.checked; commit(); });
  root.addEventListener('click', (e) => {
    const tier = e.target.closest('[data-tier]');
    if (tier) { const k = tier.dataset.tier; f.tiers.has(k) ? f.tiers.delete(k) : f.tiers.add(k); commit(); return; }
    const cat = e.target.closest('[data-cat]');
    if (cat) { const k = cat.dataset.cat; f.cats.has(k) ? f.cats.delete(k) : f.cats.add(k); commit(); return; }
    const clear = e.target.closest('[data-clear]');
    if (clear) { f[clear.dataset.clear] = ''; commit(); return; }
    if (e.target.closest('#lg-reset')) {
      Object.assign(f, readFilters(new URLSearchParams()));
      root.querySelector('#lg-search').value = '';
      root.querySelector('#lg-year').value = '';
      root.querySelector('#lg-field').checked = true;
      commit();
    }
  });

  const unwire = wireEntryActions(root, state);
  if (detail) {
    // On narrow screens the detail replaces the list; bring its title into view.
    if (window.matchMedia('(max-width: 1023px)').matches) window.scrollTo({ top: 0 });
    root.querySelector('.lrow[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  return () => { clearTimeout(timer); unwire(); };
}
