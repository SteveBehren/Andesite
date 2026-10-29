// The ontology model the Ontology and Legal pages draw from, run against the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readJson } from '../lib.mjs';
import { buildView, buildOntology, breachMatrix, isNew, bestOutcome } from '../../assets/js/model.js';

const data = {
  entries: await readJson('data/entries.json'),
  lock: await readJson('data/ledger.lock.json'),
  amendments: await readJson('data/amendments.json'),
  laws: await readJson('data/laws.json'),
  ontology: await readJson('data/ontology.json'),
};
const view = buildView(data);
const model = buildOntology(data, view);

test('every entry becomes an event object linked to its actors and provisions', () => {
  for (const v of view) {
    const id = `event:${v.entry.id}`;
    assert.ok(model.objects.has(id), `${id} missing`);
    const out = model.links.filter((l) => l.source === id);
    assert.ok(out.some((l) => l.type === 'committed_by'), `${id} has no actor`);
    for (const ref of v.entry.laws) assert.ok(out.some((l) => l.type === 'engages' && l.target === `provision:${ref.law}`), `${id} misses ${ref.law}`);
  }
});

test('links only point at objects that exist', () => {
  for (const l of model.links) {
    assert.ok(model.objects.has(l.source), `dangling source ${l.source}`);
    assert.ok(model.objects.has(l.target), `dangling target ${l.target}`);
  }
});

test('a breach cell is marked "court" only when a court-tier entry is behind it', () => {
  const m = breachMatrix(view, model, data);
  const tierOf = new Map(view.map((v) => [v.entry.id, v.tier]));
  for (const cell of m.cells.values()) {
    if (cell.tier === 'court') assert.ok(cell.ids.some((id) => tierOf.get(id) === 'court'));
  }
});

test('unclassified entries get actors inferred from their text', () => {
  const extra = { ...data.entries[0], id: 'AND-9999', actor: 'Jakarta Metropolitan Regional Police (Polda Metro Jaya) and the Indonesian National Police (Polri)' };
  const d = { ...data, entries: [...data.entries, extra] };
  const ann = buildOntology(d, buildView(d)).annotations.get('AND-9999');
  assert.equal(ann.pending, true);
  assert.deepEqual(ann.actors, ['polda-metro']);
});

test('the founding batch is never flagged as new', () => {
  for (const v of view) if (v.entry.addedOn === view[0].entry.addedOn) assert.equal(isNew(v, view), false);
});

test('accountability falls back to "none" when nothing is recorded', () => {
  assert.equal(bestOutcome({ outcomes: [] }), 'none');
  assert.equal(bestOutcome(model.annotations.get('AND-0005')), 'remedy');
});
