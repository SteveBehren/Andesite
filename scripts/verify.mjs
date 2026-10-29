// Recomputes the whole chain and compares it with the lock.
// With --base <ref> (default origin/main when available) it also checks that the
// lock on that ref is an exact prefix of the current lock, so history is append-only.
// Usage: node scripts/verify.mjs [--base origin/main]
import { execFileSync } from 'node:child_process';
import { computeChain, compareChain } from '../assets/js/canonical.js';
import { readJson, sha256, ROOT } from './lib.mjs';

const args = process.argv.slice(2);
const baseIdx = args.indexOf('--base');
const baseRef = baseIdx >= 0 ? args[baseIdx + 1] : 'origin/main';
const requireBase = baseIdx >= 0;

const entries = await readJson('data/entries.json');
const lock = await readJson('data/ledger.lock.json');
const chain = await computeChain(entries, sha256);
const result = compareChain(chain, lock);

let ok = true;
if (!result.ok) {
  ok = false;
  console.error(`✗ chain mismatch at ${result.brokenAt}: ${result.verified}/${result.total} entries verified`);
  if (chain.length > lock.length) console.error('  New entries are not sealed yet. Run: node scripts/seal.mjs');
} else {
  console.log(`✓ chain verified: ${result.verified}/${result.total} entries, head ${lock.at(-1)?.hash ?? '(empty)'}`);
}

function gitShow(ref, file) {
  try {
    return execFileSync('git', ['show', `${ref}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const baseLockRaw = gitShow(baseRef, 'data/ledger.lock.json');
if (baseLockRaw === null) {
  const msg = `base ref ${baseRef} has no ledger lock`;
  if (requireBase && gitShow(baseRef, 'package.json') === null) {
    ok = false;
    console.error(`✗ cannot read ${baseRef}; fetch it first (git fetch origin main)`);
  } else {
    console.log(`  (skipping append-only check: ${msg})`);
  }
} else {
  const baseLock = JSON.parse(baseLockRaw);
  const baseEntries = JSON.parse(gitShow(baseRef, 'data/entries.json') || '[]');
  if (baseLock.length > lock.length) {
    ok = false;
    console.error(`✗ ${baseRef} has ${baseLock.length} sealed entries, this branch has ${lock.length}. Entries are never deleted.`);
  }
  for (let i = 0; i < Math.min(baseLock.length, lock.length); i++) {
    if (baseLock[i].id !== lock[i].id || baseLock[i].hash !== lock[i].hash) {
      ok = false;
      console.error(`✗ sealed entry ${baseLock[i].id} differs from ${baseRef}. Sealed entries cannot be edited; use data/amendments.json.`);
      break;
    }
  }
  // Belt and braces: the sealed entries themselves must be byte-identical in canonical form.
  for (let i = 0; i < baseEntries.length && i < entries.length; i++) {
    if (JSON.stringify(baseEntries[i]) !== JSON.stringify(entries[i])) {
      const { canonical } = await import('../assets/js/canonical.js');
      if (canonical(baseEntries[i]) !== canonical(entries[i])) {
        ok = false;
        console.error(`✗ ${entries[i].id} was edited compared to ${baseRef}.`);
        break;
      }
    }
  }
  if (ok) console.log(`✓ append-only: ${baseLock.length} entries on ${baseRef} are an exact prefix of this lock`);
}

if (!ok) process.exit(1);
