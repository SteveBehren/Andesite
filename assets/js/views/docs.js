// Method and About: long-form pages with a sticky table of contents.
import { t } from '../i18n.js';
import { esc, stagger } from '../util.js';

function linkify(text) {
  return esc(text).replace(/https:\/\/github\.com\/SteveBehren\b/g, (u) => `<a href="${u}" rel="noopener">${u}</a>`);
}

function slug(s, i) {
  return `s${i + 1}-${s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`;
}

export function render(root, ctx) {
  const page = ctx.page;
  const sections = t(`${page}.sections`);
  const list = Array.isArray(sections) ? sections : [];
  // The "How to read an entry" section of About is the target of the first-visit notice.
  const readIndex = page === 'about' ? 5 : -1;
  const ids = list.map((s, i) => (i === readIndex ? 'about-read' : slug(s.h, i)));
  root.innerHTML = `<div class="page-head"><div><p class="eyebrow mono">${esc(t('docs.eyebrow'))}</p><h1 class="page-title">${esc(t(`${page}.title`))}</h1>
    ${page === 'method' ? `<p class="page-lead">${esc(t('method.lead'))}</p>` : ''}</div></div>
    <div class="docs">
      <nav class="toc" aria-label="${esc(t('docs.toc'))}"><p class="mono-label">${esc(t('docs.toc'))}</p>
        <ol>${list.map((s, i) => `<li><a href="#${ids[i]}" data-toc="${ids[i]}"><span class="mono">${String(i + 1).padStart(2, '0')}</span>${esc(s.h)}</a></li>`).join('')}</ol></nav>
      <div class="prose">${list.map((s, i) => `<section class="prose-sec" id="${ids[i]}" data-reveal><h2><span class="mono sec-n">${String(i + 1).padStart(2, '0')}</span>${esc(s.h)}</h2>${s.p.map((p) => `<p>${linkify(p)}</p>`).join('')}</section>`).join('')}</div>
    </div>`;
  stagger(root);
  // In-page anchors would fight the hash router, so scroll by hand.
  root.querySelector('.toc').addEventListener('click', (e) => {
    const a = e.target.closest('[data-toc]');
    if (!a) return;
    e.preventDefault();
    document.getElementById(a.dataset.toc)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const target = ctx.state.route.params.get('s') === 'read' ? 'about-read' : null;
  if (target) requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }));
  // Highlight the section in view.
  const links = new Map([...root.querySelectorAll('[data-toc]')].map((a) => [a.dataset.toc, a]));
  const io = new IntersectionObserver((items) => {
    for (const it of items) if (it.isIntersecting) for (const [id, a] of links) a.classList.toggle('is-on', id === it.target.id);
  }, { rootMargin: '-30% 0px -60% 0px' });
  for (const s of root.querySelectorAll('.prose-sec')) io.observe(s);
  return () => io.disconnect();
}
