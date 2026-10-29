// UI strings and locale-aware formatting.
export const LANGS = ['en', 'id', 'nl', 'de'];
export const LANG_NAMES = { en: 'English', id: 'Bahasa Indonesia', nl: 'Nederlands', de: 'Deutsch' };
const LOCALES = { en: 'en-GB', id: 'id-ID', nl: 'nl-NL', de: 'de-DE' };
const STORE_KEY = 'andesite.lang';

let strings = {};
let current = 'en';

export function resolveLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (fromUrl && LANGS.includes(fromUrl)) return fromUrl;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && LANGS.includes(saved)) return saved;
  } catch (e) { /* storage blocked */ }
  return 'en';
}

export async function loadLang(lang) {
  const res = await fetch(`i18n/${lang}.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load i18n/${lang}.json`);
  strings = await res.json();
  current = lang;
  try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* storage blocked */ }
  document.documentElement.lang = lang;
  return strings;
}

export function lang() { return current; }

export function t(key, vars) {
  const value = key.split('.').reduce((node, part) => (node == null ? node : node[part]), strings);
  if (value == null) return key;
  if (typeof value !== 'string' || !vars) return value;
  return value.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

export function locale() { return LOCALES[current]; }

export function formatNumber(n) {
  return new Intl.NumberFormat(locale()).format(n);
}

// Dates are stored as YYYY, YYYY-MM or YYYY-MM-DD. Parse as UTC so they never shift a day.
function parts(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

export function formatDate(value, precision = 'day') {
  if (!value) return t('entry.noDate');
  const opts = { timeZone: 'UTC', year: 'numeric' };
  if (precision !== 'year') opts.month = 'long';
  if (precision === 'day') opts.day = 'numeric';
  return new Intl.DateTimeFormat(locale(), opts).format(parts(value));
}

export function formatRange(start, end, precision) {
  if (!end || end === start) return formatDate(start, precision);
  try {
    const opts = { timeZone: 'UTC', year: 'numeric', month: 'long' };
    if (precision === 'day') opts.day = 'numeric';
    // House style has no en dashes, so swap the range separator for a localised word.
    return new Intl.DateTimeFormat(locale(), opts).formatRange(parts(start), parts(end))
      .replace(/\s*[\u2013\u2014]\s*/g, ` ${t('entry.rangeTo')} `);
  } catch (e) {
    return `${formatDate(start, precision)} ${t('entry.rangeTo')} ${formatDate(end, precision)}`;
  }
}

export function today() {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}
