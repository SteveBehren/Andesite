// Field reports: unverified public posts, counted apart from the headline number.
import { t, formatNumber, formatDate } from '../i18n.js';
import { esc, pick, tierGlyph, icon, panel, stagger, applyGeometry, REPO } from '../util.js';

const CHECKS = ['date_matches', 'location_geolocated', 'independent_second_angle', 'no_earlier_copy_found', 'account_not_new'];

export function render(root, ctx) {
  const { state } = ctx;
  const reports = state.view.filter((v) => v.tier === 'unverified');
  const list = reports.map((v) => `<li><a class="lrow t-unverified" href="#/ledger/${v.entry.id}"><span class="lr-glyph">${tierGlyph('unverified')}</span><span class="lr-main">
    <span class="lr-top"><span class="mono lr-id">${v.entry.id}</span><time class="mono">${esc(formatDate(v.entry.date, v.entry.datePrecision))}</time></span>
    <span class="lr-title">${esc(pick(v.entry.title))}</span>
    <span class="lr-meta">${esc(t('entry.corroboration', { n: v.entry.field.corroboration.count }))} · ${(v.entry.field.platforms || []).join(', ')}</span></span></a></li>`).join('');
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow mono">${tierGlyph('unverified')} ${esc(t('tiers.unverified.name'))}</p><h1 class="page-title">${esc(t('field.title'))}</h1>
      <p class="page-lead">${esc(t('field.body'))}</p></div>
      <a class="btn" href="${REPO}/issues/new?template=field-report.yml" rel="noopener">${icon('plus')}<span>${esc(t('field.button'))}</span></a></div>
    <div class="dash">
      ${panel({ span: '7', title: esc(t('field.listTitle')), sub: esc(t('field.listSub', { n: formatNumber(reports.length) })), body: reports.length ? `<ul class="lrows-flat">${list}</ul>` : `<div class="detail-empty">${icon('field', 'ico-xl')}<p>${esc(t('field.empty'))}</p></div>` })}
      ${panel({ span: '5', title: esc(t('entry.checks')), sub: esc(t('field.checksSub')), body: `<ol class="steps">${CHECKS.map((c, i) => `<li><span class="mono step-n">0${i + 1}</span><span>${esc(t(`entry.checkNames.${c}`))}</span></li>`).join('')}</ol>` })}
      ${panel({ span: '12', title: esc(t('field.safetyTitle')), cls: 'panel-warn', body: `<p>${esc(t('field.safety'))}</p><ul class="checklist">${[1, 2, 3, 4].map((i) => `<li>${icon('integrity')}<span>${esc(t(`field.rules.r${i}`))}</span></li>`).join('')}</ul>` })}
    </div>`;
  stagger(root);
  applyGeometry(root);
}
