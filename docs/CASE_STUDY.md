# Case study: building Andesite

## The problem

During the protests of 28 October 2026 I watched the public record of what happened get thinner by the hour. Journalists were kept away from the protest point, content linked to an earlier protest had been taken down, and much of what people knew came from posts that could vanish at any moment. The record of state actions against the press and civil liberties in Indonesia exists, but it is spread across NGO reports, news sites in two languages, court databases and social media.

I wanted one place that keeps that record permanently, ties each event to the exact law involved, and can be checked by anyone, in Indonesian and in the languages of the people who report on Indonesia from abroad.

## Constraints

- **Static hosting.** The site runs on Vercel with no server code, no database and no accounts. It has to stay cheap to run and simple to fork.
- **Contributors are not developers.** Journalists, researchers and NGO staff need to be able to propose and check entries.
- **No scraping of social platforms.** Platforms block it, it breaks their terms, and it would put the people in the videos at risk.
- **Submitter safety.** GitHub issues are public. People inside Indonesia must not be exposed by contributing.
- **Legal exposure.** Indonesian defamation and ITE provisions are used against people who publish accusations. The maintainer needs to be protected by how the text is written, not just by intent.
- **Accuracy over volume.** One wrong entry is enough to discredit the whole ledger.

## Key decisions and their trade-offs

**No framework and no build step.** The site is `index.html`, one stylesheet and four ES modules that read JSON. Trade-off: rendering is hand-written string templates and there is no component model. In return, contributors edit JSON and nothing else, and the site has no dependency that can rot.

**An append-only hash chain instead of a database.** Each entry is hashed together with the previous hash, and the hashes are committed to `data/ledger.lock.json`. The browser recomputes the chain on every visit, and CI refuses any pull request where the base branch's lock is not an exact prefix of the new one. Trade-off: a typo in a sealed entry can never be fixed in place. Corrections are amendments shown under the entry. That is exactly the property I wanted for a public record, but it means more care before sealing.

**One canonicalisation module for browser and Node.** `assets/js/canonical.js` is imported by both. A unit test computes the chain with Web Crypto and with Node crypto and compares both with the lock. Trade-off: the canonical form is frozen forever; changing it would change every hash.

**An evidence model, not a list.** Every entry has one of five levels, each with a colour and a shape. Field reports from social media are counted separately and never in the headline number. Trade-off: the headline number is smaller than it could be. In return, nobody can discredit the total by pointing at one unconfirmed post.

**Attribute, don't accuse.** Entries say who documented or acknowledged what. Only entries where a court ruled say an act was unlawful. Trade-off: the text is less punchy. It is also more defensible, and it is what keeps the project usable by journalists and diplomats.

**Law texts as verified data.** Every provision is stored verbatim with its official source, and translations are labelled official or unofficial per language. Verifying them showed why this matters: the official text of Article 18(1) of the Press Law writes the fine as `Rp.500.000.000,00` with no closing full stop, which differs from how it is commonly quoted. The main government legal portal also blocked automated access, so the texts were checked against the BPK legal database, the MPR's consolidated constitution and a Constitutional Court ruling.

**Automatic updates where the model proposes and code decides.** A scheduled GitHub Action reads allowlisted news and NGO feeds, filters by whole-word keywords, and asks Claude for structured JSON describing events in four languages. Every sealing rule is a deterministic, unit-tested function: two independent publishers, live links, recent date, no duplicate, laws from the library only, no private names, and a tier that can never exceed Documented. Trade-off: some real events will be rejected, and anything automated carries a visible badge until a person reviews it. Because the ledger is permanent, I chose false negatives over false positives. The first dry run also showed why the rules need to be strict: substring matching let "pers" match "personel" and "aksi" match "transaksi", which I fixed with whole-word matching and a test.

**Safety rules built into the data model.** Social sources never get an archive link, so a person who deletes their post stays protected. Field reports are city-level only. The issue forms open with a safety notice and never ask for identity.

**Light theme by default, with a visible toggle.** Many readers will meet the site through a shared link on a phone in daylight, and a sober, archival look suits the subject. Dark mode is one tap away and remembered.

## What I measured

Measured on a local static server with Lighthouse 12.2.1 in headless Chromium, before deployment:

| | Performance | Accessibility | Best practices | SEO |
|---|---|---|---|---|
| Desktop preset | 99 | 100 | 100 | 100 |
| Mobile preset | 88 | 100 | 100 | 100 |

- Desktop: first contentful paint 0.5 s, cumulative layout shift 0.013, total blocking time 0 ms.
- Mobile (simulated slow 4G): first contentful paint 2.7 s, largest contentful paint 3.0 s, CLS 0. The render-blocking Google Fonts stylesheet is the main cost. The local server also did not compress responses, which production hosting does.
- First load: 17 requests, 160.6 KiB of the site's own files uncompressed (52 KiB of that is the ledger data), 286.6 KiB including fonts.
- The first Lighthouse run found a layout shift of 0.905 on desktop because the first-visit notice and the hero filled in after JavaScript ran. Deciding the notice before first paint and reserving space for the numbers brought it to 0.013.

Tests that run in CI: schema and referential validation, i18n key parity across four languages, a check that no text contains an em or en dash, a check that the CSP hash matches the inline script, 15 unit tests for the chain and the monitor's guardrails, and the append-only chain verification.

## What I would do next

- A review dashboard for automated entries that writes amendments through pull requests.
- A semi-automated social media monitor with a manual review queue, never auto-publishing posts.
- Self-hosting the fonts to remove the render-blocking request on mobile.
- Per-entry share pages with Open Graph previews, and downloadable exports that carry the seal.
- Independent mirrors of the repository, so the record survives even if one host goes away.
