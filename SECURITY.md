# Security and safety

## If you are submitting a report

Andesite takes contributions through GitHub, and **GitHub issues are public**. Anyone can see what you write and the account you use.

- If you are inside Indonesia, **do not use a GitHub account tied to your real identity** to submit field reports.
- **Do not submit footage you filmed yourself.** Submit links to posts by others that are already public.
- Do not paste screenshots, copies of videos, usernames or faces. A link and a neutral description are enough.
- Give the city only, never a street address or the exact place someone filmed from.
- If posting publicly could put you or someone else at risk, contact the maintainer privately through the GitHub profile at https://github.com/SteveBehren instead of opening an issue.

Andesite never archives social media posts. If you delete a post you made, Andesite will not have a copy of it. Ask for the link to be marked as removed with a correction.

## If a post or entry puts someone at risk

Open a correction or contact the maintainer privately. Links to social posts can be marked as removed and descriptions can be amended. Sealed entries cannot be deleted, so the first line of defence is that private individuals are never named and locations stay at city level.

## Reporting a vulnerability

If you find a security problem in the site, the scripts or the automated monitor (for example a way to get unreviewed content sealed, to bypass the append-only check, or to inject content through a feed), please report it privately through the maintainer's GitHub profile at https://github.com/SteveBehren rather than in a public issue. Please include steps to reproduce.

## Design notes

- The site is static, has no accounts, no cookies, no analytics and no third-party scripts. It loads fonts from Google Fonts and nothing else from outside the site.
- `localStorage` is only used for the language, the theme and whether the first-visit notice was dismissed.
- A strict Content Security Policy is set in `vercel.json`.
- Feed content and article text sent to the language model are treated as untrusted data. The model's output is checked by code before anything is sealed (METHODOLOGY.md, section 6), and every change is public in the git history.
