// Shared by the browser (seal.js) and the Node scripts (seal, verify, scan).
// Any change here changes every hash in the ledger, so treat it as frozen.

export const GENESIS = 'ANDESITE-GENESIS-v1';

// JSON with object keys sorted recursively, no whitespace, arrays kept in order.
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new TypeError('canonical: non-finite numbers are not allowed');
    }
    if (value === undefined) throw new TypeError('canonical: undefined is not allowed');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonical).join(',') + ']';
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

// h0 = sha256(GENESIS), h_n = sha256(h_{n-1} + canonical(entry_n)).
// `sha256` is injected so the same code runs on Web Crypto and Node crypto.
// It takes a string and resolves to a lowercase hex digest.
export async function computeChain(entries, sha256) {
  let prev = await sha256(GENESIS);
  const out = [];
  for (const entry of entries) {
    prev = await sha256(prev + canonical(entry));
    out.push({ id: entry.id, hash: prev });
  }
  return out;
}

// Compares a recomputed chain with the published lock.
// Returns { ok, verified, total, brokenAt } where brokenAt is the first bad id.
export function compareChain(computed, lock) {
  const total = Math.max(computed.length, lock.length);
  for (let i = 0; i < total; i++) {
    const c = computed[i];
    const l = lock[i];
    if (!c || !l || c.id !== l.id || c.hash !== l.hash) {
      return { ok: false, verified: i, total, brokenAt: (c || l).id };
    }
  }
  return { ok: true, verified: total, total, brokenAt: null };
}
