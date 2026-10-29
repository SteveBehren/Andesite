// Browser-side verification of the hash chain.
import { computeChain, compareChain } from './canonical.js';

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyLedger(entries, lock) {
  if (!globalThis.crypto || !crypto.subtle) {
    return { ok: false, unavailable: true, verified: 0, total: lock.length, brokenAt: null, head: lock.at(-1)?.hash ?? '' };
  }
  const chain = await computeChain(entries, sha256);
  const result = compareChain(chain, lock);
  return { ...result, unavailable: false, head: lock.at(-1)?.hash ?? '' };
}
