// Legal: which laws the state is recorded as breaching, by whom, and how strong the record is.
// A cell is never a verdict: it carries the strongest evidence level among the entries behind it.
import { t, formatNumber, formatDate } from '../i18n.js';
import { esc, pick, tierGlyph, tierPill, catName, icon, panel, countUp, stagger, applyGeometry, TIERS, HEADLINE_TIERS } from '../util.js';
import { breachMatrix, provisionStats, bindingLevel, instrumentKey } from '../model.js';
import { stackBar, legend, applyDelays } from '../charts.js';
import { lawText, instrumentName, actorName, truncate } from './parts.js';

const BINDING = ['constitution', 'statute', 'treaty', 'declaration'];

function matrixHtml(state) {
  const m = breachMatrix(state.view, state.model, state.data);
  const ont = state.data.ontology;
  const groups = BINDING.map((b) => ({ b, laws: m.laws.filter((k) => bindingLevel(state.data.laws[k]) === b) })).filter((g) => g.laws.length);
  const head1 = groups.map((g) => `<th colspan="${g.laws.length}" class="mx-group mx-${g.b}" scope="colgroup">${esc(t(`legal.bindingLevels.${g.b}`))}</th>`).join('');
  const head2 = groups.flatMap((g) => g.laws).map((k) => `<th scope="col" class="mx-col"><a href="#/legal/${k}" data-tip="${esc(state.data.laws[k].citation)}"><span>${esc(state.data.laws[k].short)}</span></a></th>`).join('');
  const rows = m.actors.map((a, ri) => `<tr>
      <th scope="row" class="mx-row"><a href="#/ledger?actor=${a}"><span class="mx-actor">${esc(ont.actors[a]?.short || a)}</span><span class="mx-kind">${esc(t(`ontology.kinds.${ont.actors[a]?.kind || 'unknown'}`))}</span></a></th>
      ${groups.flatMap((g) => g.laws).map((k, ci) => {
        const c = m.cells.get(`${a}|${k}`);
        if (!c) return `<td class="mx-cell is-empty"><span class="visually-hidden">0</span></td>`;
        const tip = `${actorName(ont, a)} × ${state.data.laws[k].short}: ${t('legal.cellTip', { n: c.ids.length, tier: t(`tiers.${c.tier}.name`) })} (${c.ids.join(', ')})`;
        return `<td class="mx-cell c-${c.tier}" data-delay="${ri + ci}"><a href="#/ledger?actor=${a}&law=${k}" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${tierGlyph(c.tier)}<span class="mx-n tnum">${c.ids.length}</span></a></td>`;
      }).join('')}
    </tr>`).join('');
  return `<div class="table-wrap mx-wrap"><table class="matrix">
    <thead><tr><th class="mx-corner" rowspan="2"><span class="mono-label">${esc(t('legal.actorsDown'))}</span><span class="mono-label">${esc(t('legal.lawsAcross'))}</span></th>${head1}</tr><tr>${head2}</tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function stackHtml(state, c) {
  const laws = state.data.laws;
  const byInst = new Map();
  for (const [k, law] of Object.entries(laws)) {
    const ik = instrumentKey(law);
    const g = byInst.get(ik) || { law, keys: [], binding: bindingLevel(law) };
    g.keys.push(k);
    byInst.set(ik, g);
  }
  return `<ol class="legal-stack">${BINDING.map((b, i) => {
    const insts = [...byInst.values()].filter((g) => g.binding === b);
    if (!insts.length) return '';
    return `<li class="lsk lsk-${b}" data-delay="${i}">
      <div class="lsk-head"><span class="lsk-n mono">L${i + 1}</span><span class="lsk-name">${esc(t(`legal.bindingLevels.${b}`))}</span><span class="lsk-desc small">${esc(t(`legal.bindingDesc.${b}`))}</span></div>
      <ul class="lsk-insts">${insts.map((g) => `<li><span class="lsk-inst">${esc(instrumentName(g.law))}</span>
        <span class="lsk-provs">${g.keys.map((k) => `<a class="chip ty-provision${c.lawCounts[k] ? '' : ' is-quiet'}" href="#/legal/${k}">${esc(laws[k].article)}<span class="tnum">${formatNumber(c.lawCounts[k] || 0)}</span></a>`).join('')}</span></li>`).join('')}</ul>
    </li>`;
  }).join('')}</ol>`;
}

function provisionCards(state) {
  const laws = state.data.laws;
  const ont = state.data.ontology;
  const keys = Object.keys(laws).sort((a, b) => provisionStats(state.view, state.model, b).items.length - provisionStats(state.view, state.model, a).items.length || a.localeCompare(b));
  return `<div class="prov-grid">${keys.map((k) => {
    const law = laws[k];
    const s = provisionStats(state.view, state.model, k);
    return `<a class="prov-card${s.items.length ? '' : ' is-quiet'}" href="#/legal/${k}" data-reveal>
      <span class="pc-top"><span class="mono pc-short">${esc(law.short)}</span>${s.tier ? tierGlyph(s.tier) : ''}</span>
      <span class="pc-inst">${esc(instrumentName(law))}</span>
      <span class="pc-text">${esc(truncate(law.translations[state.lang] || law.text, 150))}</span>
      ${stackBar(HEADLINE_TIERS.map((tk) => ({ value: s.byTier[tk], cls: `s-${tk}`, label: t(`tiers.${tk}.name`) })), { label: law.short })}
      <span class="pc-foot"><span class="tnum">${esc(s.items.length ? t('lawsIndex.count', { n: s.items.length }) : t('lawsIndex.none'))}</span><span>${(ont.provisionRights[k] || []).map((r) => esc(catName(r))).join(' · ')}</span></span>
    </a>`;
  }).join('')}</div>`;
}

function dossier(root, ctx, key) {
  const { state } = ctx;
  const law = state.data.laws[key];
  const ont = state.data.ontology;
  if (!law) {
    root.innerHTML = `<p class="empty">${esc(t('legal.unknown', { id: key }))}</p>`;
    return;
  }
  const s = provisionStats(state.view, state.model, key);
  // Radial: provision at the centre, entries on the inner ring, actors on the outer ring.
  const W = 520;
  const H = 400;
  const cx = W / 2;
  const cy = H / 2;
  const evs = s.items.map((v, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, s.items.length)) * Math.PI * 2;
    return { v, x: cx + Math.cos(a) * 110, y: cy + Math.sin(a) * 92, a };
  });
  const actorPos = new Map();
  s.actors.forEach((k, i) => {
    const a = -Math.PI / 2 + ((i + 0.5) / Math.max(1, s.actors.length)) * Math.PI * 2;
    actorPos.set(k, { x: cx + Math.cos(a) * 215, y: cy + Math.sin(a) * 172 });
  });
  const lines = [];
  evs.forEach((e, i) => {
    lines.push(`<line class="rd-l rd-l1 c-${e.v.tier} anim-draw" pathLength="1" x1="${cx}" y1="${cy}" x2="${e.x.toFixed(1)}" y2="${e.y.toFixed(1)}" data-delay="${i}"/>`);
    for (const a of state.model.annotations.get(e.v.entry.id).actors) {
      const p = actorPos.get(a);
      if (p) lines.push(`<line class="rd-l rd-l2 anim-draw" pathLength="1" x1="${e.x.toFixed(1)}" y1="${e.y.toFixed(1)}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" data-delay="${i + 3}"/>`);
    }
  });
  const radial = `<svg class="radial" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('legal.radialLabel', { law: law.short }))}">
    <ellipse class="rd-orbit" cx="${cx}" cy="${cy}" rx="110" ry="92"/>
    ${lines.join('')}
    <g class="rd-center"><circle cx="${cx}" cy="${cy}" r="30"/><text x="${cx}" y="${cy - 2}" text-anchor="middle" class="rd-c1">§</text><text x="${cx}" y="${cy + 12}" text-anchor="middle" class="rd-c2">${esc(law.article)}</text></g>
    ${evs.map((e, i) => `<g class="rd-ev c-${e.v.tier}" data-href="#/ledger/${e.v.entry.id}" tabindex="0" data-tip="${esc(`${e.v.entry.id} · ${pick(e.v.entry.title)}`)}" data-delay="${i}"><circle cx="${e.x.toFixed(1)}" cy="${e.y.toFixed(1)}" r="9"/><text x="${e.x.toFixed(1)}" y="${(e.y + 3).toFixed(1)}" text-anchor="middle">${esc(e.v.entry.id.slice(4))}</text></g>`).join('')}
    ${[...actorPos].map(([k, p], i) => `<g class="rd-actor" data-href="#/ledger?actor=${k}" tabindex="0" data-tip="${esc(actorName(ont, k))}" data-delay="${i + 4}"><rect x="${(p.x - 46).toFixed(1)}" y="${(p.y - 10).toFixed(1)}" width="92" height="20" rx="2"/><text x="${p.x.toFixed(1)}" y="${(p.y + 4).toFixed(1)}" text-anchor="middle">${esc(truncate(ont.actors[k]?.short || k, 16))}</text></g>`).join('')}
  </svg>`;

  const list = s.items.slice().sort((a, b) => b.entry.date.localeCompare(a.entry.date)).map((v) => {
    const pin = v.entry.laws.find((l) => l.law === key)?.pinpoint;
    return `<li><a class="lrow t-${v.tier}" href="#/ledger/${v.entry.id}"><span class="lr-glyph">${tierGlyph(v.tier)}</span><span class="lr-main">
      <span class="lr-top"><span class="mono lr-id">${v.entry.id}</span><time class="mono">${esc(formatDate(v.entry.date, v.entry.datePrecision))}</time>${pin ? `<span class="pill mono">${esc(pin)}</span>` : ''}</span>
      <span class="lr-title">${esc(pick(v.entry.title))}</span>
      <span class="lr-meta">${esc(state.model.annotations.get(v.entry.id).actors.map((a) => ont.actors[a]?.short || a).join(', '))}</span></span></a></li>`;
  }).join('');

  root.insertAdjacentHTML('beforeend', `<div class="page-head">
      <div><a class="btn btn-small btn-quiet back-link" href="#/legal">${icon('back')}<span>${esc(t('legal.backAll'))}</span></a>
      <p class="eyebrow mono">${esc(t(`legal.bindingLevels.${bindingLevel(law)}`))} · ${esc(law.jurisdiction === 'ID' ? t('legal.domestic') : t('legal.international'))}</p>
      <h1 class="page-title">${esc(law.short)}</h1><p class="page-lead">${esc(law.citation)}</p></div>
    </div>
    <div class="dash">
      ${panel({ span: '5', title: esc(t('legal.text')), body: `<div class="law-body">${lawText(law)}</div>
        <p class="mono-label">${esc(t('legal.protects'))}</p><div class="row-gap">${(ont.provisionRights[key] || []).map((r) => `<a class="chip ty-right" href="#/ledger?cat=${r}">${esc(catName(r))}</a>`).join('')}</div>` })}
      ${panel({ span: '7', title: esc(t('legal.network')), sub: esc(t('legal.networkSub')), body: s.items.length ? `<div class="chart-wrap radial-wrap">${radial}</div>` : `<p class="empty">${esc(t('lawsIndex.none'))}</p>` })}
      ${panel({ span: '5', title: esc(t('legal.strength')), sub: esc(t('legal.strengthSub')), body: `
        <p class="big-stat"><span class="tnum" data-count="${s.items.length}">${formatNumber(s.items.length)}</span><span>${esc(t('legal.recordedActs'))}</span></p>
        ${stackBar(TIERS.map((k) => ({ value: s.byTier[k], cls: `s-${k}`, label: t(`tiers.${k}.name`) })), { label: t('legal.strength') })}
        ${legend(TIERS.filter((k) => s.byTier[k]).map((k) => ({ swatch: tierGlyph(k), label: t(`tiers.${k}.name`), value: s.byTier[k] })))}
        ${s.byTier.court ? `<p class="note">${esc(t('legal.courtNote'))}</p>` : ''}
        <a class="btn btn-small" href="#/ledger?law=${key}">${esc(t('lawsIndex.filter'))}${icon('arrow')}</a>` })}
      ${panel({ span: '7', title: esc(t('legal.entries')), body: `<ul class="lrows-flat">${list || `<li class="empty">${esc(t('lawsIndex.none'))}</li>`}</ul>` })}
    </div>`);
}

export function render(root, ctx) {
  const { state, counts: c } = ctx;
  if (state.route.id) {
    root.innerHTML = '';
    dossier(root, ctx, state.route.id);
  } else {
    const m = breachMatrix(state.view, state.model, state.data);
    const engaged = Object.keys(c.lawCounts).length;
    const courtCells = [...m.cells.values()].filter((x) => x.tier === 'court').length;
    const ackCells = [...m.cells.values()].filter((x) => x.tier === 'acknowledged').length;
    root.innerHTML = `<div class="page-head"><div><p class="eyebrow mono">${esc(t('legal.eyebrow'))}</p><h1 class="page-title">${esc(t('legal.title'))}</h1>
      <p class="page-lead">${esc(t('legal.lead'))}</p></div></div>
      <div class="dash">
        <section class="panel" data-span="12" data-reveal>
          <div class="panel-body"><div class="kpis kpis-4">
            <div class="kpi"><span class="kpi-label mono-label">${esc(t('legal.kpi.engaged'))}</span><span class="kpi-n tnum" data-count="${engaged}">${engaged}</span><span class="kpi-sub">${esc(t('legal.kpi.engagedSub', { n: Object.keys(state.data.laws).length }))}</span></div>
            <div class="kpi"><span class="kpi-label mono-label">${esc(t('legal.kpi.pairs'))}</span><span class="kpi-n tnum" data-count="${m.cells.size}">${m.cells.size}</span><span class="kpi-sub">${esc(t('legal.kpi.pairsSub'))}</span></div>
            <div class="kpi kpi-court"><span class="kpi-label mono-label">${tierGlyph('court')}${esc(t('legal.kpi.court'))}</span><span class="kpi-n tnum" data-count="${courtCells}">${courtCells}</span><span class="kpi-sub">${esc(t('legal.kpi.courtSub'))}</span></div>
            <div class="kpi"><span class="kpi-label mono-label">${tierGlyph('acknowledged')}${esc(t('legal.kpi.ack'))}</span><span class="kpi-n tnum" data-count="${ackCells}">${ackCells}</span><span class="kpi-sub">${esc(t('legal.kpi.ackSub'))}</span></div>
          </div></div>
        </section>
        ${panel({ span: '12', cls: 'panel-matrix', title: esc(t('legal.matrix')), sub: esc(t('legal.matrixSub')), body: `${matrixHtml(state)}
          ${legend(HEADLINE_TIERS.map((k) => ({ swatch: tierGlyph(k), label: t(`tiers.${k}.name`) })))}
          <p class="note">${esc(t('legal.matrixNote'))}</p>` })}
        ${panel({ span: '5', title: esc(t('legal.stack')), sub: esc(t('legal.stackSub')), body: stackHtml(state, c) })}
        ${panel({ span: '7', title: esc(t('legal.library')), sub: esc(t('lawsIndex.intro')), body: provisionCards({ ...state, lang: ctx.lang || document.documentElement.lang }) })}
      </div>`;
  }
  stagger(root);
  applyGeometry(root);
  applyDelays(root);
  countUp(root);
}
