# Build Notes — NDIS 2026 Amendments Comparison Tool

Handoff / build-state doc. Read this first when resuming.

## What this is

A frame-driven web tool for advocacy: side-by-side comparison of the **NDIS
Amendment (Integrity and Safeguarding) Act 2026** against the **National
Disability Insurance Scheme Act 2013** it amends.

Layout:
- **Left panel** — the complete amending Act (verbatim), all 96 items across 3
  Schedules. Each item, on hover, surfaces a link to the NDIS Act section it
  changes.
- **Right panel** — equal-size, tabbed:
  - **Tab 1 "Original NDIS legislation"** — the complete NDIS Act 2013 *before*
    these amendments. Clicking a left-panel link jumps this tab to the matching
    section; matching words get a yellow highlight.
  - **Tab 2 "Proposed Legislation"** — the complete NDIS Act 2013 *as amended*.
- In both right-panel tabs, hovering any paragraph shows a bubble with a
  plain-English translation.

## Confirmed decisions

- **Design language:** minimalistic, Apple-like, professional, modern, serious.
  Advocacy-meets-corporate, post-millennial. Light theme default + dark toggle.
- **Scope:** full text of all three documents shown directly in the frames (not
  excerpts). Interactive wiring (hover-links, highlights, plain-English bubbles)
  to **full coverage** — every amendment item + every affected Act section.
- **Left panel content:** verbatim bill text — the actual drafting instructions
  ("Repeal the subsection, substitute: ...").
- **Plain-English bubbles:** AI-drafted from the Parliamentary Library Bills
  Digest; each must be visibly flagged "AI-drafted — verify before relying on it."
- **Stack:** static vanilla HTML/CSS/JS, no build step, GitHub Pages-ready.
  parlinfo / austlii block both fetching and iframe embedding, so all documents
  are re-rendered in-app from local data, with deep-links out to the official
  source.

## The bill

- **National Disability Insurance Scheme Amendment (Integrity and Safeguarding)
  Act 2026**, No. 41, 2026. Federal Register ID **C2026A00041**.
- Assented 8 Apr 2026. Schedules 1 & 3 commenced 9 Apr 2026; Schedule 2 commenced
  6 May 2026.
- Amends the **National Disability Insurance Scheme Act 2013** (C2013A00020).
- Structure: Schedule 1 (Commission) Parts 1–7; Schedule 2 (NDIA) Parts 1–3;
  Schedule 3 (Whistleblower). 96 numbered items total.

## Sources (`sources/`)

Committed clean-text extracts — the working data:
- `amending-act-2026_C2026A00041.txt` — full verbatim amending Act, all 96 items.
- `ndis-act-2013_2024-10-03.txt` — NDIS Act 2013, compilation 3 Oct 2024 = the
  **"original / before"** (pre-amendment).
- `ndis-act-2013_2026-05-06.txt` — NDIS Act 2013, compilation 6 May 2026
  (C2026C00181) = the **"proposed / after"** (post-amendment, both schedules in
  force).
- `extract.py` — HTML→clean-text converter. Run `python3 extract.py` in `sources/`.

Raw `.html` is git-ignored (large, re-downloadable). To reproduce, from `sources/`
with a browser User-Agent:
```
curl -A "$UA" -L "https://www.legislation.gov.au/C2026A00041/asmade/2026-04-08/text/1/epub/OEBPS/document_1/document_1.html" -o amending-act-2026_C2026A00041.html
curl -A "$UA" -L "https://www.legislation.gov.au/C2013A00020/2024-10-03/2024-10-03/text/original/epub/OEBPS/document_1/document_1.html" -o ndis-act-2013_2024-10-03.html
curl -A "$UA" -L "https://www.legislation.gov.au/C2013A00020/2026-05-06/2026-05-06/text/original/epub/OEBPS/document_1/document_1.html" -o ndis-act-2013_2026-05-06.html
python3 extract.py
```

Access notes:
- `parlinfo.aph.gov.au`, `austlii.edu.au` — block automated fetching (403) **and**
  iframe embedding. Not usable as a live source.
- `legislation.gov.au` — works via curl with a browser User-Agent. Official
  source. **Use this.**
- Plain-English source: Parliamentary Library **Bills Digest** —
  https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/bd/bd2526/26bd042
  (fetchable; rich item-by-item summaries).
- Deep-link target for "view original": the official bill page —
  https://www.aph.gov.au/Parliamentary_Business/Bills_Legislation/Bills_Search_Results/Result?bId=s1478

## Key insight — the amendment→section mapping is auto-derivable

Every bill item's first line names its target section, e.g.:
- `33 Subsection 73B(2)` → s73B
- `80 After subsection 73ZN(2A)` → s73ZN
- `1 Paragraph 29(1)(d)` → s29
- `2 After section 29` → inserts new s29A

A regex over item headers
(`^(\d+[A-Z]*)\s+(Section|Subsection|Paragraph|After section|After subsection|Before section|Before subsection|At the end of section|Division|Part)\s+...`)
yields the hover-link mapping for ~all 96 items **automatically** — no
hand-mapping.

Nuance to handle in the parser: some items target a structural unit
(Part/Division/Chapter) and insert a *new* section — e.g. item 6 → new s59A;
item 31 → new s11B; item 43 → new s73ZNA; item 76 → new s73ZOA–C. For these the
hover-link points to the insertion location and Tab 1 shows "no equivalent —
newly inserted"; the new text lives in Tab 2.

## Affected NDIS Act sections (checklist for plain-English work)

- **Sch 1:** 9, 11B*, 55A, 56, 57, 59A*, 62, 63, 64, 67A, 67B, 67C, 67D, 73B,
  73D, 73F, 73J, 73V, 73ZC, 73ZDA*, 73ZE, 73ZF, 73ZI, 73ZK, 73ZKA*, 73ZL, 73ZM,
  73ZN, 73ZNA*, 73ZO, 73ZOA*, 73ZOB*, 73ZOC*, 73ZP, 73ZQ, 73ZS (repealed/moved),
  99, 199A*, 199B*, 199C*, 200, 201A, 202B, 209
- **Sch 2:** 29, 29A*, 9A, 45, 45A, 47A, 78, 79
- **Sch 3:** 73ZA, 73ZB, 73ZBA*

`*` = newly inserted section.

## Build plan / tasks

1. ~~Source legislation content.~~ **Done.**
2. **Parse** the 3 `.txt` sources → structured JSON: bill tree
   (Schedule→Part→Division→Item, verbatim text + derived target-section ref);
   original Act (sections→paragraphs, stable IDs); amended Act (same). Stable
   paragraph IDs anchor scroll-sync, highlighting and bubbles.
3. **Design system** — CSS tokens, typography, light/dark, the yellow-highlight
   + hover-bubble + hover-link treatments.
4. **HTML shell** — equal split-pane; left = bill; right = tabbed (Tab 1
   original, Tab 2 proposed); header with theme toggle.
5. **JS engine** — render docs from JSON; tab switching; theme persistence;
   hover-link reveal + click→scroll-sync + yellow highlight (all 96 items);
   plain-English bubble mechanism (renders where data exists, graceful when not).
6. **Plain-English translations** — the incremental content layer. Draft AI
   plain-English for every affected section's paragraphs, flagged for review.
   Multi-session; priority order below.
7. **Integrate, test** (browser), **commit**.

**Architectural principle:** the HTML/CSS/JS engine is fixed; the bill text,
mapping and translations are all *data*. Partial data must render gracefully —
the site is always usable, just progressively richer.

## Plain-English drafting priority (representative spread — do these first)

1. **Schedule 2 Part 1 — Withdrawing from the scheme** (items 1, 2, 2A–2D) →
   s29, new s29A. 90-day cooling-off period. Participant-facing.
2. **Schedule 1 Part 2 item 33** — s73B tiered registration offences.
   Provider-facing, large penalties.
3. **Schedule 1 Part 5 item 80** — s73ZN banning-order expansion (auditors,
   consultants, applicants).
4. **Schedule 1 Part 4 — Anti-promotion orders** (items 75–79) → new s73ZOA–C.
   Predatory-marketing controls; the "insert new section" case.

## Data (`data/`, built by `sources/build_data.py`)

`build_data.py` parses the downloaded HTML (via BeautifulSoup, using the
Federal Register's CSS classes) into three JSON files the app renders from.
Run `python3 sources/build_data.py` to rebuild.

- `bill.json` — `{meta, nodes[]}`. `nodes` is a flat ordered list:
  `schedule` / `part` / `division` / `act-ref` headings, `bill-section`
  (the amending Act's own ss 1–3), and `item`. Each `item` has
  `{num, descriptor, id, content[], target}`. `target` =
  `{section, relatedSection, newSections[], kind, quotes[]}` — `section` is the
  existing NDIS Act section the item amends (hover-link target); `quotes` are
  the strings the item lifts verbatim from the Act (highlight targets);
  `kind` ∈ `amend | insert-section | provision | structural`.
- `act-original.json` / `act-proposed.json` — `{meta, sectionIndex, nodes[]}`.
  `nodes` is a flat ordered list of `chapter` / `part` / `division` /
  `subdivision` headings and `section`. Each `section` has `blocks[]` with
  stable IDs `s{num}-b{n}` — these anchor scroll-sync, highlights and bubbles.
  `sectionIndex` maps section number → node index.

Build result: bill = 3 schedules, 10 parts, **116 items** (105 map to an
existing section, 12 insert new sections, 3 structural/provision —
items 44, 67, 92). Original Act = 324 sections; proposed = 338.

**Compilation nuance:** `act-proposed.json` is the official 6 May 2026
compilation, which incorporates **all** amendments in force by that date — for
this bill that's everything, but it also includes ss 181Z/181ZA from a separate
amendment and reflects the removal of s73ZS. This is fine and honest: Tab 2 is
the real current Act. Both tabs should caption their compilation date + FRL
link so the basis is transparent.

## App structure

- `index.html` — shell: header (brand, kind legend, theme toggle), equal
  split-pane (`#bill-body` left; right pane with Original/Proposed tabs), the
  reused plain-English bubble element. Sets `data-theme` before first paint.
- `css/app.css` — full design system: tokens (light + dark), all components,
  legislative-text indentation, the yellow `mark.match` highlight, the
  plain-English bubble, responsive fallback (panes stack < 940px).
- `js/app.js` — the engine. Loads the 4 JSON files, renders all three documents
  with safe DOM construction (never innerHTML), wires: tab switch (+ per-tab
  scroll memory), hover-link jump → tab switch + smooth scroll + section pulse
  + yellow highlight of the item's quotes, plain-English bubble on `.has-pe`
  paragraph hover, theme toggle (persisted to localStorage).

## Testing

- `sources/validate_data.py` — data-contract + cross-reference check; confirms
  every hover-link target resolves to a real section. Run after `build_data.py`.
- `sources/render_test.js` — headless jsdom render + interaction smoke test
  (14 checks: render counts, jump, highlight, tab switch, theme).
  Needs `npm install --no-save jsdom`; run `node sources/render_test.js`.
- Local preview: `python3 -m http.server` then open the printed URL (the app
  fetches JSON, so `file://` will not work).

## Plain-English data model

`data/plain-english.json` is keyed by either:
- `<version>:<blockId>` — version-specific (e.g. `proposed:s29-b5`). Required
  for sections the bill changes, because a block id can point to different
  text in each tab (e.g. removing a Note shifts every block below it).
- `<blockId>` — a shared translation, used in both tabs (for sections the bill
  leaves untouched). The engine tries the version-specific key first.

Keys beginning with `_` (e.g. `_about`) are metadata and ignored.

## Status

**Live:** https://clobots.github.io/2026-NDIS-Amemdments/

- ✅ **Task 1 — Sourcing.** Three full documents extracted to clean text.
- ✅ **Task 2 — Parse to JSON.** `build_data.py` + `data/*.json`, validated.
- ✅ **Task 3 — Design system.** `css/app.css`.
- ✅ **Task 4 — HTML shell.** `index.html`.
- ✅ **Task 5 — JS engine.** `js/app.js`; all render tests pass.
- ✅ **Task 6 — Integrate / test / deploy.** Committed, pushed, GitHub Pages
  live and verified (all assets 200).
- 🔄 **Task 7 — Plain-English translations.** Incremental; 182 done.
  - ✅ Batch 1 — Sch 2 Pt 1: s29 (before + after) + new s29A cooling-off (25).
  - ✅ Batch 2 — item 33 / s73B registration offences, before + after (28).
  - ✅ Batch 3 — item 80 / s73ZN banning orders — the new (2B)/(2C)
    expansion in full, the shared subsection anchors, and the repealed
    civil-penalty subsection (28).
  - ✅ Batch 4 — Sch 1 Pt 4 / new s73ZOA–C anti-promotion orders, in full (49).
  - ✅ Batch 5 — new offence & whistleblower sections in full: s59A
    (false/misleading info), s73ZNA (banning-order offences — replaces the
    repealed s73ZN(10)), s73ZBA (confidentiality of discloser identity) (52).
  - ✅ Batch 6 — s67B/67C/67D protected-information offences, before + after
    (the bill adds a civil-penalty pathway alongside each existing criminal
    offence) (67).
  - ✅ Batch 7 — s56 written notice of requirement + s57 refusal to comply,
    before + after (the new power to shorten info-gathering deadlines in
    urgent cases; a civil penalty added to s57) (42).
  - ✅ Batch 8 — s73F registration conditions (before + after; the new
    shorter-period power + "or documents") and the new s73ZDA NDIS Provider
    Register (structural blocks) (35).
  - ✅ Batch 9 — s73ZA whistleblower eligibility, before + after (extends
    protection to former workers/clients; removes the "give your name first"
    and "good faith" barriers) and s47A plan variation — the new "avoid
    doubt" clause confirming a variation can increase or decrease total
    funding (29).
  - ✅ Batch 10 — s9A approved forms + s45/s45A claims (Schedule 2 Pt 2,
    electronic claims forms): the new claim-information-request machinery
    in s45 ((3A)–(3E)), and the s9A/s45A hooks for approved electronic
    claim manners (28).

  - ✅ Batch 11 — completed s73ZN: the unchanged (3)–(9) banning-order
    procedure tail, both tabs (40).

  **All sections the bill substantively changes are fully covered.** What
  remains is only unchanged technical *tails* of large sections — the engine
  renders them fine without bubbles:
  - ⏭ s73ZDA register field lists (self-explanatory); s47A's ~100 unchanged
    plan-mechanics blocks; s45/s45A unchanged funding-cap sub-paragraphs.
    Optional polish only.
