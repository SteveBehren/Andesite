# Methodology

How Andesite decides what goes into the ledger, how it handles evidence and safety, and how anyone can check that the record has not been changed. The same rules appear on the Method page of the site in four languages.

## 1. Scope

Andesite records actions by the Indonesian state that violated, or are alleged to have violated, press freedom, freedom of expression, freedom of assembly or the right to information. "The state" means the government, ministries, the police, the military, prosecutors, courts acting against these rights, and regulators.

The schema supports further categories later. A new category is added to `i18n/*.json` (`categories`) and used in entries; the schema accepts any lowercase slug.

## 2. Evidence levels

Every entry has exactly one evidence level. It describes the strength of the public record, not the seriousness of the event. Each level has its own colour **and** its own shape, so colour is never the only signal.

| Level | Shape | Meaning |
|---|---|---|
| `court` | filled square | A court ruled the act unlawful or unconstitutional. Only these entries say that an act was unlawful. |
| `acknowledged` | filled diamond | The responsible authority publicly admitted the act (announcement, apology, statement to Komnas HAM). |
| `documented` | filled circle | Documented by credible independent monitors (AJI, LBH, Komnas HAM, SAFEnet, CIVICUS, RSF, CPJ, HRW, Amnesty, IFJ and similar) or by several credible outlets. |
| `alleged` | outlined triangle | Credibly reported, but the act itself or the responsibility for it is not confirmed. |
| `unverified` | dashed circle | **Field report.** Public social media posts showing an incident, not yet independently confirmed. |

The headline counter and the evidence bar count only the first four levels. Field reports are shown as a separate number, so that nobody can discredit the total by pointing at one unconfirmed post. Withdrawn entries stay visible but are not counted.

## 3. Attribute, don't accuse

- Entries say "documented by", "reported by", "acknowledged by" or "according to".
- Only `court` entries may state that an act was ruled unlawful.
- Officials and institutions are named in their public role.
- Private individuals (protesters, bystanders, minors, ordinary citizens) are never named.
- People already publicly named by credible outlets in connection with their own case, for example a convicted activist, may be named.
- No entry adds facts that are not in its sources. Where sources disagree (for example on arrest numbers), the entry says so or uses the most conservative attributed figure.

This is good practice and it is also legal protection: Indonesian defamation and ITE provisions are used against people who publish accusations.

## 4. Laws

Each entry cites at least one law from `data/laws.json`:

- The original text is shown verbatim, in quotation marks, in its original language.
- A translation follows on a separate line, labelled **Official translation** (only for official UN texts) or **Unofficial translation**.
- If the interface language is the original language, only the original is shown.
- Indonesian statutory texts were checked against the BPK legal database (peraturan.bpk.go.id) and, for the constitution, the consolidated text published by the Secretariat General of the MPR. UN texts come from OHCHR and un.org.

Citation formats:

- Statute: `Undang-Undang Nomor 40 Tahun 1999 tentang Pers, Pasal 4 ayat (3)` (short: `UU 40/1999, Ps. 4(3)`)
- Constitution: `Undang-Undang Dasar Negara Republik Indonesia Tahun 1945, Pasal 28F`
- ICCPR: `International Covenant on Civil and Political Rights, art. 19(2), opened for signature 16 December 1966, 999 UNTS 171; ratified by Indonesia through Undang-Undang Nomor 12 Tahun 2005`
- UDHR: `Universal Declaration of Human Rights, art. 19, GA Res 217A (III), UN Doc A/810 (1948)`
- Court ruling: `Putusan Pengadilan Tata Usaha Negara Jakarta Nomor 230/G/TF/2019/PTUN-JKT, 3 Juni 2020`
- Cite this entry: `Andesite. (2026). {title}. Ledger entry {id}. {siteUrl}/#{id}. Accessed {today}.`

## 5. Field reports from social media

During crackdowns, local media can be pressured, and the first record of what happened is often a public post on TikTok, Instagram, X or Threads. Andesite accepts these as unverified field reports.

### Verification checklist

Each field report shows which checks it has passed:

1. Date consistent
2. Location geolocated
3. Independent second source or angle
4. Reverse-searched for older copies
5. Account not newly created

### Hard rules

1. **Link only.** Never copy, re-host, embed or screenshot the video, image, username, display name or any face. Store the post URL and a neutral description of what it shows.
2. **Never archive social posts.** There is no Wayback link for `social` sources. If a person deletes their post to protect themselves, Andesite must not have preserved it. The card then shows "Original post no longer available" and the description stays.
3. **City level only.** No street-level detail that could identify where a person filmed from.
4. **Never name private individuals.**
5. **Attribute, don't accuse.**
6. **No live scraping of social platforms.** Platforms block it and it breaks their terms. Field reports come in through the GitHub issue form.
7. **Submitter safety.** GitHub issues are public. People inside Indonesia should not use an account tied to their real identity, should not submit footage they filmed themselves, and can contact the maintainer privately through https://github.com/SteveBehren.

A field report is promoted to a higher level with a `tier_change` amendment when independent sources confirm it.

## 6. Automated monitoring

Every six hours a GitHub Action (`.github/workflows/scan.yml`) runs `scripts/scan.mjs`:

1. It reads the RSS feeds and GDELT news queries listed in `scanner/sources.json`. It never reads social media platforms.
2. It keeps only articles from allowlisted publishers that match rights keywords and concern Indonesia, and that it has not seen before.
3. It sends those articles to Claude, which groups them into events and drafts entries in four languages, choosing laws only from the library.
4. Code, not the model, then decides. An automated entry is sealed only if:
   - at least two **different publishers** report it,
   - every source link loads, checked twice,
   - the event is no more than 30 days old and not in the future,
   - it does not reuse a source or match the date and actor of an existing entry,
   - it cites at least one law from the library and one valid category,
   - all four languages are present,
   - the model reports that it names no private individual and is at least 80% confident,
   - and the per-run limit (5 entries) is not exceeded.
5. The evidence level is set in code and **never above `documented`**. It is `alleged` unless the model judges the act itself documented by a monitor or several outlets.
6. The entry is marked `"intake": "automated"` and shows an **Auto-recorded** badge until a person reviews it (an amendment with `"reviewed": true`).
7. The new data is validated, sealed and verified. If anything fails, nothing is written.

Mistakes are corrected the same way as any other mistake: with a visible amendment, up to and including withdrawal. Nothing is ever deleted.

## 7. The seal

The ledger is a hash chain:

```
canonical(x) = JSON with keys sorted recursively, no whitespace, arrays in order, UTF-8
h0 = sha256("ANDESITE-GENESIS-v1")
hn = sha256(h(n-1) + canonical(entry n))        (lowercase hex)
```

In plain words: each entry is turned into one fixed text and combined with the fingerprint of the entry before it. Change a single character in an old entry and every fingerprint after it changes.

- `data/ledger.lock.json` lists `{ id, hash }` for every sealed entry.
- `scripts/seal.mjs` adds hashes for new entries only, and refuses to run if any existing hash would change.
- `scripts/verify.mjs` recomputes the whole chain and checks that the lock on the base branch is an exact prefix of the new lock. CI runs it on every pull request and push, so an edit or deletion of a sealed entry cannot be merged.
- The browser recomputes the chain with Web Crypto every time the page loads and shows the result in the header. If it does not match, a red banner names the first broken entry.
- The same canonicalisation module (`assets/js/canonical.js`) is used in the browser and in Node.

The seal proves the published ledger has not been rewritten. It does not prove that an entry is true; that is what the evidence levels and sources are for.

## 8. Corrections

We never delete, we amend. Corrections live in `data/amendments.json`:

```json
{ "entry": "AND-0005", "date": "2026-11-02", "type": "tier_change", "fromTier": "alleged", "toTier": "documented",
  "note": { "en": "...", "id": "...", "nl": "...", "de": "..." }, "sources": [] }
```

Types: `correction`, `tier_change`, `addition` (more sources), `withdrawn`. Optional flags: `reviewed` (a person has reviewed an automated entry) and `postsRemoved` (the linked social posts are gone). The site applies amendments on top of the sealed entry and shows the history under it. A withdrawn entry stays visible, greyed out, with the reason.

## 9. Independence

Andesite is not affiliated with any party, government or organisation and accepts no funding tied to its content. The code, the data and the full history of every change are public.

## 10. The ontology layer

The site's Ontology pages fuse every entry into one model, in three layers:

- **Semantic:** what exists. Events, state actors, legal provisions, instruments, rights, places and sources are typed objects, connected by typed links (`committed_by`, `engages`, `concerns`, `occurred_in`, `documented_by`, `part_of`, `protects`).
- **Kinetic:** what was done. Each entry is broken into the actions the state took (for example arrest and detention, network throttling, content takedown, prosecution of speech), grouped by mechanism: physical, administrative, digital or legal process. The ledger itself also changes only through defined actions: observe, propose, gate, seal and amend.
- **Dynamic:** what happened next. Rulings, appeals, apologies, denials, inquiries and sentences are dated outcomes attached to each entry, grouped into remedy or reform, partial response, denied or deflected, and adverse outcome.

Actors, actions and outcomes are an editorial classification in `data/ontology.json`. It sits on top of the sealed ledger and is **not** part of the seal, so it can be corrected by an ordinary pull request without touching an entry. Entries the monitor records before a person classifies them are shown as pending, with actors matched from the entry's `actor` text. An outcome without a reliable date is recorded with `"date": null` and drawn at the date of the act, marked as undated.

The legal map links each actor to the provisions its recorded acts engage and shows the strongest evidence level behind each link. It is not a finding that a law was broken. Only a court can make that finding. Where one did, the entry carries the "Ruled by a court" level, and the ruling concerned the act as a whole, not necessarily every provision the entry cites.
