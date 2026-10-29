// Overview: the dashboard. The newest record always leads, then the shape of the ledger.
import { t, formatNumber, formatRange, formatDate } from '../i18n.js';
import { esc, pick, tierPill, tierGlyph, catName, icon, panel, countUp, stagger, applyGeometry, HEADLINE_TIERS, TIERS, CATEGORIES, OUTCOME_CLASSES, storeSet, $ } from '../util.js';
import { latest, isNew, bestOutcome } from '../model.js';
import { donut, yearColumns, barList, stackBar, legend, wireSankey, sparkline } from '../charts.js';
import { dotMap } from '../map.js';
import { truncate } from './parts.js';

function latestPanel(state) {
  const items = latest(state.view);
  const lead = items[0];
  if (!lead) return '';
  const e = lead.entry;
  const ann = state.model.annotations.get(e.id);
  const rest = items.slice(1, 5);
  return `<section class="panel panel-latest" data-span="8" data-reveal aria-labelledby="latest-title">
    <header class="panel-head">
      <div class="panel-titles"><h2 class="panel-title" id="latest-title"><span class="live-dot" aria-hidden="true"></span>${esc(t('overview.latest'))}</h2>
      <p class="panel-sub">${esc(t('overview.latestSub', { date: formatDate(e.addedOn) }))}</p></div>
      <div class="panel-actions"><a class="btn btn-small btn-quiet" href="#/ledger">${esc(t('overview.allRecords'))}${icon('arrow')}</a></div>
    </header>
    <div class="panel-body latest-body">
      <a class="latest-lead t-${lead.tier}" href="#/ledger/${e.id}">
        <span class="ll-tags"><span class="mono od-id">${e.id}</span>${tierPill(lead.tier)}${isNew(lead, state.view) ? `<span class="pill pill-new">${esc(t('entry.new'))}</span>` : ''}</span>
        <span class="latest-title">${esc(pick(e.title))}</span>
        <span class="latest-sum">${esc(truncate(pick(e.summary), 260))}</span>
        <span class="latest-meta">
          <span>${icon('ledger')}${esc(formatRange(e.date, e.dateEnd, e.datePrecision))}</span>
          <span>${esc(e.location.place)}</span>
          <span>${esc(ann.actors.map((a) => state.data.ontology.actors[a]?.short || a).join(', '))}</span>
          <span class="mono">${e.laws.map((l) => esc(state.data.laws[l.law]?.short || l.law)).join(' · ')}</span>
        </span>
        <span class="latest-go">${esc(t('overview.open'))}${icon('arrow')}</span>
      </a>
      <ol class="latest-list">${rest.map((v) => `<li><a href="#/ledger/${v.entry.id}" class="t-${v.tier}">
        ${tierGlyph(v.tier)}<span class="ll-main"><span class="ll-line mono">${v.entry.id} · ${esc(formatDate(v.entry.date, v.entry.datePrecision))}${isNew(v, state.view) ? ` <span class="pill pill-new">${esc(t('entry.new'))}</span>` : ''}</span><span class="ll-t">${esc(pick(v.entry.title))}</span></span></a></li>`).join('')}</ol>
    </div>
  </section>`;
}

function kpiPanel(state, c) {
  const live = state.view.filter((v) => !v.withdrawn && v.tier !== 'unverified');
  const remedied = live.filter((v) => bestOutcome(state.model.annotations.get(v.entry.id)) === 'remedy').length;
  const tiles = [
    { label: t('overview.kpi.entries'), value: c.headline, sub: t('hero.line', { from: c.first }), href: '#/ledger' },
    { label: t('overview.kpi.court'), value: c.byTier.court + c.byTier.acknowledged, sub: t('overview.kpi.courtSub'), href: '#/ledger?tier=court,acknowledged' },
    { label: t('overview.kpi.laws'), value: c.lawsCited, sub: t('overview.kpi.lawsSub', { n: Object.keys(state.data.laws).length }), href: '#/legal' },
    { label: t('overview.kpi.remedy'), value: remedied, sub: t('overview.kpi.remedySub', { n: live.length }), href: '#/ontology/dynamic', cls: 'kpi-warn' },
    { label: t('overview.kpi.field'), value: c.field, sub: t('overview.kpi.fieldSub'), href: '#/field' },
    { label: t('overview.kpi.years'), value: c.years, sub: `${c.first} → ${new Date().getFullYear()}`, href: '#/ontology/dynamic' },
  ];
  return `<section class="panel panel-kpis" data-span="4" data-reveal aria-label="${esc(t('overview.kpi.title'))}">
    <div class="kpis">${tiles.map((k) => `<a class="kpi ${k.cls || ''}" href="${k.href}"><span class="kpi-label mono-label">${esc(k.label)}</span><span class="kpi-n tnum" data-count="${k.value}">${formatNumber(k.value)}</span><span class="kpi-sub">${esc(k.sub)}</span></a>`).join('')}
    <div class="kpi kpi-seal" id="ov-seal"><span class="kpi-label mono-label">${esc(t('overview.kpi.seal'))}</span><span class="kpi-seal-state" id="ov-seal-state">${esc(t('seal.verifying'))}</span><a class="kpi-sub" href="#/integrity">${esc(t('seal.open'))}</a></div>
    </div>
  </section>`;
}

function timelinePanel(state) {
  const years = state.view.map((v) => Number(v.entry.date.slice(0, 4)));
  const from = Math.min(...years);
  const to = new Date().getFullYear();
  const rows = [];
  for (let y = from; y <= to; y++) {
    const items = state.view.filter((v) => !v.withdrawn && Number(v.entry.date.slice(0, 4)) === y);
    rows.push({
      year: y,
      tip: items.map((v) => v.entry.id).join(', '),
      parts: TIERS.map((k) => ({ key: k, value: items.filter((v) => v.tier === k).length, cls: `f-${k}` })),
    });
  }
  return panel({
    title: esc(t('overview.timeline')),
    sub: esc(t('overview.timelineSub')),
    span: '8',
    body: `<div class="chart-wrap" id="ov-cols">${yearColumns(rows, { label: t('overview.timeline') })}</div>
      ${legend(HEADLINE_TIERS.map((k) => ({ swatch: tierGlyph(k), label: t(`tiers.${k}.name`) })))}`,
  });
}

function evidencePanel(state, c) {
  const segs = TIERS.map((k) => ({ key: k, value: c.byTier[k], cls: `s-${k}`, label: t(`tiers.${k}.name`), href: `#/ledger?tier=${k}` }));
  return panel({
    title: esc(t('overview.evidence')),
    sub: esc(t('overview.evidenceSub')),
    span: '4',
    body: `<div class="donut-row">${donut(segs, { center: formatNumber(c.headline + c.field), centerSub: t('overview.records') })}
      <ul class="tier-legend">${TIERS.map((k) => `<li><a href="#/ledger?tier=${k}">${tierGlyph(k)}<span>${esc(t(`tiers.${k}.name`))}</span><span class="tnum">${formatNumber(c.byTier[k])}</span></a></li>`).join('')}</ul></div>
      <p class="small muted">${esc(t('hero.fieldReports', { n: formatNumber(c.field) }))}</p>`,
  });
}

function mapPanel(state) {
  const markers = [];
  for (const v of state.view) {
    if (v.withdrawn) continue;
    const ann = state.model.annotations.get(v.entry.id);
    for (const p of ann.geo.pts) markers.push({ id: v.entry.id, lat: p.lat, lon: p.lon, cls: `t-${v.tier}`, tip: `${v.entry.id} ${pick(v.entry.title)}`, href: `#/ledger/${v.entry.id}` });
  }
  const provinces = new Map();
  for (const v of state.view) for (const p of state.model.annotations.get(v.entry.id).geo.pts) provinces.set(p.province, (provinces.get(p.province) || 0) + 1);
  const top = [...provinces].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return panel({
    title: esc(t('overview.map')),
    sub: esc(t('overview.mapSub')),
    span: '7',
    cls: 'panel-map',
    body: `<div class="map-wrap">${dotMap(markers, { label: t('overview.map') })}</div>
      <ul class="map-legend">${top.map(([p, n]) => `<li><a href="#/ledger?q=${encodeURIComponent(p)}"><span>${esc(p)}</span><span class="tnum mono">${formatNumber(n)}</span></a></li>`).join('')}</ul>`,
  });
}

function rightsPanel(state, c) {
  const items = CATEGORIES.map((k) => ({ label: catName(k), value: c.catCounts[k] || 0, cls: `f-right-${k}`, href: `#/ledger?cat=${k}` }));
  return panel({
    title: esc(t('overview.rights')),
    sub: esc(t('overview.rightsSub')),
    span: '5',
    body: barList(items),
  });
}

function actorsPanel(state) {
  const tally = new Map();
  for (const v of state.view) {
    if (v.withdrawn || v.tier === 'unverified') continue;
    for (const a of state.model.annotations.get(v.entry.id).actors) tally.set(a, (tally.get(a) || 0) + 1);
  }
  const ont = state.data.ontology;
  const items = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, value]) => ({
    label: ont.actors[k]?.short || k,
    sub: t(`ontology.kinds.${ont.actors[k]?.kind || 'unknown'}`),
    value,
    cls: 'f-actor',
    href: `#/ledger?actor=${k}`,
  }));
  return panel({ title: esc(t('overview.actors')), sub: esc(t('overview.actorsSub')), span: '6', body: barList(items) });
}

function accountabilityPanel(state) {
  const live = state.view.filter((v) => !v.withdrawn && v.tier !== 'unverified');
  const by = Object.fromEntries(OUTCOME_CLASSES.map((k) => [k, 0]));
  for (const v of live) by[bestOutcome(state.model.annotations.get(v.entry.id))]++;
  const parts = OUTCOME_CLASSES.map((k) => ({ value: by[k], cls: `oc-${k}`, label: t(`dynamic.classes.${k}`) }));
  return panel({
    title: esc(t('overview.accountability')),
    sub: esc(t('overview.accountabilitySub')),
    span: '6',
    actions: `<a class="btn btn-small btn-quiet" href="#/ontology/dynamic">${esc(t('overview.explore'))}${icon('arrow')}</a>`,
    body: `<p class="big-stat"><span class="tnum" data-count="${by.none}">${formatNumber(by.none)}</span><span>${esc(t('overview.noAccountability', { n: formatNumber(live.length) }))}</span></p>
      ${stackBar(parts, { label: t('overview.accountability') })}
      <ul class="legend legend-cols">${OUTCOME_CLASSES.map((k) => `<li><a href="#/ledger?cls=${k}"><span class="sw oc-${k}"></span><span>${esc(t(`dynamic.classes.${k}`))}</span><span class="lg-n tnum">${formatNumber(by[k])}</span></a></li>`).join('')}</ul>`,
  });
}

function provisionsPanel(state, c) {
  const items = Object.entries(c.lawCounts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, value]) => ({
    label: state.data.laws[k].short,
    sub: state.data.laws[k].jurisdiction === 'ID' ? t('legal.domestic') : t('legal.international'),
    value,
    cls: 'f-provision',
    href: `#/legal/${k}`,
  }));
  return panel({
    title: esc(t('overview.provisions')),
    sub: esc(t('overview.provisionsSub')),
    span: '6',
    actions: `<a class="btn btn-small btn-quiet" href="#/legal">${esc(t('overview.breachMap'))}${icon('arrow')}</a>`,
    body: barList(items),
  });
}

function layersPanel(state) {
  const objs = [...state.model.objects.values()];
  const n = (type) => objs.filter((o) => o.type === type).length;
  const layers = [
    { key: 'semantic', stats: [[t('ontology.types.event'), n('event')], [t('ontology.types.actor'), n('actor')], [t('ontology.types.provision'), n('provision')]] },
    { key: 'kinetic', stats: [[t('ontology.types.action'), n('action')], [t('kinetic.mechanisms'), Object.keys(state.data.ontology.mechanisms).length]] },
    { key: 'dynamic', stats: [[t('ontology.types.outcome'), n('outcome')], [t('dynamic.responses'), state.view.reduce((s, v) => s + state.model.annotations.get(v.entry.id).outcomes.length, 0)]] },
  ];
  return panel({
    title: esc(t('overview.ontology')),
    sub: esc(t('overview.ontologySub')),
    span: '12',
    body: `<div class="layer-cards">${layers.map((l, i) => `<a class="layer-card lc-${l.key}" href="#/ontology/${l.key}">
      <span class="lc-n mono">0${i + 1}</span><span class="lc-name">${esc(t(`ontology.layers.${l.key}.name`))}</span>
      <span class="lc-tag">${esc(t(`ontology.layers.${l.key}.tag`))}</span>
      <span class="lc-stats">${l.stats.map(([k, v]) => `<span><span class="tnum" data-count="${v}">${formatNumber(v)}</span> ${esc(k)}</span>`).join('')}</span>
      <span class="lc-go">${icon('arrow')}</span></a>`).join('')}</div>`,
  });
}

function stripHtml() {
  return `<aside class="strip" id="strip" aria-label="${esc(t('strip.label'))}">
    <p><strong>${esc(t('strip.label'))}</strong> ${esc(t('strip.body'))} <a href="#/about?s=read">${esc(t('strip.more'))}</a></p>
    <button type="button" class="btn btn-small btn-quiet" id="strip-dismiss">${esc(t('strip.dismiss'))}</button>
  </aside>`;
}

export function render(root, ctx) {
  const { state, counts: c } = ctx;
  root.innerHTML = `${stripHtml()}
    <div class="page-head"><div><h1 class="page-title">${esc(t('overview.title'))}</h1><p class="page-lead">${esc(t('hero.tagline'))} ${esc(t('overview.lead'))}</p></div></div>
    <div class="dash">
      ${latestPanel(state)}
      ${kpiPanel(state, c)}
      ${timelinePanel(state)}
      ${evidencePanel(state, c)}
      ${mapPanel(state)}
      ${rightsPanel(state, c)}
      ${accountabilityPanel(state)}
      ${provisionsPanel(state, c)}
      ${layersPanel(state)}
      ${actorsPanel(state)}
      ${panel({ title: esc(t('overview.about')), span: '6', body: `<p>${esc(t('hero.notCourt'))}</p><p class="small muted">${esc(t('overview.aboutBody'))}</p><div class="row-gap"><a class="btn btn-small" href="#/method">${esc(t('nav.method'))}</a><a class="btn btn-small btn-quiet" href="#/about">${esc(t('nav.about'))}</a></div>` })}
    </div>`;
  stagger(root);
  applyGeometry(root);
  countUp(root);
  wireSankey(root);
  // Year columns open the ledger filtered to that year.
  root.querySelector('#ov-cols')?.addEventListener('click', (e) => {
    const col = e.target.closest('[data-year]');
    if (col) ctx.go(`#/ledger?year=${col.dataset.year}`);
  });
  root.querySelector('#strip-dismiss').addEventListener('click', () => {
    document.documentElement.classList.add('strip-off');
    storeSet('andesite.stripDismissed', '1');
  });
  onSeal(root, ctx);
}

export function onSeal(root, ctx) {
  const s = ctx.state.seal;
  const el = root.querySelector('#ov-seal-state');
  const tile = root.querySelector('#ov-seal');
  if (!el || !s) return;
  tile.dataset.state = s.unavailable ? 'pending' : s.ok ? 'ok' : 'broken';
  el.innerHTML = s.unavailable ? esc(t('seal.unavailable'))
    : s.ok ? `<span class="tnum">${s.verified}/${s.total}</span> ${esc(t('overview.verified'))} <code class="hash">${esc(s.head.slice(0, 12))}</code>`
      : esc(t('seal.broken'));
}
