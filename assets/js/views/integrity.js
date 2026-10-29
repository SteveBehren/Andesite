// Integrity: the hash chain, drawn block by block, verified live in this browser.
import { t, formatNumber, formatDate } from '../i18n.js';
import { esc, tierGlyph, icon, panel, stagger, applyGeometry, countUp, copyText, flashLabel, reducedMotion, REPO } from '../util.js';
import { applyDelays } from '../charts.js';

function blocks(state) {
  const lock = state.data.lock;
  const byId = new Map(state.view.map((v) => [v.entry.id, v]));
  return `<ol class="chain" id="chain">
    <li class="blk blk-genesis is-ok" data-delay="0"><span class="blk-n mono">h0</span><span class="blk-id mono">GENESIS</span><code class="blk-hash">ANDESITE-GENESIS-v1</code></li>
    ${lock.map((l, i) => {
      const v = byId.get(l.id);
      return `<li class="blk" data-i="${i}" data-delay="${i + 1}"><a href="#/ledger/${l.id}" data-tip="${esc(l.hash)}">
        <span class="blk-n mono">h${i + 1}</span>
        <span class="blk-id mono">${v ? tierGlyph(v.tier) : ''}${esc(l.id)}</span>
        <code class="blk-hash">${esc(l.hash.slice(0, 10))}…</code>
        <span class="blk-state" aria-hidden="true"></span></a></li>`;
    }).join('')}
  </ol>`;
}

export function render(root, ctx) {
  const { state } = ctx;
  const automated = state.data.entries.filter((e) => e.intake === 'automated').length;
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow mono">${esc(t('integrity.eyebrow'))}</p><h1 class="page-title">${esc(t('integrity.title'))}</h1>
      <p class="page-lead">${esc(t('integrity.lead'))}</p></div></div>
    <div class="dash">
      <section class="panel panel-verify" data-span="12" data-reveal>
        <header class="panel-head"><div class="panel-titles"><h2 class="panel-title">${esc(t('integrity.chain'))}</h2><p class="panel-sub" id="iv-status">${esc(t('seal.verifying'))}</p></div>
          <div class="panel-actions"><button type="button" class="btn btn-small" id="iv-rerun">${icon('reset')}<span class="lbl">${esc(t('integrity.rerun'))}</span></button></div></header>
        <div class="panel-body"><div class="chain-wrap">${blocks(state)}</div>
          <div class="verify-bar"><span class="vb-fill" id="iv-bar"></span></div></div>
      </section>
      ${panel({ span: '7', title: esc(t('integrity.how')), body: `
        <pre class="formula mono">h0 = sha256("ANDESITE-GENESIS-v1")
hn = sha256(h(n-1) + canonical(entry n))</pre>
        <ol class="steps">${[1, 2, 3, 4].map((i) => `<li><span class="mono step-n">0${i}</span><span>${esc(t(`integrity.steps.s${i}`))}</span></li>`).join('')}</ol>` })}
      ${panel({ span: '5', title: esc(t('integrity.head')), body: `
        <code class="hash hash-big" id="iv-head">${esc(state.data.lock.at(-1)?.hash || '')}</code>
        <div class="row-gap"><button type="button" class="btn btn-small" id="iv-copy">${icon('copy')}<span class="lbl">${esc(t('seal.copy'))}</span></button>
        <a class="btn btn-small btn-quiet" href="data/ledger.lock.json">${esc(t('integrity.lockFile'))}</a></div>
        <dl class="props">
          <div><dt>${esc(t('integrity.sealed'))}</dt><dd class="tnum">${formatNumber(state.data.lock.length)}</dd></div>
          <div><dt>${esc(t('integrity.amendments'))}</dt><dd class="tnum">${formatNumber(state.data.amendments.length)}</dd></div>
          <div><dt>${esc(t('integrity.automated'))}</dt><dd class="tnum">${formatNumber(automated)}</dd></div>
          <div><dt>${esc(t('footer.lastAdded'))}</dt><dd class="mono">${esc(formatDate(state.data.entries.map((e) => e.addedOn).sort().at(-1)))}</dd></div>
        </dl>` })}
      ${panel({ span: '6', title: esc(t('integrity.monitor')), body: `<p>${esc(t('integrity.monitorBody'))}</p><ul class="checklist">${[1, 2, 3, 4, 5, 6].map((i) => `<li>${icon('integrity')}<span>${esc(t(`integrity.rules.r${i}`))}</span></li>`).join('')}</ul>` })}
      ${panel({ span: '6', title: esc(t('integrity.amendLog')), body: state.data.amendments.length
        ? `<ul class="amendments">${state.data.amendments.map((a) => `<li><a class="mono" href="#/ledger/${a.entry}">${esc(a.entry)}</a> · <span class="mono">${esc(a.date)}</span> · ${esc(t(`entry.amendTypes.${a.type}`))}</li>`).join('')}</ul>`
        : `<p class="empty">${esc(t('integrity.noAmendments'))}</p><p class="small muted">${esc(t('integrity.amendHow'))}</p><a class="btn btn-small btn-quiet" href="${REPO}/issues/new?template=correction.yml" rel="noopener">${esc(t('integrity.requestCorrection'))}${icon('external')}</a>` })}
    </div>`;
  stagger(root);
  applyGeometry(root);
  applyDelays(root);
  countUp(root);
  root.querySelector('#iv-copy').addEventListener('click', async (e) => {
    if (await copyText(state.data.lock.at(-1)?.hash || '')) flashLabel(e.currentTarget, t('seal.copied'));
  });
  let timers = [];
  const play = () => {
    timers.forEach(clearTimeout);
    timers = [];
    const s = state.seal;
    const items = [...root.querySelectorAll('#chain .blk[data-i]')];
    const bar = root.querySelector('#iv-bar');
    const status = root.querySelector('#iv-status');
    for (const b of items) b.classList.remove('is-ok', 'is-bad', 'is-scan');
    bar.style.setProperty('--w', '0%');
    if (!s) return;
    const step = reducedMotion() ? 0 : Math.max(40, Math.min(160, 1600 / Math.max(1, items.length)));
    items.forEach((b, i) => {
      const ok = s.ok || i < s.verified;
      timers.push(setTimeout(() => {
        b.classList.add('is-scan');
        timers.push(setTimeout(() => {
          b.classList.remove('is-scan');
          b.classList.add(ok ? 'is-ok' : 'is-bad');
          bar.style.setProperty('--w', `${(((i + 1) / items.length) * 100).toFixed(1)}%`);
        }, step * 0.8));
      }, step * i));
    });
    timers.push(setTimeout(() => {
      status.textContent = s.unavailable ? t('seal.unavailable') : s.ok ? t('seal.ok', { n: s.verified, total: s.total }) : t('seal.brokenBanner', { id: s.brokenAt });
      root.querySelector('.panel-verify').dataset.state = s.unavailable ? 'pending' : s.ok ? 'ok' : 'broken';
    }, step * items.length + 100));
  };
  root.querySelector('#iv-rerun').addEventListener('click', play);
  play();
  render.play = play;
  return () => timers.forEach(clearTimeout);
}

export function onSeal() {
  render.play?.();
}
