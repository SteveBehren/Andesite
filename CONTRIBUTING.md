# Contributing to Andesite

Thank you for helping keep the record. You do not need to be a developer: most contributions start as a GitHub issue.

Before anything else, read [METHODOLOGY.md](METHODOLOGY.md) and the safety notes in [SECURITY.md](SECURITY.md). **GitHub issues are public.**

## Ways to contribute

| You want to | Use |
|---|---|
| Report an event with a news or monitor source | [New entry form](https://github.com/SteveBehren/Andesite/issues/new?template=new-entry.yml) |
| Report a public social media post showing an incident | [Field report form](https://github.com/SteveBehren/Andesite/issues/new?template=field-report.yml) |
| Fix a mistake in an existing entry | [Correction form](https://github.com/SteveBehren/Andesite/issues/new?template=correction.yml) |
| Improve a translation, the site or the scripts | A pull request |

Labels used: `new-entry`, `field-report`, `correction`.

## Ground rules

- Attribute, don't accuse. Describe what sources report.
- Never name private individuals. City-level locations only for field reports.
- Link to social posts; never copy, screenshot or archive them.
- No em dashes or en dashes in any text. Use commas, full stops or "to" for ranges. `validate.mjs` rejects them.
- Every entry needs at least one source and at least one law from `data/laws.json`.
- Titles, summaries and context are written in all four languages: English, Bahasa Indonesia, Nederlands and Deutsch. Write Indonesian the way people actually write it, not like a textbook.

## For maintainers: turning an approved issue into an entry

1. Check every source yourself. Confirm the facts, the date and the actor.
2. Choose the evidence level using the table in METHODOLOGY.md.
3. Add the entry at the **end** of `data/entries.json` with the next sequential ID (`AND-0014`, `AND-0015`, ...). Required fields:

   ```json
   {
     "id": "AND-0014",
     "date": "2026-11-03",
     "dateEnd": null,
     "datePrecision": "day",
     "tier": "documented",
     "category": ["press"],
     "location": { "place": "Medan", "province": "Sumatera Utara" },
     "actor": "Polrestabes Medan",
     "title":   { "en": "...", "id": "...", "nl": "...", "de": "..." },
     "summary": { "en": "...", "id": "...", "nl": "...", "de": "..." },
     "context": null,
     "laws": [{ "law": "uupers-4", "pinpoint": "ayat (3)" }],
     "sources": [{ "title": "...", "publisher": "...", "url": "https://...", "lang": "id", "published": "2026-11-03", "type": "news" }],
     "intake": "manual",
     "addedOn": "2026-11-04"
   }
   ```

   Field reports use `"tier": "unverified"`, sources of type `social`, and a `field` block (see `schemas/entry.schema.json`).

4. Run the checks and seal:

   ```bash
   npm ci
   node scripts/validate.mjs && node scripts/seal.mjs
   node scripts/verify.mjs
   npm test
   ```

5. Commit `data/entries.json` and `data/ledger.lock.json` together and open a pull request that links the issue.

CI (`.github/workflows/ledger.yml`) fails the pull request if any sealed entry was edited, reordered or removed.

## Corrections and amendments

Never edit a sealed entry. Add an object to `data/amendments.json` instead (see METHODOLOGY.md, section 8), run `node scripts/validate.mjs`, and open a pull request. To mark an automated entry as reviewed by a person, add an amendment with `"type": "correction"` (or `"addition"`) and `"reviewed": true`, explaining what you checked in `note`.

## New laws

Add new provisions to `data/laws.json` only after checking the text character for character against an official source (peraturan.bpk.go.id, peraturan.go.id, an MPR or MK publication, OHCHR or un.org). Put the official source URL in `source`. Translations you write are labelled `unofficial`.

## Local development

There is no build step. Serve the folder with any static server and open it:

```bash
npx serve .
```

The automated monitor can be tried without writing anything:

```bash
ANTHROPIC_API_KEY=... node scripts/scan.mjs --dry-run
```

Without a key, `--dry-run` only lists candidate articles.

## Translations

UI strings, the About page and the Method page live in `i18n/en.json`, `id.json`, `nl.json` and `de.json`. All four files must have exactly the same keys; `validate.mjs` checks this.
