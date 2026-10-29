// Schema validation plus the referential checks a schema cannot express.
// Usage: node scripts/validate.mjs
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { readJson, LANGS, fail } from './lib.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const entrySchema = await readJson('schemas/entry.schema.json');
const lawSchema = await readJson('schemas/law.schema.json');
const amendmentSchema = await readJson('schemas/amendment.schema.json');
ajv.addSchema(entrySchema, 'entry.schema.json');

const entries = await readJson('data/entries.json');
const laws = await readJson('data/laws.json');
const amendments = await readJson('data/amendments.json');

const errors = [];
const report = (where, list) => {
  for (const e of list || []) errors.push(`${where}${e.instancePath} ${e.message}`);
};

const validateEntry = ajv.getSchema('entry.schema.json');
if (!Array.isArray(entries)) errors.push('data/entries.json must be an array');
entries.forEach((entry, i) => {
  if (!validateEntry(entry)) report(`entries[${i}] (${entry.id ?? '?'})`, validateEntry.errors);
});

const validateLaws = ajv.compile(lawSchema);
if (!validateLaws(laws)) report('laws', validateLaws.errors);

const validateAmendments = ajv.compile(amendmentSchema);
if (!validateAmendments(amendments)) report('amendments', validateAmendments.errors);

// Ledger order: ids are sequential AND-0001, AND-0002, ...
const seen = new Set();
entries.forEach((entry, i) => {
  const expected = `AND-${String(i + 1).padStart(4, '0')}`;
  if (entry.id !== expected) errors.push(`entries[${i}] has id ${entry.id}, expected ${expected} (ids are sequential and never reused)`);
  if (seen.has(entry.id)) errors.push(`duplicate id ${entry.id}`);
  seen.add(entry.id);

  for (const ref of entry.laws || []) {
    if (!laws[ref.law]) errors.push(`${entry.id} cites unknown law "${ref.law}"`);
  }
  if (entry.dateEnd && entry.dateEnd < entry.date) errors.push(`${entry.id} dateEnd is before date`);
  if (entry.datePrecision === 'day' && entry.date.length !== 10) errors.push(`${entry.id} datePrecision "day" needs YYYY-MM-DD`);
  if (entry.datePrecision === 'month' && entry.date.length !== 7) errors.push(`${entry.id} datePrecision "month" needs YYYY-MM`);
  if (entry.datePrecision === 'year' && entry.date.length !== 4) errors.push(`${entry.id} datePrecision "year" needs YYYY`);

  // Safety rules for field reports (METHODOLOGY.md, section on field reports).
  if (entry.tier === 'unverified') {
    if ((entry.sources || []).some((s) => s.type !== 'social' && s.type !== 'news' && s.type !== 'ngo')) {
      errors.push(`${entry.id} field report has an unexpected source type`);
    }
  } else if ((entry.sources || []).some((s) => s.type === 'social')) {
    errors.push(`${entry.id}: "social" sources are only allowed on unverified field reports`);
  }
  if (entry.intake === 'automated' && ['court', 'acknowledged'].includes(entry.tier)) {
    errors.push(`${entry.id}: automated entries cannot be sealed above "documented"; use a tier_change amendment after review`);
  }
});

// Translations must exist for every UI language except the original.
for (const [key, law] of Object.entries(laws)) {
  for (const lang of LANGS) {
    if (lang === law.originalLang) continue;
    if (!law.translations?.[lang]) errors.push(`law ${key} is missing a ${lang} translation`);
    if (!law.translationNote?.[lang]) errors.push(`law ${key} is missing translationNote.${lang}`);
  }
}

for (const [i, a] of amendments.entries()) {
  if (!seen.has(a.entry)) errors.push(`amendments[${i}] refers to unknown entry ${a.entry}`);
}

// House style: no em or en dashes in any human-written content.
const dashCheck = (where, value) => {
  const text = JSON.stringify(value);
  if (/[\u2013\u2014]/.test(text)) errors.push(`${where} contains an em or en dash; use a comma, a full stop or "to"`);
};
entries.forEach((e) => dashCheck(e.id, e));
dashCheck('laws.json', laws);
dashCheck('amendments.json', amendments);

if (errors.length) {
  for (const e of errors) fail(e);
  console.error(`\n${errors.length} problem(s). Nothing was changed.`);
} else {
  console.log(`✓ valid: ${entries.length} entries, ${Object.keys(laws).length} laws, ${amendments.length} amendments`);
}

// Every UI language file must have exactly the same keys as en.json.
const keyPaths = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => {
  const p = prefix ? `${prefix}.${k}` : k;
  if (Array.isArray(v)) return [`${p}[${v.length}]`];
  return v && typeof v === 'object' ? keyPaths(v, p) : [p];
});
const enKeys = new Set(keyPaths(await readJson('i18n/en.json')));
let i18nErrors = 0;
for (const code of LANGS.filter((l) => l !== 'en')) {
  const strings = await readJson(`i18n/${code}.json`);
  const keys = new Set(keyPaths(strings));
  for (const k of enKeys) if (!keys.has(k)) { fail(`i18n/${code}.json is missing ${k}`); i18nErrors++; }
  for (const k of keys) if (!enKeys.has(k)) { fail(`i18n/${code}.json has extra key ${k}`); i18nErrors++; }
  if (/[\u2013\u2014]/.test(JSON.stringify(strings))) { fail(`i18n/${code}.json contains an em or en dash`); i18nErrors++; }
}
if (/[\u2013\u2014]/.test(JSON.stringify(await readJson('i18n/en.json')))) { fail('i18n/en.json contains an em or en dash'); i18nErrors++; }
if (!i18nErrors) console.log(`✓ i18n: ${LANGS.length} languages with matching keys`);

// The CSP in vercel.json pins the hash of the one inline script in index.html.
{
  const { createHash } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const vercel = await readJson('vercel.json');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  const csp = vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy')?.value || '';
  const missing = inline.filter((h) => !csp.includes(h));
  if (missing.length) fail(`vercel.json CSP is missing ${missing.join(', ')} for the inline script in index.html`);
  else console.log(`✓ CSP covers ${inline.length} inline script(s)`);
}
