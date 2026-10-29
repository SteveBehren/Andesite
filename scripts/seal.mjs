// Appends hashes for new entries to data/ledger.lock.json.
// Refuses to touch any hash that already exists.
// Usage: node scripts/seal.mjs
import { computeChain } from '../assets/js/canonical.js';
import { readJson, writeJson, sha256 } from './lib.mjs';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { DATA } from './lib.mjs';

const entries = await readJson('data/entries.json');
let lock = [];
try {
  await access(path.join(DATA, 'ledger.lock.json'));
  lock = await readJson('data/ledger.lock.json');
} catch {
  lock = [];
}

const chain = await computeChain(entries, sha256);

if (chain.length < lock.length) {
  console.error(`✗ The ledger has ${chain.length} entries but the lock has ${lock.length}. Entries are never deleted.`);
  console.error('  To retract an entry, add a "withdrawn" amendment to data/amendments.json.');
  process.exit(1);
}

for (let i = 0; i < lock.length; i++) {
  if (chain[i].id !== lock[i].id || chain[i].hash !== lock[i].hash) {
    console.error(`✗ Sealed entry ${lock[i].id} has been modified (or entries were reordered).`);
    console.error('  Sealed entries are permanent. Revert your change and record it in data/amendments.json instead.');
    process.exit(1);
  }
}

const added = chain.slice(lock.length);
if (!added.length) {
  console.log(`✓ nothing to seal, ${lock.length} entries already sealed`);
} else {
  await writeJson('data/ledger.lock.json', [...lock, ...added]);
  for (const a of added) console.log(`✓ sealed ${a.id} ${a.hash}`);
  console.log(`  ${lock.length + added.length} entries sealed, head ${added.at(-1).hash.slice(0, 16)}`);
}
