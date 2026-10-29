// Data model. Turns the sealed ledger plus the editorial ontology overlay into
// the objects, links, actions and outcomes the views draw.
import { TIERS, HEADLINE_TIERS, pick, normalise } from './util.js';

const TIER_RANK = Object.fromEntries(TIERS.map((k, i) => [k, i]));

export function strongerTier(a, b) {
  if (!a) return b;
  if (!b) return a;
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

// Sealed entries never change; amendments are applied on top for display.
export function buildView(data) {
  const byEntry = new Map();
  for (const a of data.amendments) {
    if (!byEntry.has(a.entry)) byEntry.set(a.entry, []);
    byEntry.get(a.entry).push(a);
  }
  const hashes = new Map(data.lock.map((l, i) => [l.id, { hash: l.hash, index: i }]));
  return data.entries.map((entry) => {
    const amendments = (byEntry.get(entry.id) || []).slice().sort((x, y) => x.date.localeCompare(y.date));
    let tier = entry.tier;
    let withdrawn = false;
    let reviewed = entry.intake !== 'automated';
    let postsRemoved = false;
    const extraSources = [];
    for (const a of amendments) {
      if (a.type === 'tier_change' && a.toTier) tier = a.toTier;
      if (a.type === 'withdrawn') withdrawn = true;
      if (a.reviewed) reviewed = true;
      if (a.postsRemoved) postsRemoved = true;
      if (a.sources) extraSources.push(...a.sources);
    }
    return { entry, tier, withdrawn, reviewed, postsRemoved, amendments, extraSources, seal: hashes.get(entry.id) || null };
  });
}

export function counts(view) {
  const live = view.filter((v) => !v.withdrawn);
  const byTier = Object.fromEntries(TIERS.map((k) => [k, 0]));
  for (const v of live) byTier[v.tier] += 1;
  const lawCounts = {};
  for (const v of live) for (const ref of v.entry.laws) lawCounts[ref.law] = (lawCounts[ref.law] || 0) + 1;
  const catCounts = {};
  for (const v of live) for (const c of v.entry.category) catCounts[c] = (catCounts[c] || 0) + 1;
  const years = view.map((v) => Number(v.entry.date.slice(0, 4)));
  const first = years.length ? Math.min(...years) : new Date().getFullYear();
  return {
    headline: HEADLINE_TIERS.reduce((n, k) => n + byTier[k], 0),
    field: byTier.unverified,
    byTier,
    lawCounts,
    catCounts,
    lawsCited: Object.keys(lawCounts).length,
    first,
    years: new Date().getFullYear() - first + 1,
  };
}

// Newest addition first; ties broken by ledger order so the latest sealed entry leads.
export function latest(view) {
  return view.slice().sort((a, b) => b.entry.addedOn.localeCompare(a.entry.addedOn) || b.entry.id.localeCompare(a.entry.id));
}

export function chronological(view) {
  return view.slice().sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.id.localeCompare(a.entry.id));
}

// New means added after the ledger's founding batch and within the last `days` days.
export function isNew(v, view, days = 14) {
  const first = view.reduce((min, x) => (x.entry.addedOn < min ? x.entry.addedOn : min), v.entry.addedOn);
  if (v.entry.addedOn <= first) return false;
  return (Date.now() - Date.parse(v.entry.addedOn)) / 86400000 <= days;
}

export function instrumentKey(law) {
  return normalise(law.instrument.en).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// How binding an instrument is for Indonesia. Drives the legal stack view.
export function bindingLevel(law) {
  if (/constitution/i.test(law.instrument.en)) return 'constitution';
  if (law.jurisdiction === 'ID') return 'statute';
  if (/ratified/i.test(law.citation)) return 'treaty';
  return 'declaration';
}

const BINDING_ORDER = ['constitution', 'statute', 'treaty', 'declaration'];

function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}
export { parseDate };

function inferActors(entry, ontology) {
  const hay = normalise(entry.actor);
  const found = [];
  for (const [key, actor] of Object.entries(ontology.actors)) {
    if (actor.aliases.some((alias) => {
      const a = normalise(alias);
      return new RegExp(`(^|[^a-z])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(hay);
    })) found.push(key);
  }
  // Prefer the most specific unit when both a unit and its parent match.
  return found.filter((k) => !found.some((o) => ontology.actors[o].parent === k));
}

function geoFor(entry, ontology) {
  const pts = [];
  for (const part of entry.location.province.split(/,|\band\b/)) {
    const key = part.trim();
    if (ontology.provinces[key]) pts.push({ province: key, lat: ontology.provinces[key][0], lon: ontology.provinces[key][1] });
  }
  if (!pts.length) pts.push({ province: 'DKI Jakarta', lat: ontology.provinces['DKI Jakarta'][0], lon: ontology.provinces['DKI Jakarta'][1], fallback: true });
  const national = /nationwide|nasional|seluruh/i.test(`${entry.location.place} ${entry.location.province}`);
  return { pts, national };
}

// The fusion layer. Objects are typed nodes; links are typed edges.
// Semantic: events, actors, provisions, instruments, rights, places, sources.
// Kinetic: action types connecting actors to events and events to provisions.
// Dynamic: outcomes in time, attached to events.
export function buildOntology(data, view) {
  const ont = data.ontology;
  const objects = new Map();
  const links = [];
  const add = (o) => { if (!objects.has(o.id)) objects.set(o.id, { ...o, degree: 0 }); return objects.get(o.id); };
  const link = (source, target, type) => {
    links.push({ source, target, type });
    objects.get(source).degree++;
    objects.get(target).degree++;
  };

  const annotations = new Map();
  for (const v of view) {
    const e = v.entry;
    const note = ont.entries[e.id];
    const actors = note ? note.actors : inferActors(e, ont);
    annotations.set(e.id, {
      actors: actors.length ? actors : ['unidentified'],
      inferred: !note,
      actions: note ? note.actions : [],
      outcomes: (note ? note.outcomes : []).map((o) => ({
        ...o,
        cls: ont.outcomes[o.type].class,
        when: parseDate(o.date) ?? parseDate(e.date),
        dated: Boolean(o.date),
      })),
      geo: geoFor(e, ont),
      pending: !note,
    });
  }

  for (const v of view) {
    const e = v.entry;
    add({ id: `event:${e.id}`, type: 'event', key: e.id, label: e.id, title: pick(e.title), tier: v.tier, v });
  }
  for (const [key, a] of Object.entries(ont.actors)) {
    add({ id: `actor:${key}`, type: 'actor', key, label: a.short, title: pick(a.name), kind: a.kind, actor: a });
  }
  for (const [key, law] of Object.entries(data.laws)) {
    const ik = instrumentKey(law);
    add({ id: `instrument:${ik}`, type: 'instrument', key: ik, label: law.short.split(',')[0], title: law.instrument.en, binding: bindingLevel(law), law });
    add({ id: `provision:${key}`, type: 'provision', key, label: law.short, title: law.citation, binding: bindingLevel(law), law });
    link(`provision:${key}`, `instrument:${ik}`, 'part_of');
  }
  for (const [law, rights] of Object.entries(ont.provisionRights)) {
    for (const r of rights) {
      add({ id: `right:${r}`, type: 'right', key: r, label: r });
      if (objects.has(`provision:${law}`)) link(`provision:${law}`, `right:${r}`, 'protects');
    }
  }
  for (const [key, a] of Object.entries(ont.actors)) {
    if (a.parent) link(`actor:${key}`, `actor:${a.parent}`, 'unit_of');
  }

  for (const v of view) {
    const e = v.entry;
    const id = `event:${e.id}`;
    const ann = annotations.get(e.id);
    for (const a of ann.actors) if (objects.has(`actor:${a}`)) link(id, `actor:${a}`, 'committed_by');
    for (const ref of e.laws) if (objects.has(`provision:${ref.law}`)) link(id, `provision:${ref.law}`, 'engages');
    for (const c of e.category) {
      add({ id: `right:${c}`, type: 'right', key: c, label: c });
      link(id, `right:${c}`, 'concerns');
    }
    for (const p of ann.geo.pts) {
      add({ id: `place:${p.province}`, type: 'place', key: p.province, label: p.province, lat: p.lat, lon: p.lon });
      link(id, `place:${p.province}`, 'occurred_in');
    }
    for (const s of [...e.sources, ...v.extraSources]) {
      const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch (err) { return s.publisher; } })();
      add({ id: `source:${s.publisher}`, type: 'source', key: s.publisher, label: s.publisher, host, sourceType: s.type });
      link(id, `source:${s.publisher}`, 'documented_by');
    }
    for (const a of ann.actions) {
      add({ id: `action:${a}`, type: 'action', key: a, label: a, mechanism: ont.actions[a].mechanism });
      link(id, `action:${a}`, 'performed');
    }
    for (const o of ann.outcomes) {
      add({ id: `outcome:${o.type}`, type: 'outcome', key: o.type, label: o.type, cls: o.cls });
      link(id, `outcome:${o.type}`, 'resulted_in');
    }
  }
  // Drop actors no event points at (kept in the catalogue, not in the graph).
  for (const [id, o] of objects) if (o.type === 'actor' && o.degree === 0) objects.delete(id);

  return { objects, links, annotations, ont };
}

export function neighbours(model, id) {
  const out = [];
  for (const l of model.links) {
    if (l.source === id) out.push({ id: l.target, type: l.type, dir: 'out' });
    else if (l.target === id) out.push({ id: l.source, type: l.type, dir: 'in' });
  }
  return out;
}

// Actor x provision matrix: which provisions each state actor is recorded as engaging,
// with the strongest evidence level among the entries behind each cell.
export function breachMatrix(view, model, data) {
  const cells = new Map();
  const actorTotals = new Map();
  for (const v of view) {
    if (v.withdrawn || v.tier === 'unverified') continue;
    const ann = model.annotations.get(v.entry.id);
    for (const a of ann.actors) {
      actorTotals.set(a, (actorTotals.get(a) || 0) + 1);
      for (const ref of v.entry.laws) {
        const k = `${a}|${ref.law}`;
        const c = cells.get(k) || { actor: a, law: ref.law, ids: [], tier: null };
        c.ids.push(v.entry.id);
        c.tier = strongerTier(c.tier, v.tier);
        cells.set(k, c);
      }
    }
  }
  const actors = [...actorTotals.keys()].sort((a, b) => actorTotals.get(b) - actorTotals.get(a) || a.localeCompare(b));
  const laws = Object.keys(data.laws).sort((a, b) => {
    const la = data.laws[a];
    const lb = data.laws[b];
    return BINDING_ORDER.indexOf(bindingLevel(la)) - BINDING_ORDER.indexOf(bindingLevel(lb)) || a.localeCompare(b);
  });
  return { cells, actors, laws, actorTotals };
}

// Per provision: entries engaging it, their strongest tier, and tier counts.
export function provisionStats(view, model, key) {
  const items = view.filter((v) => !v.withdrawn && v.entry.laws.some((l) => l.law === key));
  const byTier = Object.fromEntries(TIERS.map((k) => [k, 0]));
  const actors = new Set();
  let tier = null;
  for (const v of items) {
    byTier[v.tier]++;
    tier = strongerTier(tier, v.tier);
    for (const a of model.annotations.get(v.entry.id).actors) actors.add(a);
  }
  return { items, byTier, tier, actors: [...actors] };
}

// Accountability: the best outcome class reached for each entry ("none" when nothing is recorded).
const CLASS_RANK = { remedy: 0, partial: 1, deflected: 2, adverse: 3 };
export function bestOutcome(ann) {
  if (!ann.outcomes.length) return 'none';
  return ann.outcomes.map((o) => o.cls).sort((a, b) => CLASS_RANK[a] - CLASS_RANK[b])[0];
}
export function finalOutcome(ann) {
  if (!ann.outcomes.length) return 'none';
  return ann.outcomes.slice().sort((a, b) => a.when - b.when).at(-1).cls;
}

// Three-column flow data for a Sankey: [{ from, to, value, ids }] per column pair.
export function flows(pairs) {
  const map = new Map();
  for (const p of pairs) {
    const k = `${p.from}>${p.to}`;
    const f = map.get(k) || { from: p.from, to: p.to, value: 0, ids: [] };
    f.value += p.value ?? 1;
    if (p.id) f.ids.push(p.id);
    map.set(k, f);
  }
  return [...map.values()];
}
