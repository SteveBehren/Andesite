// Small helpers shared by the ledger scripts.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.join(ROOT, 'data');

export const LANGS = ['en', 'id', 'nl', 'de'];
export const TIERS = ['court', 'acknowledged', 'documented', 'alleged', 'unverified'];

export async function readJson(rel) {
  return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
}

export async function writeJson(rel, value) {
  await writeFile(path.join(ROOT, rel), JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export async function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}
