# Build Notes — NDIS 2026 Amendments Comparison Tool

Handoff / build-state doc. Read this first when resuming.

## ⚠️ ARCHITECTURE PIVOT — read this first

The **live site is now a two-live-iframe shell**, not the re-rendered
"annotated" app described in the rest of this file.

**What happened.** The original build re-rendered the legislation text in-app
because I believed parlinfo blocked iframe embedding. That belief was wrong —
I only ever tested *fetching* parlinfo (which 403s on bot user-agents); I never
tested *framing* it. A proper header check showed **neither parlinfo nor
legislation.gov.au sends `X-Frame-Options` or a CSP `frame-ancestors`** — both
embed fine. The user confirmed framing works in Chrome and chose to make both
panels live iframes.

**Current live site (`index.html` + `js/app.js` + `css/app.css`):**
- **Left** — live iframe of the Bill on ParlInfo (the user's original spec URL).
- **Right** — tabbed live iframes of the NDIS Act 2013 on the Federal Register:
  *Original* = the 2024-10-03 compilation (pre-amendment); *Proposed* = the
  2026-05-06 compilation (amendments in force). Proposed iframe is lazy-loaded
  on first tab activation.
- `js/app.js` now only does tab switching, lazy-load, per-frame loading
  overlays, and the theme toggle. **It cannot reach inside the iframes** —
  cross-origin same-origin policy. No DOM injection, highlighting or scroll-sync
  is possible against a live cross-origin frame.

**The interactions workstream.** The user will guide the development of the
hover-links / highlighting / plain-English-bubble interactions separately,
on top of (or alongside) the live-iframe shell. Everything that work needs is
**retained in the repo**:
- `data/*.json` — the parsed bill + both Act compilations, and the **1,276
  plain-English translations** (`data/plain-english.json`). Expensive content;
  do not delete.
- `sources/build_data.py`, `sources/validate_data.py` — the data pipeline.
- The full **re-rendered "annotated" engine** (the old `index.html`,
  `js/app.js`, `css/app.css` with rendering, hover-link jump, yellow
  highlighting and the plain-English bubble mechanism) is preserved in git
  history at commit **`4812870`** ("Add plain-English translations: batch 24").
  Recover it with `git show 4812870:js/app.js` etc. if the interactions work
  reuses it.

The rest of this document describes that **annotated engine** — still accurate
as a record of it, and as background for the interactions workstream — but it
is **not** what the live site currently runs.

---

## What the annotated engine was (historical / for interactions workstream)

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
  (Correction — see the pivot note above: parlinfo and legislation.gov.au
  *do* allow iframe embedding; only automated *fetching* of parlinfo/austlii
  is bot-blocked. The annotated engine still re-rendered from local data so it
  could inject the interactive layer, which a live cross-origin iframe cannot
  host.)

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

- `sources/render_test.js` — headless jsdom smoke test of the **live-iframe
  shell**: iframe srcs, lazy-load of the Proposed frame, tab switching, the
  "open on Federal Register" link following the active tab, theme toggle.
  Needs `npm install --no-save jsdom`; run `node sources/render_test.js`.
  (It does not load the cross-origin iframe content — that only happens in a
  real browser.)
- `sources/validate_data.py` — data-contract + cross-reference check for the
  retained `data/*.json` (the interactions workstream's inputs); confirms every
  bill item's target resolves and every plain-english key matches a real block.
- Local preview: `python3 -m http.server` then open the printed URL.

## Plain-English data model

`data/plain-english.json` is keyed by either:
- `<version>:<blockId>` — version-specific (e.g. `proposed:s29-b5`). Required
  for sections the bill changes, because a block id can point to different
  text in each tab (e.g. removing a Note shifts every block below it).
- `<blockId>` — a shared translation, used in both tabs (for sections the bill
  leaves untouched). The engine tries the version-specific key first.

Keys beginning with `_` (e.g. `_about`) are metadata and ignored.

## Status — all 7 tasks complete

**Live:** https://clobots.github.io/2026-NDIS-Amemdments/

- ✅ **Task 1 — Sourcing.** Three full documents extracted to clean text.
- ✅ **Task 2 — Parse to JSON.** `build_data.py` + `data/*.json`, validated.
- ✅ **Task 3 — Design system.** `css/app.css`.
- ✅ **Task 4 — HTML shell.** `index.html`.
- ✅ **Task 5 — JS engine.** `js/app.js`; all render tests pass.
- ✅ **Task 6 — Integrate / test / deploy.** Committed, pushed, GitHub Pages
  live and verified.
- ✅ **Task 7 — Plain-English translations.** 1,276 translations across 23
  batches. **Every block the bill changes is covered — 532/532 changed
  blocks, zero gaps** (verified by the changed-block coverage probe). Every
  new section is covered block-for-block; every substantively-changed section
  is covered in both tabs.

### Plain-English coverage — the deliberate scope

The bill touches **57 NDIS Act sections**. Coverage was driven by *what the
bill changes*, not raw block count:

- **Covered (1,276 translations):** all 532 genuinely changed blocks (new /
  removed / reworded), every new section end-to-end, every changed section in
  both tabs, plus surrounding-context anchors and the unchanged tails of the
  mid-size sections (s73ZN, s73ZDA, s45, s45A, s47A).
- **Deliberately not bubble-annotated (~1,050 blocks):** unchanged, self-
  describing reference content in the giant sections — s9 definitions (each
  already a plain-English sentence: *"child means a person under 18"*), the
  s99 reviewable-decisions table rows, and the s209 rules-category list. A
  bubble repeating a definition verbatim is noise, not value. This is a
  documented quality decision, consistent with "quality over completion".

Re-run the coverage probe any time: it lives inline in the batch-check
snippets in git history, or reconstruct it from `bill.json` affected sections
× `act-*.json` block text-diff. The rule: **every changed block must resolve
to a `plain-english.json` key.**

### Future polish (optional, not required)

The ~1,050 unchanged reference blocks could be given bubbles if a future
maintainer wants literal 100% block coverage — but see the rationale above
first. The engine renders them fine without bubbles today.
