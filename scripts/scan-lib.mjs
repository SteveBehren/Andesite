// Pure helpers for the automated monitor (scripts/scan.mjs).
// Everything here is deterministic so it can be unit tested without the network.

export const LANGS = ['en', 'id', 'nl', 'de'];
export const CATEGORIES = ['press', 'expression', 'assembly', 'information'];

export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// en.tempo.co and rss.tempo.co both resolve to the "tempo.co" publisher.
export function publisherFor(url, publishers) {
  let host = hostOf(url);
  while (host) {
    if (publishers[host]) return { domain: host, ...publishers[host] };
    const dot = host.indexOf('.');
    if (dot < 0) break;
    host = host.slice(dot + 1);
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export function decodeEntities(text) {
  return String(text)
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function stripHtml(html) {
  return decodeEntities(
    String(html)
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<(script|style|noscript|svg|nav|footer|header|form|aside)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t\f\v\r]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return m ? stripHtml(m[1]) : '';
}

// Minimal RSS 2.0 and Atom parser. Feeds are untrusted input; only text is extracted.
export function parseFeed(xml) {
  const items = [];
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  for (const block of blocks) {
    let link = tag(block, 'link');
    if (!link) {
      const href = block.match(/<link\b[^>]*href="([^"]+)"/i);
      if (href) link = decodeEntities(href[1]);
    }
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    items.push({
      title: tag(block, 'title'),
      url: link.trim(),
      published: toIsoDate(date),
      snippet: (tag(block, 'description') || tag(block, 'summary')).slice(0, 600),
    });
  }
  return items.filter((i) => i.url.startsWith('https://') && i.title);
}

export function toIsoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const m = String(value).match(/^(\d{4})(\d{2})(\d{2})/); // GDELT seendate 20261028T101500Z
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  }
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

function lower(s) {
  return String(s || '').toLowerCase();
}

// Whole-word match, so "pers" does not hit "personel" and "aksi" does not hit "transaksi".
export function hasTerm(text, terms) {
  return terms.some((term) => new RegExp(`(^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\p{N}])`, 'iu').test(text));
}

const INDONESIAN_OUTLETS = ['tempo.co', 'antaranews.com', 'suara.com', 'detik.com', 'kompas.com', 'kompas.id', 'idntimes.com', 'tirto.id', 'kumparan.com', 'cnnindonesia.com', 'jawapos.com', 'thejakartapost.com', 'nu.or.id', 'inews.id'];

// A candidate mentions a covered right, a harmful act, and Indonesia (or comes from an Indonesian outlet or monitor).
export function isCandidate(article, config, publisher) {
  const text = lower(`${article.title} ${article.snippet}`);
  if (!hasTerm(text, config.rightsKeywords) || !hasTerm(text, config.harmKeywords)) return false;
  const indonesian = publisher && (publisher.domain.endsWith('.id') || INDONESIAN_OUTLETS.includes(publisher.domain));
  return Boolean(indonesian) || hasTerm(text, config.contextKeywords);
}

// House style: no em or en dashes anywhere in sealed text.
export function cleanText(s) {
  return String(s)
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanI18n(obj) {
  if (!obj) return null;
  const out = {};
  for (const l of LANGS) out[l] = cleanText(obj[l] || '');
  return out;
}

const DATE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;

// The model proposes; this function decides. Returns { ok, reasons, entry }.
export function applyGuardrails(event, ctx) {
  const reasons = [];
  const { articles, laws, existing, today, config, nextId } = ctx;

  if (!event.isStateAction) reasons.push('not a state action against a covered right');
  if (typeof event.confidence !== 'number' || event.confidence < config.minConfidence) reasons.push(`confidence ${event.confidence} below ${config.minConfidence}`);
  if (event.namesPrivateIndividuals) reasons.push('names private individuals');
  if (event.duplicateOf) reasons.push(`duplicate of ${event.duplicateOf}`);

  const used = [...new Set(event.articleIds || [])].map((i) => articles[i]).filter(Boolean);
  const publisherNames = new Set(used.map((a) => a.publisher.name));
  if (publisherNames.size < 2) reasons.push(`needs two independent publishers, has ${publisherNames.size}`);
  if (used.some((a) => !a.reachable)) reasons.push('a source link did not load');

  const existingUrls = new Set(existing.flatMap((e) => e.sources.map((s) => s.url)));
  if (used.some((a) => existingUrls.has(a.url))) reasons.push('a source is already cited by an existing entry');

  if (!DATE_RE.test(event.date || '')) reasons.push('invalid date');
  else {
    const age = daysBetween(event.date.length === 10 ? event.date : `${event.date}-01`.slice(0, 10), today);
    if (age < 0) reasons.push('date is in the future');
    if (age > config.maxEventAgeDays) reasons.push(`event is ${age} days old (limit ${config.maxEventAgeDays})`);
  }
  const precision = event.date?.length === 10 ? 'day' : event.date?.length === 7 ? 'month' : 'year';
  if (event.dateEnd && (!DATE_RE.test(event.dateEnd) || event.dateEnd < event.date)) reasons.push('invalid end date');

  const lawRefs = (event.laws || []).filter((l) => laws[l.law]);
  if (!lawRefs.length) reasons.push('no valid law reference');
  const categories = (event.categories || []).filter((c) => CATEGORIES.includes(c));
  if (!categories.length) reasons.push('no valid category');

  for (const field of ['title', 'summary']) {
    for (const l of LANGS) {
      const v = event[field]?.[l];
      if (!v || !v.trim()) reasons.push(`${field}.${l} missing`);
    }
  }
  if ((event.title?.en || '').length > 160) reasons.push('title too long');
  if (!event.place || !event.actor) reasons.push('place or actor missing');

  // Near-duplicate: same day and a shared publisher with an existing entry about the same actor.
  const actorKey = lower(event.actor).split(' (')[0].trim();
  const near = actorKey.length > 3 && existing.find((e) => e.date === event.date && lower(e.actor).includes(actorKey));
  if (near) reasons.push(`likely duplicate of ${near.id} (same date and actor)`);

  if (reasons.length) return { ok: false, reasons };

  // Tier is decided here, never above Documented. Documented needs a recognised monitor
  // or two independent outlets AND the model judging the act itself as established.
  const monitor = used.some((a) => a.publisher.class === 'monitor');
  const capDocumented = monitor || publisherNames.size >= 2;
  const tier = event.suggestedTier === 'documented' && capDocumented ? 'documented' : 'alleged';

  const entry = {
    id: nextId,
    date: event.date,
    dateEnd: event.dateEnd || null,
    datePrecision: precision,
    tier,
    category: categories,
    location: { place: cleanText(event.place), province: cleanText(event.province || event.place) },
    actor: cleanText(event.actor),
    title: cleanI18n(event.title),
    summary: cleanI18n(event.summary),
    context: event.context && LANGS.every((l) => event.context[l]) ? cleanI18n(event.context) : null,
    laws: lawRefs.map((l) => ({ law: l.law, pinpoint: l.pinpoint || null })),
    sources: used.map((a) => ({
      title: cleanText(a.title),
      publisher: a.publisher.name,
      url: a.url,
      lang: a.lang,
      published: a.published,
      type: a.publisher.type || (a.publisher.class === 'monitor' ? 'ngo' : 'news'),
    })),
    intake: 'automated',
    addedOn: today,
  };
  return { ok: true, reasons: [], entry };
}

export function nextLedgerId(entries) {
  return `AND-${String(entries.length + 1).padStart(4, '0')}`;
}
