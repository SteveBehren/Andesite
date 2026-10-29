import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseFeed, publisherFor, isCandidate, cleanText, applyGuardrails } from '../scan-lib.mjs';

const config = JSON.parse(await readFile(new URL('../../scanner/sources.json', import.meta.url), 'utf8'));
const laws = JSON.parse(await readFile(new URL('../../data/laws.json', import.meta.url), 'utf8'));
const entries = JSON.parse(await readFile(new URL('../../data/entries.json', import.meta.url), 'utf8'));

test('publisherFor resolves subdomains to the allowlisted publisher', () => {
  assert.equal(publisherFor('https://en.tempo.co/read/1', config.publishers).name, 'Tempo');
  assert.equal(publisherFor('https://www.hrw.org/news/x', config.publishers).class, 'monitor');
  assert.equal(publisherFor('https://random-blog.example/x', config.publishers), null);
});

test('parseFeed reads RSS items and ignores non-https links', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Jurnalis dihalangi &amp; diintimidasi]]></title><link>https://aji.or.id/a</link><pubDate>Wed, 28 Oct 2026 10:00:00 +0700</pubDate><description>&lt;p&gt;Polisi&lt;/p&gt;</description></item>
    <item><title>Old</title><link>http://insecure.example/b</link></item>
  </channel></rss>`;
  const items = parseFeed(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Jurnalis dihalangi & diintimidasi');
  assert.equal(items[0].published, '2026-10-28');
});

test('isCandidate needs a right, a harm and an Indonesian context, as whole words', () => {
  const tempo = publisherFor('https://tempo.co/x', config.publishers);
  const antara = publisherFor('https://www.antaranews.com/x', config.publishers);
  const hrw = publisherFor('https://www.hrw.org/x', config.publishers);
  assert.equal(isCandidate({ title: 'Jurnalis dihalangi polisi saat meliput demo', snippet: '' }, config, tempo), true);
  assert.equal(isCandidate({ title: 'Journalists arrested in Kenya', snippet: '' }, config, hrw), false);
  assert.equal(isCandidate({ title: 'Indonesia: journalists arrested at protest', snippet: '' }, config, hrw), true);
  assert.equal(isCandidate({ title: 'Personel gabungan tertibkan PKL di trotoar', snippet: '' }, config, antara), false);
  assert.equal(isCandidate({ title: 'Terpikat teater musikal, ingin jajal akting', snippet: '' }, config, antara), false);
  assert.equal(isCandidate({ title: 'Mahasiswa ditangkap usai demo di depan DPR', snippet: '' }, config, antara), true);
});

test('cleanText removes em and en dashes', () => {
  assert.equal(cleanText('1994\u20132026'), '1994 to 2026');
  assert.equal(cleanText('Police \u2014 again \u2014 blocked'), 'Police, again, blocked');
});

const i18n = (s) => ({ en: s, id: s, nl: s, de: s });
const article = (i, url, publisherKey) => ({
  url, title: `Article ${i}`, lang: 'id', published: '2026-10-28', reachable: true,
  publisher: publisherFor(`https://${publisherKey}/`, config.publishers),
});
const baseEvent = {
  articleIds: [0, 1], isStateAction: true, confidence: 0.92, namesPrivateIndividuals: false, duplicateOf: null,
  date: '2026-10-27', dateEnd: null, place: 'Medan', province: 'Sumatera Utara', actor: 'Polrestabes Medan',
  categories: ['press'], suggestedTier: 'documented', laws: [{ law: 'uupers-4', pinpoint: 'ayat (3)' }],
  title: i18n('Police block journalists in Medan'), summary: i18n('Reported by two outlets.'), context: null, reasoning: '',
};
const ctx = (over = {}) => ({
  articles: [article(0, 'https://tempo.co/new-1', 'tempo.co'), article(1, 'https://aji.or.id/new-2', 'aji.or.id')],
  laws, existing: entries, today: '2026-10-29', config, nextId: 'AND-0014', ...over,
});

test('a well-formed event with two independent sources is accepted, capped at documented', () => {
  const r = applyGuardrails(baseEvent, ctx());
  assert.equal(r.ok, true, r.reasons.join('; '));
  assert.equal(r.entry.tier, 'documented');
  assert.equal(r.entry.intake, 'automated');
  assert.equal(r.entry.sources[1].type, 'ngo');
});

test('a single publisher is rejected even with two articles', () => {
  const r = applyGuardrails(baseEvent, ctx({ articles: [article(0, 'https://tempo.co/1', 'tempo.co'), article(1, 'https://en.tempo.co/2', 'tempo.co')] }));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(), /two independent publishers/);
});

test('private names, low confidence, old events, unreachable links and unknown laws are rejected', () => {
  assert.equal(applyGuardrails({ ...baseEvent, namesPrivateIndividuals: true }, ctx()).ok, false);
  assert.equal(applyGuardrails({ ...baseEvent, confidence: 0.5 }, ctx()).ok, false);
  assert.equal(applyGuardrails({ ...baseEvent, date: '2026-01-01' }, ctx()).ok, false);
  assert.equal(applyGuardrails({ ...baseEvent, date: '2026-11-30' }, ctx()).ok, false);
  assert.equal(applyGuardrails({ ...baseEvent, laws: [{ law: 'made-up', pinpoint: null }] }, ctx()).ok, false);
  const down = ctx();
  down.articles[1].reachable = false;
  assert.equal(applyGuardrails(baseEvent, down).ok, false);
});

test('the model cannot raise the tier above what it reports', () => {
  const r = applyGuardrails({ ...baseEvent, suggestedTier: 'alleged' }, ctx());
  assert.equal(r.entry.tier, 'alleged');
});

test('sources already cited by an existing entry mark a duplicate', () => {
  const used = entries[12].sources[0].url;
  const r = applyGuardrails(baseEvent, ctx({ articles: [article(0, used, 'tempo.co'), article(1, 'https://aji.or.id/x', 'aji.or.id')] }));
  assert.equal(r.ok, false);
});
