// Building blocks shared by several pages: law cards, sources, the entry object view.
import { lang, t, formatDate, formatRange, today, formatNumber } from '../i18n.js';
import { esc, pick, tierPill, tierGlyph, catName, icon, siteUrl, copyText, flashLabel } from '../util.js';
import { neighbours, isNew, parseDate } from '../model.js';

const CHECKS = ['date_matches', 'location_geolocated', 'independent_second_angle', 'no_earlier_copy_found', 'account_not_new'];

export function actorName(ont, key) {
  const a = ont.actors[key];
  return a ? pick(a.name) : key;
}
export function actionName(ont, key) {
  return ont.actions[key] ? pick(ont.actions[key].name) : key;
}
export function outcomeName(ont, key) {
  return ont.outcomes[key] ? pick(ont.outcomes[key].name) : key;
}
export function instrumentName(law) {
  return lang() === 'id' ? law.instrument.id : law.instrument.en;
}

function shortPinpoint(pinpoint) {
  if (!pinpoint) return '';
  const m = pinpoint.match(/\(([^)]+)\)/);
  return m ? `(${m[1]})` : ` ${pinpoint}`;
}

function linkifyUrls(text) {
  return esc(text).replace(/https:\/\/[^\s<]+/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);
}

export function lawText(law) {
  const ui = lang();
  let translation = '';
  if (ui !== law.originalLang && law.translations[ui]) {
    const official = law.translationNote?.[ui] === 'official';
    const label = official ? t('entry.officialTranslation') : t('entry.unofficialTranslation');
    const src = official && law.translationSources?.[ui] ? ` <a href="${esc(law.translationSources[ui])}" rel="noopener">OHCHR</a>` : '';
    translation = `<p class="law-translation" lang="${ui}"><span class="mono-label">${esc(label)}${src}</span>${esc(law.translations[ui])}</p>`;
  }
  return `<span class="mono-label">${esc(t('entry.original'))}</span>
    <blockquote class="law-original" lang="${law.originalLang}">${esc(law.text)}</blockquote>
    ${translation}
    ${law.note ? `<p class="law-note">${linkifyUrls(law.note)}</p>` : ''}
    <a class="ext" href="${esc(law.source)}" rel="noopener">${esc(t('entry.lawSource'))}${icon('external')}</a>`;
}

export function lawCard(data, ref, open = false) {
  const law = data.laws[ref.law];
  if (!law) return '';
  const citation = law.citation.includes('; ratified')
    ? law.citation.replace(law.article, law.article + (ref.pinpoint ? ` ${ref.pinpoint}` : ''))
    : law.citation + (ref.pinpoint ? ` ${ref.pinpoint}` : '');
  return `<details class="law-card" ${open ? 'open' : ''}>
    <summary><span class="law-short mono">${esc(law.short + shortPinpoint(ref.pinpoint))}</span><span class="law-instrument">${esc(instrumentName(law))}</span>${icon('down', 'law-chev')}</summary>
    <div class="law-body">
      <p class="law-citation">${esc(citation)}</p>
      ${lawText(law)}
      <a class="btn btn-small btn-quiet" href="#/legal/${esc(ref.law)}">${icon('legal')}<span>${esc(t('legal.openDossier'))}</span></a>
    </div>
  </details>`;
}

function waybackUrl(url) {
  return `https://web.archive.org/web/*/${url}`;
}

export function sourceItem(s) {
  const typeLabel = t(`entry.sourceTypes.${s.type}`);
  const date = s.published ? `<span>${esc(formatDate(s.published))}</span>` : '';
  // Never offer an archive link for social posts: a deleted post must stay deleted.
  const archived = s.type === 'social' ? '' : `<a href="${esc(waybackUrl(s.url))}" rel="noopener nofollow">${esc(t('entry.archived'))}</a>`;
  const rel = s.type === 'social' ? 'noopener noreferrer nofollow' : 'noopener';
  return `<li>
    <span class="src-type mono src-${esc(s.type)}">${esc(typeLabel)}</span>
    <div class="src-main"><a class="src-title" href="${esc(s.url)}" rel="${rel}">${esc(s.title)}</a>
    <span class="src-meta"><span>${esc(s.publisher)}</span>${date}<span class="mono">${esc(s.lang)}</span>${archived}</span></div>
  </li>`;
}

function fieldBlock(e, v) {
  const f = e.field;
  const checks = CHECKS.map((c) => {
    const ok = f.corroboration.checks.includes(c);
    return `<li class="${ok ? 'yes' : 'no'}"><span class="mark" aria-hidden="true">${ok ? '✓' : '·'}</span><span>${esc(t(`entry.checkNames.${c}`))}</span><span class="visually-hidden">${ok ? 'yes' : 'no'}</span></li>`;
  }).join('');
  const posts = v.postsRemoved
    ? `<p class="small">${esc(t('entry.originalUnavailable'))}</p>`
    : `<ul class="sources">${f.postUrls.map((u) => `<li><span class="src-type mono">${esc(t('entry.sourceTypes.social'))}</span><div class="src-main"><a href="${esc(u)}" rel="noopener noreferrer nofollow">${esc(new URL(u).hostname)}</a></div></li>`).join('')}</ul>`;
  return `<section class="od-sec"><h3 class="od-h">${esc(t('entry.shows'))}</h3>
    <p>${esc(pick(f.shows))}</p>${posts}
    <h3 class="od-h">${esc(t('entry.checks'))} · ${esc(t('entry.corroboration', { n: f.corroboration.count }))}</h3>
    <ul class="checks">${checks}</ul></section>`;
}

function amendmentItem(a) {
  const head = `${esc(formatDate(a.date))} · ${esc(t(`entry.amendTypes.${a.type}`))}`;
  const change = a.type === 'tier_change'
    ? ` (${esc(t('entry.fromTier', { from: t(`tiers.${a.fromTier}.name`), to: t(`tiers.${a.toTier}.name`) }))})` : '';
  return `<li><span class="a-head mono">${head}${change}</span><br>${esc(pick(a.note))}</li>`;
}

// Radial "ego network" of one entry: the entry in the middle, its linked objects around it.
export function egoGraph(model, entryId) {
  const id = `event:${entryId}`;
  const nb = neighbours(model, id).filter((n) => model.objects.has(n.id) && model.objects.get(n.id).type !== 'source');
  const W = 360;
  const H = 260;
  const cx = W / 2;
  const cy = H / 2;
  const order = ['actor', 'action', 'provision', 'right', 'place', 'outcome'];
  nb.sort((a, b) => order.indexOf(model.objects.get(a.id).type) - order.indexOf(model.objects.get(b.id).type));
  const pts = nb.map((n, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, nb.length)) * Math.PI * 2;
    const r = i % 2 ? 98 : 112;
    return { ...n, o: model.objects.get(n.id), x: cx + Math.cos(a) * r * 1.35, y: cy + Math.sin(a) * r * 0.92 };
  });
  const label = (o) => objectLabel(model, o);
  const lines = pts.map((p, i) => `<line class="eg-line lk-${p.type} anim-draw" pathLength="1" x1="${cx}" y1="${cy}" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" data-delay="${i}"/>`).join('');
  const nodes = pts.map((p, i) => `<g class="eg-node ty-${p.o.type}${p.o.cls ? ` oc-${p.o.cls}` : ''}" data-delay="${i}" data-href="${esc(objectHref(p.o))}" data-tip="${esc(`${t(`ontology.types.${p.o.type}`)}: ${label(p.o)}`)}" tabindex="0">
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="5.5"/>
      <text x="${p.x.toFixed(1)}" y="${(p.y + (p.y > cy ? 17 : -10)).toFixed(1)}" text-anchor="middle">${esc(truncate(label(p.o), 22))}</text>
    </g>`).join('');
  const center = model.objects.get(id);
  return `<svg class="ego" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('entry.egoLabel'))}">
    ${lines}
    <g class="eg-center c-${center.tier}"><circle class="eg-ring" cx="${cx}" cy="${cy}" r="18"/><g transform="translate(${cx - 8} ${cy - 8}) scale(1.333)">${tierGlyph(center.tier).replace('<svg', '<svg width="12" height="12"')}</g></g>
    ${nodes}
  </svg>`;
}

export function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function objectLabel(model, o) {
  const ont = model.ont;
  switch (o.type) {
    case 'actor': return o.label;
    case 'action': return actionName(ont, o.key);
    case 'outcome': return outcomeName(ont, o.key);
    case 'right': return catName(o.key);
    case 'provision': return o.label;
    case 'instrument': return o.label;
    case 'event': return o.key;
    default: return o.label;
  }
}

export function objectHref(o) {
  switch (o.type) {
    case 'event': return `#/ledger/${o.key}`;
    case 'actor': return `#/ledger?actor=${o.key}`;
    case 'action': return `#/ledger?action=${o.key}`;
    case 'outcome': return `#/ledger?outcome=${o.key}`;
    case 'right': return `#/ledger?cat=${o.key}`;
    case 'provision': return `#/legal/${o.key}`;
    case 'instrument': return '#/legal';
    case 'place': return `#/ledger?q=${encodeURIComponent(o.key)}`;
    default: return '#/ontology/semantic';
  }
}

// Event to outcomes on one small time axis.
export function lifecycle(v, ann, ont) {
  const start = parseDate(v.entry.date);
  const pts = [{ when: start, label: t('dynamic.event'), cls: `t-${v.tier}`, date: v.entry.date }, ...ann.outcomes.map((o) => ({ when: o.when, label: outcomeName(ont, o.type), cls: `oc-${o.cls}`, date: o.date, undated: !o.dated }))];
  if (pts.length === 1) return `<p class="muted small">${esc(t('dynamic.noOutcome'))}</p>`;
  const max = Math.max(...pts.map((p) => p.when));
  const span = Math.max(1, max - start);
  return `<ol class="lifeline">${pts.map((p, i) => `<li class="ll-pt ${p.cls}" data-x="${(((p.when - start) / span) * 100).toFixed(1)}" data-delay="${i}">
      <span class="ll-dot"></span><span class="ll-text"><span class="ll-date mono">${p.date ? esc(formatDate(p.date, p.date.length === 4 ? 'year' : p.date.length === 7 ? 'month' : 'day')) : esc(t('dynamic.undated'))}</span><span class="ll-label">${esc(p.label)}</span></span></li>`).join('')}</ol>`;
}

export function citeText(v) {
  const year = v.entry.addedOn.slice(0, 4);
  return `Andesite. (${year}). ${pick(v.entry.title)}. ${t('entry.ledgerEntry')} ${v.entry.id}. ${siteUrl()}/#/ledger/${v.entry.id}. ${t('entry.accessed')} ${today()}.`;
}

export function entryUrl(id) {
  return `${siteUrl()}/${lang() === 'en' ? '' : `?lang=${lang()}`}#/ledger/${id}`;
}

// The full object view of one ledger entry.
export function entryDetail(ctx, v) {
  const { state } = ctx;
  const e = v.entry;
  const model = state.model;
  const ont = state.data.ontology;
  const ann = model.annotations.get(e.id);
  const auto = e.intake === 'automated' && !v.reviewed;
  const fresh = isNew(v, state.view);
  const prevHash = v.seal && v.seal.index > 0 ? state.data.lock[v.seal.index - 1].hash : null;
  const tags = [
    tierPill(v.tier),
    fresh ? `<span class="pill pill-new">${esc(t('entry.new'))}</span>` : '',
    auto ? `<span class="pill pill-auto" data-tip="${esc(t('entry.autoRecordedNote'))}">${esc(t('entry.autoRecorded'))}</span>` : '',
    v.amendments.length ? `<span class="pill">${esc(t('entry.amended'))}</span>` : '',
    v.withdrawn ? `<span class="pill pill-bad">${esc(t('entry.withdrawn'))}</span>` : '',
  ].join('');
  const linkGroups = [
    ['committed_by', ann.actors.map((a) => ({ href: `#/ledger?actor=${a}`, label: actorName(ont, a), cls: 'ty-actor' }))],
    ['performed', ann.actions.map((a) => ({ href: `#/ledger?action=${a}`, label: actionName(ont, a), cls: 'ty-action' }))],
    ['engages', e.laws.map((l) => ({ href: `#/legal/${l.law}`, label: state.data.laws[l.law]?.short || l.law, cls: 'ty-provision' }))],
    ['concerns', e.category.map((c) => ({ href: `#/ledger?cat=${c}`, label: catName(c), cls: 'ty-right' }))],
    ['occurred_in', ann.geo.pts.map((p) => ({ href: `#/ledger?q=${encodeURIComponent(p.province)}`, label: p.province, cls: 'ty-place' }))],
    ['resulted_in', ann.outcomes.map((o) => ({ href: `#/ledger?outcome=${o.type}`, label: outcomeName(ont, o.type), cls: `ty-outcome oc-${o.cls}` }))],
  ].filter(([, items]) => items.length);

  return `<article class="objview" aria-labelledby="od-title">
    <header class="od-head" data-reveal>
      <div class="od-tags"><span class="od-id mono">${esc(e.id)}</span>${tags}</div>
      <h1 class="od-title" id="od-title">${esc(pick(e.title))}</h1>
      <p class="od-sub"><time datetime="${e.date}">${esc(formatRange(e.date, e.dateEnd, e.datePrecision))}</time><span>${esc(e.location.place)}</span><span>${esc(e.actor)}</span></p>
      <div class="od-actions">
        <button type="button" class="btn btn-small" data-action="cite" data-id="${e.id}">${icon('copy')}<span class="lbl">${esc(t('entry.cite'))}</span></button>
        <button type="button" class="btn btn-small btn-quiet" data-action="link" data-id="${e.id}">${icon('link')}<span class="lbl">${esc(t('entry.copyLink'))}</span></button>
        <a class="btn btn-small btn-quiet" href="#/ontology/semantic?focus=${encodeURIComponent(`event:${e.id}`)}">${icon('ontology')}<span>${esc(t('entry.inGraph'))}</span></a>
      </div>
      <div class="cite-box" id="${e.id}-cite" hidden></div>
    </header>
    ${v.withdrawn ? `<p class="note note-bad">${esc(t('entry.withdrawnNote'))}</p>` : ''}
    ${auto ? `<p class="note">${esc(t('entry.autoRecordedNote'))}</p>` : ''}
    <div class="od-grid">
      <section class="od-sec od-summary" data-reveal>
        <h2 class="od-h">${esc(t('entry.summary'))}</h2>
        <p class="od-lead">${esc(pick(e.summary))}</p>
        ${e.context ? `<p class="od-context"><strong>${esc(t('entry.context'))}.</strong> ${esc(pick(e.context))}</p>` : ''}
      </section>
      <section class="od-sec od-props" data-reveal>
        <h2 class="od-h">${esc(t('entry.properties'))}</h2>
        <dl class="props">
          <div><dt>${esc(t('entry.evidence'))}</dt><dd>${tierPill(v.tier)}</dd></div>
          <div><dt>${esc(t('entry.date'))}</dt><dd class="mono">${esc(e.date)}${e.dateEnd ? ` → ${esc(e.dateEnd)}` : ''}</dd></div>
          <div><dt>${esc(t('entry.place'))}</dt><dd>${esc(e.location.place)}</dd></div>
          <div><dt>${esc(t('entry.province'))}</dt><dd>${esc(e.location.province)}</dd></div>
          <div><dt>${esc(t('entry.actor'))}</dt><dd>${esc(e.actor)}</dd></div>
          <div><dt>${esc(t('entry.categories'))}</dt><dd>${e.category.map((c) => esc(catName(c))).join(', ')}</dd></div>
          <div><dt>${esc(t('entry.intake'))}</dt><dd>${esc(t(`entry.intakeTypes.${e.intake}`))}</dd></div>
          <div><dt>${esc(t('entry.addedOn'))}</dt><dd class="mono">${esc(e.addedOn)}</dd></div>
        </dl>
      </section>
    </div>
    <section class="od-sec od-links" data-reveal>
      <h2 class="od-h">${esc(t('entry.links'))}${ann.pending ? ` <span class="pill">${esc(t('ontology.pending'))}</span>` : ''}</h2>
      <div class="od-links-grid">
        <div class="ego-wrap">${egoGraph(model, e.id)}</div>
        <dl class="linkgroups">${linkGroups.map(([type, items]) => `<div><dt class="mono-label lk-label lk-${type}">${esc(t(`ontology.links.${type}`))}</dt><dd>${items.map((i) => `<a class="chip ${i.cls}" href="${esc(i.href)}">${esc(i.label)}</a>`).join('')}</dd></div>`).join('')}</dl>
      </div>
    </section>
    <section class="od-sec" data-reveal>
      <h2 class="od-h">${esc(t('entry.lifecycle'))}</h2>
      ${lifecycle(v, ann, ont)}
    </section>
    ${e.field ? fieldBlock(e, v) : ''}
    <section class="od-sec" data-reveal>
      <h2 class="od-h">${esc(t('entry.laws'))} <span class="muted mono">${formatNumber(e.laws.length)}</span></h2>
      <p class="small muted">${esc(t('entry.lawsNote'))}</p>
      <div class="law-list">${e.laws.map((ref, i) => lawCard(state.data, ref, i === 0)).join('')}</div>
    </section>
    <section class="od-sec" data-reveal>
      <h2 class="od-h">${esc(t('entry.sources'))} <span class="muted mono">${formatNumber(e.sources.length + v.extraSources.length)}</span></h2>
      <ul class="sources">${[...e.sources, ...v.extraSources].map(sourceItem).join('')}</ul>
    </section>
    ${v.amendments.length ? `<section class="od-sec" data-reveal><h2 class="od-h">${esc(t('entry.history'))}</h2><ul class="amendments">${v.amendments.map(amendmentItem).join('')}</ul></section>` : ''}
    <section class="od-sec od-seal" data-reveal>
      <h2 class="od-h">${esc(t('entry.sealTitle'))}</h2>
      ${v.seal ? `<dl class="props props-mono">
        <div><dt>${esc(t('entry.chainIndex'))}</dt><dd>#${formatNumber(v.seal.index + 1)}</dd></div>
        <div><dt>${esc(t('entry.prevHash'))}</dt><dd><code class="hash">${esc(prevHash || 'sha256("ANDESITE-GENESIS-v1")')}</code></dd></div>
        <div><dt>${esc(t('entry.thisHash'))}</dt><dd><code class="hash">${esc(v.seal.hash)}</code></dd></div>
      </dl>` : `<p class="small">${esc(t('entry.notSealed'))}</p>`}
      <a class="btn btn-small btn-quiet" href="#/integrity">${icon('integrity')}<span>${esc(t('seal.open'))}</span></a>
    </section>
  </article>`;
}

// Cite and copy-link buttons inside an entry object view.
export function wireEntryActions(root, state) {
  const onClick = async (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn || !root.contains(btn)) return;
    const { action, id } = btn.dataset;
    const v = state.view.find((x) => x.entry.id === id);
    if (!v) return;
    const box = root.querySelector(`#${id}-cite`);
    const text = action === 'cite' ? citeText(v) : entryUrl(id);
    const ok = await copyText(text);
    if (ok && action === 'link') { flashLabel(btn, t('entry.copied')); return; }
    box.hidden = false;
    box.innerHTML = `<p class="small">${esc(ok ? t('entry.copied') : t('entry.copyFailed'))}</p><textarea readonly>${esc(text)}</textarea>`;
    if (!ok) { const ta = box.querySelector('textarea'); ta.focus(); ta.select(); }
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}
