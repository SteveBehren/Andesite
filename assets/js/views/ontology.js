// Ontology: the fusion layer. Three views on one model.
//   Semantic: what exists. Objects, their properties and the links between them.
//   Kinetic:  what was done. Actions by state actors and the mechanisms they used,
//             plus the actions that change the record itself.
//   Dynamic:  what happened next. Outcomes through time, and the ledger replayed year by year.
import { t, formatNumber, formatDate } from '../i18n.js';
import { esc, pick, tierGlyph, catName, icon, panel, countUp, stagger, applyGeometry, TIERS, HEADLINE_TIERS, OUTCOME_CLASSES, reducedMotion } from '../util.js';
import { neighbours, bestOutcome, flows, parseDate } from '../model.js';
import { sankey, wireSankey, barList, stackBar, legend, sparkline, applyDelays } from '../charts.js';
import { createGraph } from '../graph.js';
import { dotMap } from '../map.js';
import { actorName, actionName, outcomeName, objectLabel, objectHref, truncate } from './parts.js';

const TYPE_ORDER = ['event', 'actor', 'action', 'provision', 'instrument', 'right', 'place', 'outcome', 'source'];
const LAYER_OF = { event: 'semantic', actor: 'semantic', provision: 'semantic', instrument: 'semantic', right: 'semantic', place: 'semantic', source: 'semantic', action: 'kinetic', outcome: 'dynamic' };
const SHAPE = { event: null, actor: 'hex', action: 'diamond', provision: 'square', instrument: 'square', right: 'ring', place: 'circle', outcome: 'triangle', source: 'circle' };
const TIER_SHAPE = { court: 'square', acknowledged: 'diamond', documented: 'circle', alleged: 'triangle', unverified: 'ring' };

function layerStrip(active) {
  return `<div class="layer-strip" data-reveal>${['semantic', 'kinetic', 'dynamic'].map((k, i) => `<a class="ls-item ls-${k}" href="#/ontology/${k}" ${k === active ? 'aria-current="page"' : ''}>
      <span class="ls-n mono">0${i + 1}</span>
      <span class="ls-text"><span class="ls-name">${esc(t(`ontology.layers.${k}.name`))}</span><span class="ls-tag">${esc(t(`ontology.layers.${k}.tag`))}</span></span>
      <span class="ls-bar" aria-hidden="true"></span></a>`).join('')}
  </div>`;
}

function head(sub) {
  return `<div class="page-head">
    <div><p class="eyebrow mono">${esc(t('ontology.eyebrow'))}</p><h1 class="page-title">${esc(t('ontology.title'))}</h1>
    <p class="page-lead">${esc(t('ontology.lead'))}</p></div>
  </div>${layerStrip(sub)}
  <p class="layer-desc" data-reveal>${esc(t(`ontology.layers.${sub}.desc`))}</p>`;
}

// ---------------------------------------------------------------- Semantic

function graphNodes(model, show) {
  const out = [];
  for (const o of model.objects.values()) {
    if (!show.types.has(o.type)) continue;
    const label = objectLabel(model, o);
    const r = o.type === 'event' ? 7 : o.type === 'actor' ? 6 + Math.min(5, o.degree * 0.35) : o.type === 'instrument' ? 7 : o.type === 'right' ? 8 : o.type === 'source' ? 3 : o.type === 'place' ? 4.5 : 5.5;
    out.push({
      id: o.id,
      type: o.type,
      group: o.type,
      r,
      shape: o.type === 'event' ? TIER_SHAPE[o.tier] : SHAPE[o.type],
      cls: `ty-${o.type}${o.tier ? ` t-${o.tier}` : ''}${o.cls ? ` oc-${o.cls}` : ''}`,
      label: truncate(label, 24),
      aria: `${t(`ontology.types.${o.type}`)}: ${label}`,
    });
  }
  return out;
}

function inspector(model, state, id) {
  if (!id || !model.objects.has(id)) {
    const objs = [...model.objects.values()];
    return `<div class="insp-empty">${icon('ontology', 'ico-xl')}<p>${esc(t('semantic.pick'))}</p>
      <dl class="props"><div><dt>${esc(t('semantic.objects'))}</dt><dd class="tnum">${formatNumber(objs.length)}</dd></div>
      <div><dt>${esc(t('semantic.linksN'))}</dt><dd class="tnum">${formatNumber(model.links.length)}</dd></div>
      <div><dt>${esc(t('semantic.types'))}</dt><dd class="tnum">${formatNumber(new Set(objs.map((o) => o.type)).size)}</dd></div></dl>
      <p class="small muted">${esc(t('semantic.hint'))}</p></div>`;
  }
  const o = model.objects.get(id);
  const ont = state.data.ontology;
  const props = [];
  if (o.type === 'event') {
    const e = o.v.entry;
    props.push([t('entry.evidence'), `${tierGlyph(o.tier)} ${esc(t(`tiers.${o.tier}.name`))}`], [t('entry.date'), `<span class="mono">${esc(e.date)}</span>`], [t('entry.place'), esc(e.location.place)]);
  } else if (o.type === 'actor') {
    props.push([t('semantic.kind'), esc(t(`ontology.kinds.${o.kind}`))], [t('semantic.fullName'), esc(o.title)]);
    if (o.actor.parent) props.push([t('semantic.parent'), esc(actorName(ont, o.actor.parent))]);
    if (o.actor.note) props.push([t('semantic.note'), esc(pick(o.actor.note))]);
  } else if (o.type === 'provision' || o.type === 'instrument') {
    props.push([t('legal.binding'), esc(t(`legal.bindingLevels.${o.binding}`))], [t('legal.jurisdiction'), esc(o.law.jurisdiction === 'ID' ? t('legal.domestic') : t('legal.international'))]);
    if (o.type === 'provision') props.push([t('legal.citation'), esc(o.title)]);
  } else if (o.type === 'action') {
    props.push([t('kinetic.mechanism'), esc(pick(ont.mechanisms[o.mechanism]))]);
  } else if (o.type === 'outcome') {
    props.push([t('dynamic.class'), `<span class="sw oc-${o.cls}"></span> ${esc(t(`dynamic.classes.${o.cls}`))}`]);
  } else if (o.type === 'source') {
    props.push([t('semantic.host'), `<span class="mono">${esc(o.host)}</span>`], [t('semantic.sourceType'), esc(t(`entry.sourceTypes.${o.sourceType}`))]);
  }
  props.push([t('semantic.degree'), `<span class="tnum">${formatNumber(o.degree)}</span>`]);
  const nb = neighbours(model, id).filter((n) => model.objects.has(n.id));
  const byType = new Map();
  for (const n of nb) {
    const k = n.type;
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k).push(n);
  }
  return `<div class="insp">
    <p class="insp-type mono-label"><span class="type-dot ty-${o.type}${o.tier ? ` t-${o.tier}` : ''}"></span>${esc(t(`ontology.types.${o.type}`))} · <span class="mono">${esc(o.id)}</span></p>
    <h3 class="insp-title">${esc(o.type === 'event' ? o.title : objectLabel(model, o))}</h3>
    <dl class="props">${props.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <p class="mono-label">${esc(t('semantic.linked', { n: nb.length }))}</p>
    <dl class="linkgroups">${[...byType].map(([type, items]) => `<div><dt class="mono-label lk-label lk-${type}">${esc(t(`ontology.links.${type}`))}</dt><dd>${items.slice(0, 30).map((n) => {
      const other = model.objects.get(n.id);
      return `<button type="button" class="chip ty-${other.type}" data-select="${esc(n.id)}">${esc(truncate(objectLabel(model, other), 28))}</button>`;
    }).join('')}${items.length > 30 ? `<span class="muted small">+${items.length - 30}</span>` : ''}</dd></div>`).join('')}</dl>
    <a class="btn btn-small" href="${esc(objectHref(o))}">${esc(t('semantic.open'))}${icon('arrow')}</a>
  </div>`;
}

function linkTable(model) {
  const types = new Map();
  for (const l of model.links) {
    const s = model.objects.get(l.source)?.type;
    const tt = model.objects.get(l.target)?.type;
    if (!s || !tt) continue;
    const k = `${l.type}|${s}|${tt}`;
    types.set(k, (types.get(k) || 0) + 1);
  }
  const rows = [...types].sort((a, b) => b[1] - a[1]);
  return `<div class="table-wrap"><table class="dtable">
    <thead><tr><th>${esc(t('semantic.linkType'))}</th><th>${esc(t('semantic.from'))}</th><th></th><th>${esc(t('semantic.to'))}</th><th class="num">${esc(t('semantic.count'))}</th></tr></thead>
    <tbody>${rows.map(([k, n]) => {
      const [type, s, tt] = k.split('|');
      return `<tr><td><span class="lk-label lk-${type} mono">${esc(type)}</span><span class="small muted"> ${esc(t(`ontology.links.${type}`))}</span></td><td><span class="type-dot ty-${s}"></span>${esc(t(`ontology.types.${s}`))}</td><td class="muted">→</td><td><span class="type-dot ty-${tt}"></span>${esc(t(`ontology.types.${tt}`))}</td><td class="num tnum">${formatNumber(n)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function renderSemantic(root, ctx) {
  const { state } = ctx;
  const model = state.model;
  const objs = [...model.objects.values()];
  const typeCounts = TYPE_ORDER.map((ty) => [ty, objs.filter((o) => o.type === ty).length]).filter(([, n]) => n);
  // Actions (kinetic), outcomes (dynamic) and sources start hidden; the layer buttons fuse them in.
  const LAYER_TYPE = { kinetic: 'action', dynamic: 'outcome', source: 'source' };
  const show = { types: new Set(TYPE_ORDER.filter((ty) => !Object.values(LAYER_TYPE).includes(ty))) };
  const focus = state.route.params.get('focus');
  let selected = focus && model.objects.has(focus) ? focus : null;
  if (selected) show.types.add(model.objects.get(selected).type);

  root.insertAdjacentHTML('beforeend', `<div class="sem-grid">
    <section class="panel sem-types" data-reveal>
      <header class="panel-head"><div class="panel-titles"><h2 class="panel-title">${esc(t('semantic.catalog'))}</h2><p class="panel-sub">${esc(t('semantic.catalogSub'))}</p></div></header>
      <div class="panel-body"><ul class="type-list">${typeCounts.map(([ty, n]) => `<li><label class="type-row">
        <input type="checkbox" data-type="${ty}" ${show.types.has(ty) ? 'checked' : ''}><span class="type-dot ty-${ty}"></span><span class="tr-name">${esc(t(`ontology.types.${ty}`))}</span>
        <span class="tr-layer mono">${esc(t(`ontology.layers.${LAYER_OF[ty]}.short`))}</span><span class="tnum tr-n">${formatNumber(n)}</span></label></li>`).join('')}</ul>
        <p class="mono-label">${esc(t('semantic.layersLabel'))}</p>
        <div class="seg seg-wrap" role="group">
          <button type="button" data-layer="kinetic" aria-pressed="${show.types.has('action')}">${esc(t('ontology.layers.kinetic.name'))}</button>
          <button type="button" data-layer="dynamic" aria-pressed="${show.types.has('outcome')}">${esc(t('ontology.layers.dynamic.name'))}</button>
          <button type="button" data-layer="source" aria-pressed="${show.types.has('source')}">${esc(t('ontology.types.source'))}</button>
        </div>
        <p class="small muted">${esc(t('semantic.fusionNote'))}</p>
      </div>
    </section>
    <section class="panel sem-graph" data-reveal>
      <header class="panel-head"><div class="panel-titles"><h2 class="panel-title">${esc(t('semantic.graph'))}</h2><p class="panel-sub" id="sem-count"></p></div>
        <div class="panel-actions graph-tools">
          <button type="button" class="tb-btn icon-only" data-g="in" aria-label="${esc(t('semantic.zoomIn'))}" data-tip="${esc(t('semantic.zoomIn'))}">${icon('plus')}</button>
          <button type="button" class="tb-btn icon-only" data-g="out" aria-label="${esc(t('semantic.zoomOut'))}" data-tip="${esc(t('semantic.zoomOut'))}">${icon('minus')}</button>
          <button type="button" class="tb-btn icon-only" data-g="fit" aria-label="${esc(t('semantic.fit'))}" data-tip="${esc(t('semantic.fit'))}">${icon('fit')}</button>
          <button type="button" class="tb-btn icon-only" data-g="shake" aria-label="${esc(t('semantic.relayout'))}" data-tip="${esc(t('semantic.relayout'))}">${icon('reset')}</button>
        </div></header>
      <div class="panel-body graph-body"><div class="graph-host" id="graph-host"></div>
        <p class="graph-hint small muted">${esc(t('semantic.gestures'))}</p></div>
    </section>
    <section class="panel sem-insp" data-reveal aria-live="polite">
      <header class="panel-head"><div class="panel-titles"><h2 class="panel-title">${esc(t('semantic.inspector'))}</h2></div></header>
      <div class="panel-body" id="sem-insp"></div>
    </section>
  </div>
  ${panel({ title: esc(t('semantic.linkTypes')), sub: esc(t('semantic.linkTypesSub')), body: linkTable(model) })}`);

  let graph = null;
  const host = root.querySelector('#graph-host');
  const insp = root.querySelector('#sem-insp');
  const renderInsp = () => { insp.innerHTML = inspector(model, state, selected); };
  const build = () => {
    graph?.destroy();
    const nodes = graphNodes(model, show);
    const ids = new Set(nodes.map((nd) => nd.id));
    const links = model.links.filter((l) => ids.has(l.source) && ids.has(l.target));
    root.querySelector('#sem-count').textContent = t('semantic.count2', { n: formatNumber(nodes.length), l: formatNumber(links.length) });
    graph = createGraph(host, {
      nodes,
      links,
      charge: nodes.length > 90 ? 260 : 420,
      linkLength: (e) => (e.type === 'documented_by' ? 40 : e.type === 'part_of' || e.type === 'unit_of' ? 34 : e.type === 'protects' ? 70 : 62),
      labelAlways: (nd) => ['actor', 'right', 'instrument'].includes(nd.type),
      onSelect: (id) => { selected = id; renderInsp(); },
    });
    if (selected && ids.has(selected)) graph.select(selected);
  };
  build();
  renderInsp();

  // Keep the type checkboxes and the layer buttons in step.
  const syncControls = () => {
    for (const box of root.querySelectorAll('[data-type]')) box.checked = show.types.has(box.dataset.type);
    for (const [layer, ty] of Object.entries(LAYER_TYPE)) root.querySelector(`[data-layer="${layer}"]`)?.setAttribute('aria-pressed', String(show.types.has(ty)));
  };
  root.addEventListener('change', (e) => {
    const box = e.target.closest('[data-type]');
    if (!box) return;
    if (box.checked) show.types.add(box.dataset.type); else show.types.delete(box.dataset.type);
    syncControls();
    build();
  });
  root.addEventListener('click', (e) => {
    const layer = e.target.closest('[data-layer]');
    if (layer) {
      const ty = LAYER_TYPE[layer.dataset.layer];
      if (show.types.has(ty)) show.types.delete(ty); else show.types.add(ty);
      syncControls();
      build();
      return;
    }
    const g = e.target.closest('[data-g]');
    if (g && graph) {
      ({ in: graph.zoomIn, out: graph.zoomOut, fit: graph.fit, shake: graph.reheat })[g.dataset.g]();
      return;
    }
    const sel = e.target.closest('[data-select]');
    if (sel) {
      selected = sel.dataset.select;
      const ty = model.objects.get(selected)?.type;
      if (ty && !show.types.has(ty)) {
        show.types.add(ty);
        syncControls();
        build();
      } else graph.select(selected);
      renderInsp();
    }
  });
  return () => graph?.destroy();
}

// ---------------------------------------------------------------- Kinetic

function renderKinetic(root, ctx) {
  const { state } = ctx;
  const ont = state.data.ontology;
  const model = state.model;
  const live = state.view.filter((v) => !v.withdrawn && v.tier !== 'unverified');
  const actsTotal = live.reduce((s, v) => s + model.annotations.get(v.entry.id).actions.length, 0);
  const byAction = new Map();
  const byMech = new Map();
  const pairsA = [];
  const pairsB = [];
  for (const v of live) {
    const ann = model.annotations.get(v.entry.id);
    for (const a of ann.actions) {
      const list = byAction.get(a) || [];
      list.push(v);
      byAction.set(a, list);
      const m = ont.actions[a].mechanism;
      byMech.set(m, (byMech.get(m) || 0) + 1);
      for (const actor of ann.actors) pairsA.push({ from: `actor:${actor}`, to: `action:${a}`, id: v.entry.id });
      for (const l of v.entry.laws) pairsB.push({ from: `action:${a}`, to: `provision:${l.law}`, id: v.entry.id });
    }
  }
  const linksA = flows(pairsA);
  const linksB = flows(pairsB);
  const actorsCol = [...new Set(linksA.map((l) => l.from))].map((id) => ({ id, label: ont.actors[id.split(':')[1]]?.short || id, cls: 'f-actor' }));
  const actionsCol = [...byAction.keys()].sort((a, b) => byAction.get(b).length - byAction.get(a).length).map((a) => ({ id: `action:${a}`, label: actionName(ont, a), cls: `f-mech-${ont.actions[a].mechanism}` }));
  const provCol = [...new Set(linksB.map((l) => l.to))].map((id) => ({ id, label: state.data.laws[id.split(':')[1]].short, cls: 'f-provision' }));
  const sortByFlow = (col, links, key) => col.sort((x, y) => links.filter((l) => l[key] === y.id).reduce((s, l) => s + l.value, 0) - links.filter((l) => l[key] === x.id).reduce((s, l) => s + l.value, 0));
  sortByFlow(actorsCol, linksA, 'from');
  sortByFlow(provCol, linksB, 'to');

  const years = live.map((v) => Number(v.entry.date.slice(0, 4)));
  const y0 = Math.min(...years);
  const y1 = new Date().getFullYear();
  const yearSeries = (list) => Array.from({ length: y1 - y0 + 1 }, (_, i) => list.filter((v) => Number(v.entry.date.slice(0, 4)) === y0 + i).length);

  const cards = [...byAction].sort((a, b) => b[1].length - a[1].length).map(([a, list], i) => {
    const mech = ont.actions[a].mechanism;
    const actors = [...new Set(list.flatMap((v) => model.annotations.get(v.entry.id).actors))];
    return `<article class="act-card" data-reveal>
      <header><span class="mech-tag m-${mech} mono">${esc(pick(ont.mechanisms[mech]))}</span><span class="act-n tnum" data-count="${list.length}">${formatNumber(list.length)}</span></header>
      <h3 class="act-name">${esc(actionName(ont, a))}</h3>
      ${sparkline(yearSeries(list), { cls: `m-${mech}` })}
      <p class="act-actors small">${actors.map((k) => esc(ont.actors[k]?.short || k)).join(' · ')}</p>
      <div class="act-ids">${list.map((v) => `<a class="chip mono t-${v.tier}" href="#/ledger/${v.entry.id}">${tierGlyph(v.tier)}${v.entry.id}</a>`).join('')}</div>
      <a class="act-more small" href="#/ledger?action=${a}">${esc(t('kinetic.openFiltered'))}${icon('arrow')}</a>
    </article>`;
  }).join('');

  const log = live.slice().sort((a, b) => b.entry.date.localeCompare(a.entry.date)).map((v) => {
    const ann = model.annotations.get(v.entry.id);
    return `<tr data-href="#/ledger/${v.entry.id}" tabindex="0">
      <td class="mono">${esc(v.entry.date)}</td>
      <td><a class="mono" href="#/ledger/${v.entry.id}">${v.entry.id}</a></td>
      <td>${ann.actors.map((a) => `<span class="chip chip-static ty-actor">${esc(ont.actors[a]?.short || a)}</span>`).join('')}</td>
      <td>${ann.actions.length ? ann.actions.map((a) => `<span class="mech-dot m-${ont.actions[a].mechanism}"></span>${esc(actionName(ont, a))}`).join('<br>') : `<span class="muted">${esc(t('ontology.pending'))}</span>`}</td>
      <td class="mono small">${v.entry.laws.map((l) => esc(state.data.laws[l.law]?.short || l.law)).join('<br>')}</td>
    </tr>`;
  }).join('');

  const sealed = state.data.lock.length;
  const automated = state.data.entries.filter((e) => e.intake === 'automated').length;
  const sourcesN = state.data.entries.reduce((s, e) => s + e.sources.length, 0);
  const pipeline = [
    { key: 'observe', n: sourcesN },
    { key: 'propose', n: automated },
    { key: 'gate', n: state.data.entries.length },
    { key: 'seal', n: sealed },
    { key: 'amend', n: state.data.amendments.length },
  ];

  root.insertAdjacentHTML('beforeend', `<div class="dash">
    ${panel({ span: '4', title: esc(t('kinetic.summary')), body: `<div class="kpis kpis-3">
      <div class="kpi"><span class="kpi-label mono-label">${esc(t('kinetic.actionTypes'))}</span><span class="kpi-n tnum" data-count="${byAction.size}">${byAction.size}</span></div>
      <div class="kpi"><span class="kpi-label mono-label">${esc(t('kinetic.acts'))}</span><span class="kpi-n tnum" data-count="${actsTotal}">${actsTotal}</span></div>
      <div class="kpi"><span class="kpi-label mono-label">${esc(t('kinetic.mechanisms'))}</span><span class="kpi-n tnum" data-count="${byMech.size}">${byMech.size}</span></div></div>
      ${stackBar([...byMech].map(([m, v]) => ({ value: v, cls: `m-${m}`, label: pick(ont.mechanisms[m]) })), { label: t('kinetic.mechanisms') })}
      ${legend([...byMech].map(([m, v]) => ({ cls: `m-${m}`, label: pick(ont.mechanisms[m]), value: v })))}` })}
    ${panel({ span: '8', title: esc(t('kinetic.pipeline')), sub: esc(t('kinetic.pipelineSub')), body: `<ol class="pipeline">${pipeline.map((p, i) => `<li class="pl-step" data-delay="${i}">
        <span class="pl-n mono">0${i + 1}</span><span class="pl-name">${esc(t(`kinetic.steps.${p.key}.name`))}</span>
        <span class="pl-count tnum" data-count="${p.n}">${formatNumber(p.n)}</span><span class="pl-desc small">${esc(t(`kinetic.steps.${p.key}.desc`))}</span>
        ${i < pipeline.length - 1 ? '<span class="pl-wire" aria-hidden="true"><span class="pl-packet"></span></span>' : ''}</li>`).join('')}</ol>` })}
    ${panel({ span: '12', title: esc(t('kinetic.flow')), sub: esc(t('kinetic.flowSub')), cls: 'panel-sankey', body: `<div class="sankey-heads mono-label"><span>${esc(t('ontology.types.actor'))}</span><span>${esc(t('ontology.types.action'))}</span><span>${esc(t('ontology.types.provision'))}</span></div>
      <div class="chart-wrap scroll-x">${sankey([actorsCol, actionsCol, provCol], [...linksA, ...linksB], { width: 1200, height: Math.max(380, provCol.length * 36), label: t('kinetic.flow') })}</div>
      <p class="small muted">${esc(t('kinetic.flowNote'))}</p>` })}
  </div>
  <h2 class="section-title" data-reveal>${esc(t('kinetic.catalog'))}</h2>
  <div class="act-grid">${cards}</div>
  ${panel({ title: esc(t('kinetic.log')), sub: esc(t('kinetic.logSub')), body: `<div class="table-wrap"><table class="dtable dtable-click"><thead><tr><th>${esc(t('entry.date'))}</th><th>ID</th><th>${esc(t('ontology.types.actor'))}</th><th>${esc(t('ontology.types.action'))}</th><th>${esc(t('ontology.types.provision'))}</th></tr></thead><tbody>${log}</tbody></table></div>` })}`);
  wireSankey(root);
  root.querySelector('.panel-sankey .sankey')?.addEventListener('click', (e) => {
    const node = e.target.closest('.sk-node');
    if (!node) return;
    const [type, key] = node.dataset.node.split(':');
    ctx.go(type === 'provision' ? `#/legal/${key}` : `#/ledger?${type}=${key}`);
  });
}

// ---------------------------------------------------------------- Dynamic

function cumulativeChart(state, y0, y1) {
  const W = 640;
  const H = 200;
  const pad = { l: 30, r: 10, t: 12, b: 22 };
  const live = state.view.filter((v) => !v.withdrawn && v.tier !== 'unverified');
  const series = HEADLINE_TIERS.map((k) => ({ k, vals: [] }));
  const total = [];
  for (let y = y0; y <= y1; y++) {
    let acc = 0;
    for (const s of series) {
      const n = live.filter((v) => v.tier === s.k && Number(v.entry.date.slice(0, 4)) <= y).length;
      s.vals.push(n);
      acc += n;
    }
    total.push(acc);
  }
  const max = Math.max(1, ...total);
  const x = (i) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, y1 - y0);
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  // Stacked areas, bottom up.
  const base = new Array(total.length).fill(0);
  const areas = series.map((s) => {
    const top = s.vals.map((v, i) => base[i] + v);
    const d = `M${x(0)},${y(base[0])} ` + top.map((v, i) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + ' ' + base.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ') + 'Z';
    top.forEach((v, i) => { base[i] = v; });
    return `<path class="cum-area f-${s.k}" d="${d}"/>`;
  }).join('');
  const line = `<path class="cum-line anim-draw" pathLength="1" d="M${total.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}"/>`;
  const ticks = [];
  const every = Math.ceil((y1 - y0 + 1) / 8);
  for (let yy = y0; yy <= y1; yy += every) ticks.push(`<text class="axis" x="${x(yy - y0).toFixed(1)}" y="${H - 6}" text-anchor="middle">${yy}</text>`);
  const grid = [0, Math.round(max / 2), max].map((v) => `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join('');
  return {
    svg: `<svg class="cum" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('dynamic.cumulative'))}">${grid}${areas}${line}${ticks.join('')}
      <g class="cum-cursor" id="cum-cursor"><line x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}"/><circle r="3.5" cy="0"/></g></svg>`,
    pos: (yy) => ({ x: x(yy - y0), y: y(total[yy - y0]) }),
    W,
  };
}

function renderDynamic(root, ctx) {
  const { state } = ctx;
  const ont = state.data.ontology;
  const model = state.model;
  const live = state.view.filter((v) => !v.withdrawn && v.tier !== 'unverified');
  const y0 = Math.min(...state.view.map((v) => Number(v.entry.date.slice(0, 4))));
  const y1 = new Date().getFullYear();
  const cum = cumulativeChart(state, y0, y1);

  // Map markers carry their year so the scrubber can reveal them.
  const markers = [];
  for (const v of live) {
    for (const p of model.annotations.get(v.entry.id).geo.pts) markers.push({ id: v.entry.id, lat: p.lat, lon: p.lon, cls: `t-${v.tier}`, tip: `${v.entry.id} ${pick(v.entry.title)}`, href: `#/ledger/${v.entry.id}` });
  }

  // Accountability flow: evidence level → mechanism → best outcome class.
  const pairs1 = [];
  const pairs2 = [];
  for (const v of live) {
    const ann = model.annotations.get(v.entry.id);
    const mechs = [...new Set(ann.actions.map((a) => ont.actions[a].mechanism))];
    const best = bestOutcome(ann);
    const share = 1 / Math.max(1, mechs.length);
    for (const m of mechs.length ? mechs : ['unclassified']) {
      pairs1.push({ from: `tier:${v.tier}`, to: `mech:${m}`, value: share, id: v.entry.id });
      pairs2.push({ from: `mech:${m}`, to: `cls:${best}`, value: share, id: v.entry.id });
    }
  }
  const l1 = flows(pairs1);
  const l2 = flows(pairs2);
  const col1 = HEADLINE_TIERS.filter((k) => l1.some((l) => l.from === `tier:${k}`)).map((k) => ({ id: `tier:${k}`, label: t(`tiers.${k}.name`), cls: `f-${k}` }));
  const col2 = [...new Set(l1.map((l) => l.to))].map((id) => {
    const m = id.split(':')[1];
    return { id, label: ont.mechanisms[m] ? pick(ont.mechanisms[m]) : t('ontology.pending'), cls: `f-mech-${m}` };
  });
  const col3 = OUTCOME_CLASSES.filter((k) => l2.some((l) => l.to === `cls:${k}`)).map((k) => ({ id: `cls:${k}`, label: t(`dynamic.classes.${k}`), cls: `oc-${k}` }));

  // Response lanes: every record on one time axis, from the act to each recorded response.
  const t0 = Date.UTC(y0, 0, 1);
  const t1 = Date.UTC(y1, 11, 31);
  const px = (ms) => (((ms - t0) / (t1 - t0)) * 100).toFixed(2);
  const lanes = live.slice().sort((a, b) => a.entry.date.localeCompare(b.entry.date)).map((v, i) => {
    const ann = model.annotations.get(v.entry.id);
    const start = parseDate(v.entry.date);
    const end = ann.outcomes.length ? Math.max(...ann.outcomes.map((o) => o.when)) : start;
    const first = ann.outcomes.filter((o) => o.dated).sort((a, b) => a.when - b.when)[0];
    const days = first ? Math.round((first.when - start) / 86400000) : null;
    return `<li class="lane" data-delay="${i}">
      <a class="lane-id mono" href="#/ledger/${v.entry.id}">${tierGlyph(v.tier)}${v.entry.id}</a>
      <span class="lane-track">
        <span class="lane-span oc-${bestOutcome(ann)}" data-x="${px(start)}" data-w="${Math.max(0.4, (end - start) / (t1 - t0) * 100).toFixed(2)}"></span>
        <span class="lane-pt lane-event t-${v.tier}" data-x="${px(start)}" data-tip="${esc(`${v.entry.date} · ${pick(v.entry.title)}`)}"></span>
        ${ann.outcomes.map((o) => `<span class="lane-pt oc-${o.cls}${o.dated ? '' : ' is-undated'}" data-x="${px(o.when)}" data-tip="${esc(`${o.date || t('dynamic.undated')} · ${outcomeName(ont, o.type)}`)}"></span>`).join('')}
      </span>
      <span class="lane-days mono small">${days == null ? '·' : t('dynamic.days', { n: formatNumber(days) })}</span>
    </li>`;
  }).join('');
  const axisYears = [];
  const every = Math.ceil((y1 - y0 + 1) / 8);
  for (let yy = y0; yy <= y1; yy += every) axisYears.push(`<span data-x="${px(Date.UTC(yy, 0, 1))}">${yy}</span>`);

  const outcomeCounts = new Map();
  for (const v of live) for (const o of model.annotations.get(v.entry.id).outcomes) outcomeCounts.set(o.type, (outcomeCounts.get(o.type) || 0) + 1);
  const outcomeItems = [...outcomeCounts].sort((a, b) => b[1] - a[1]).map(([k, value]) => ({ label: outcomeName(ont, k), sub: t(`dynamic.classes.${ont.outcomes[k].class}`), value, cls: `oc-${ont.outcomes[k].class}`, href: `#/ledger?outcome=${k}` }));
  const latencies = live.map((v) => {
    const ann = model.annotations.get(v.entry.id);
    const first = ann.outcomes.filter((o) => o.dated).sort((a, b) => a.when - b.when)[0];
    return first ? (first.when - parseDate(v.entry.date)) / 86400000 : null;
  }).filter((d) => d != null).sort((a, b) => a - b);
  const median = latencies.length ? Math.round(latencies[Math.floor(latencies.length / 2)]) : null;
  const none = live.filter((v) => bestOutcome(model.annotations.get(v.entry.id)) === 'none').length;

  root.insertAdjacentHTML('beforeend', `<div class="dash">
    <section class="panel panel-replay" data-span="12" data-reveal>
      <header class="panel-head"><div class="panel-titles"><h2 class="panel-title">${esc(t('dynamic.replay'))}</h2><p class="panel-sub">${esc(t('dynamic.replaySub'))}</p></div>
        <div class="panel-actions"><button type="button" class="btn btn-small" id="dyn-play" aria-pressed="false">${icon('play', 'i-play')}${icon('pause', 'i-pause')}<span class="lbl">${esc(t('dynamic.play'))}</span></button></div></header>
      <div class="panel-body">
        <div class="scrub"><span class="mono scrub-year" id="dyn-year">${y1}</span>
          <input type="range" id="dyn-range" min="${y0}" max="${y1}" value="${y1}" step="1" aria-label="${esc(t('dynamic.asOf'))}">
          <span class="mono muted small">${y0} → ${y1}</span></div>
        <div class="replay-grid">
          <div class="chart-wrap">${cum.svg}</div>
          <div class="map-wrap map-replay" id="dyn-map">${dotMap(markers, { label: t('overview.map') })}</div>
          <dl class="replay-stats" id="dyn-stats"></dl>
        </div>
      </div>
    </section>
    ${panel({ span: '7', cls: 'panel-sankey', title: esc(t('dynamic.flow')), sub: esc(t('dynamic.flowSub')), body: `<div class="sankey-heads mono-label"><span>${esc(t('entry.evidence'))}</span><span>${esc(t('kinetic.mechanism'))}</span><span>${esc(t('dynamic.class'))}</span></div><div class="chart-wrap">${sankey([col1, col2, col3], [...l1, ...l2], { width: 640, height: 300, label: t('dynamic.flow') })}</div>` })}
    ${panel({ span: '5', title: esc(t('dynamic.gap')), sub: esc(t('dynamic.gapSub')), body: `
      <div class="kpis kpis-2">
        <div class="kpi kpi-warn"><span class="kpi-label mono-label">${esc(t('dynamic.noneLabel'))}</span><span class="kpi-n tnum" data-count="${none}">${none}</span><span class="kpi-sub">${esc(t('dynamic.ofN', { n: live.length }))}</span></div>
        <div class="kpi"><span class="kpi-label mono-label">${esc(t('dynamic.median'))}</span><span class="kpi-n tnum">${median == null ? '·' : formatNumber(median)}</span><span class="kpi-sub">${esc(t('dynamic.medianSub', { n: latencies.length }))}</span></div>
      </div>
      ${barList(outcomeItems)}` })}
    ${panel({ span: '12', title: esc(t('dynamic.lanes')), sub: esc(t('dynamic.lanesSub')), body: `<div class="lanes-wrap"><div class="lane-axis mono small">${axisYears.join('')}</div><ol class="lanes">${lanes}</ol></div>
      ${legend([{ swatch: tierGlyph('documented'), label: t('dynamic.event') }, ...OUTCOME_CLASSES.filter((k) => k !== 'none').map((k) => ({ cls: `oc-${k}`, label: t(`dynamic.classes.${k}`) }))])}
      <p class="small muted">${esc(t('dynamic.lanesNote'))}</p>` })}
  </div>`);
  wireSankey(root);

  const range = root.querySelector('#dyn-range');
  const yearEl = root.querySelector('#dyn-year');
  const cursor = root.querySelector('#cum-cursor');
  const stats = root.querySelector('#dyn-stats');
  const marks = [...root.querySelectorAll('#dyn-map .mk')];
  const yearOf = new Map(live.map((v) => [v.entry.id, Number(v.entry.date.slice(0, 4))]));
  const update = (yy) => {
    yearEl.textContent = yy;
    const p = cum.pos(yy);
    cursor.setAttribute('transform', `translate(${p.x.toFixed(1)} 0)`);
    cursor.querySelector('circle').setAttribute('cy', p.y.toFixed(1));
    const asOf = live.filter((v) => yearOf.get(v.entry.id) <= yy);
    const cutoff = Date.UTC(yy, 11, 31);
    const actors = new Set(asOf.flatMap((v) => model.annotations.get(v.entry.id).actors));
    const provisions = new Set(asOf.flatMap((v) => v.entry.laws.map((l) => l.law)));
    const responses = asOf.flatMap((v) => model.annotations.get(v.entry.id).outcomes.filter((o) => o.when <= cutoff));
    const remedies = responses.filter((o) => o.cls === 'remedy').length;
    stats.innerHTML = [
      [t('dynamic.stats.entries'), asOf.length],
      [t('dynamic.stats.actors'), actors.size],
      [t('dynamic.stats.provisions'), provisions.size],
      [t('dynamic.stats.responses'), responses.length],
      [t('dynamic.stats.remedies'), remedies],
    ].map(([k, v]) => `<div><dt class="mono-label">${esc(k)}</dt><dd class="tnum">${formatNumber(v)}</dd></div>`).join('');
    for (const m of marks) {
      const ids = m.dataset.ids.split(' ');
      const visible = ids.filter((id) => yearOf.get(id) <= yy);
      m.classList.toggle('is-off', !visible.length);
      m.classList.toggle('is-now', ids.some((id) => yearOf.get(id) === yy));
    }
  };
  update(y1);
  range.addEventListener('input', () => { stop(); update(Number(range.value)); });

  let timer = null;
  const playBtn = root.querySelector('#dyn-play');
  const stop = () => {
    clearInterval(timer);
    timer = null;
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.querySelector('.lbl').textContent = t('dynamic.play');
  };
  playBtn.addEventListener('click', () => {
    if (timer) { stop(); return; }
    let yy = Number(range.value) >= y1 ? y0 : Number(range.value);
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.querySelector('.lbl').textContent = t('dynamic.pause');
    const stepMs = reducedMotion() ? 700 : 260;
    range.value = yy;
    update(yy);
    timer = setInterval(() => {
      yy += 1;
      if (yy > y1) { stop(); return; }
      range.value = yy;
      update(yy);
    }, stepMs);
  });
  return () => clearInterval(timer);
}

// ---------------------------------------------------------------- Page

export function render(root, ctx) {
  const sub = ctx.state.route.sub;
  root.innerHTML = head(sub);
  const fn = { semantic: renderSemantic, kinetic: renderKinetic, dynamic: renderDynamic }[sub];
  const cleanup = fn(root, ctx);
  stagger(root);
  applyGeometry(root);
  applyDelays(root);
  countUp(root);
  return cleanup;
}
