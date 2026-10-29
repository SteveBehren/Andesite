import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical, computeChain, compareChain, GENESIS } from '../../assets/js/canonical.js';

const sha256 = async (s) => createHash('sha256').update(s, 'utf8').digest('hex');

test('canonical sorts keys recursively and keeps array order', () => {
  assert.equal(canonical({ b: 1, a: { d: [3, 1], c: 'x' } }), '{"a":{"c":"x","d":[3,1]},"b":1}');
});

test('canonical is stable for unicode and escapes', () => {
  assert.equal(canonical({ t: 'Ä "q" é' }), '{"t":"Ä \\"q\\" é"}');
});

test('canonical rejects values JSON cannot represent', () => {
  assert.throws(() => canonical({ n: Infinity }));
});

test('chain starts from the genesis hash and links each entry', async () => {
  const entries = [{ id: 'AND-0001', x: 1 }, { id: 'AND-0002', x: 2 }];
  const chain = await computeChain(entries, sha256);
  const h0 = await sha256(GENESIS);
  const h1 = await sha256(h0 + canonical(entries[0]));
  assert.equal(chain[0].hash, h1);
  assert.equal(chain[1].hash, await sha256(h1 + canonical(entries[1])));
});

test('editing an old entry breaks the chain from that entry on', async () => {
  const entries = [{ id: 'AND-0001', x: 1 }, { id: 'AND-0002', x: 2 }, { id: 'AND-0003', x: 3 }];
  const lock = await computeChain(entries, sha256);
  const tampered = structuredClone(entries);
  tampered[1].x = 99;
  const result = compareChain(await computeChain(tampered, sha256), lock);
  assert.equal(result.ok, false);
  assert.equal(result.brokenAt, 'AND-0002');
  assert.equal(result.verified, 1);
});

test('the browser and Node produce the same hash for the real ledger', async () => {
  const { readFile } = await import('node:fs/promises');
  const entries = JSON.parse(await readFile(new URL('../../data/entries.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../../data/ledger.lock.json', import.meta.url), 'utf8'));
  const webcrypto = async (s) => {
    const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
  };
  assert.deepEqual(await computeChain(entries, webcrypto), lock);
});
