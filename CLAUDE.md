# Patent Markdown Exporter — Project Memory

Chrome extension (Manifest V3) that exports a Google Patents page into a clean
Markdown (.md) file for use in a RAG / knowledge base.

**Status:** all 8 build steps complete (see "Incremental build plan" below
for what each covered). The extension is fully functional; remaining work
is polish/enhancement, not core functionality.

## Hard constraints (do not violate)

- Manifest V3 only.
- Plain HTML, CSS, vanilla JavaScript only. No React, no TypeScript, no npm,
  no build tools, no backend, no API, no AI.
- Beginner-readable, well-commented code.
- Google Patents only (patents.google.com).
- Simple, maintainable architecture — no unnecessary abstractions.
- Build INCREMENTALLY, one checkpoint at a time. Stop after each step and
  wait for the user to test before continuing. No TODOs or omitted code —
  every step must be complete and working on its own.

## File structure

```
manifest.json
popup.html
popup.css
popup.js
content.js
icons/          (icon16.png, icon32.png, icon48.png, icon128.png)
README.md
```

## Popup UI

- Checkboxes: Metadata, Abstract, Description, Claims, References.
  - References defaults OFF. All others default ON.
- Buttons: "Extract & Download", "Copy Markdown".
- Status line showing result, e.g. "Extracted US10123456B2 ✓".
- Gear icon opens a small settings panel.
- NO markdown preview area in the popup — never render the markdown there.

## Settings panel

- Persisted via `chrome.storage.sync`.
- Two checkboxes:
  - "Remember my section selections" — ON by default. When on, the five
    section checkboxes (Metadata/Abstract/Description/Claims/References)
    persist their last-used state across popup opens via
    `chrome.storage.sync`. When off, they always reset to the HTML
    defaults baked into `popup.html` (Metadata/Abstract/Description/Claims
    on, References off) and changes stop being saved. Absent from storage
    (very first run) is treated as ON.
  - "Ask where to save each time" — OFF by default.
    - OFF: silent auto-save to Downloads via
      `chrome.downloads.download({ saveAs: false })`.
    - ON: native Save-As dialog via
      `chrome.downloads.download({ saveAs: true })`.
- No subfolder field, no custom paths.

One related behavior that is NOT a settings-panel checkbox — don't turn
this into a UI toggle, it's meant to be automatic: light/dark theme
follows the OS/browser via the CSS `prefers-color-scheme` media query in
`popup.css`. Deliberately chosen over a manual switch to avoid an extra
setting for something the platform already provides for free.

## Selector strategy (Google Patents DOM)

**Critical, confirmed by live testing in Step 3: never query the live
`document`.** Google Patents hydrates into Polymer custom elements with
CLOSED shadow roots, which erase every `itemprop` attribute from what
`document.querySelectorAll` can see (title still works only because it
comes from `document.title`, not the hydrated markup). The fix:
`content.js` fetches the current page's own URL
(`fetch(window.location.href)`) and parses the response with
`DOMParser().parseFromString(html, "text/html")` into a detached document,
then runs every selector against THAT, never against `document`. This
mirrors what the two reference Python scrapers did (they scraped raw
fetched HTML too, never a live browser DOM).

Also confirmed: fields like `assigneeOriginal`, `priorityDate`,
`publicationDate`, and `publicationNumber` reappear dozens/hundreds of
times elsewhere on the page inside "Similar Documents" / "Citations" /
"Family" tables (other patents' data, same itemprop names). The current
patent's own bibliography uses `<dd itemprop="...">` / `<time
itemprop="...">` tags; the noisy duplicates live in `<span
itemprop="...">` inside `<table>` cells. Tag-scoping the selector (e.g.
`dd[itemprop="assigneeOriginal"]`, `time[itemprop="publicationDate"]`)
reliably excludes the noise — never use the bare `[itemprop="..."]`
attribute selector for these fields. (`priorityDate` is the one exception:
it's confirmed to appear first in document order, so a bare
`querySelector('[itemprop="priorityDate"]')` is fine.)

Google Patents' CSS classes are auto-generated/unstable. Prefer `itemprop`
microdata attributes as the PRIMARY selector for every field; fall back to a
class-based or structural selector if the itemprop is missing. If neither
matches, skip that field gracefully — extraction must never crash on a
missing section.

**Confirmed by live testing in Step 4: the Description section can contain
duplicated Claims text.** On the Austrian test patent (both native `/de`
and machine-translated `/en` views), Google's own parsing appends the
entire Claims section, a reference-numeral list, and a drawing-sheet count
as extra paragraph nodes inside `[itemprop="description"]`'s own content
block, AFTER the real description body — this is Google's data quality
issue, not a selector mistake. The US test patent has no such trailing
junk. The fix (implemented in `content.js`'s `trimToLastNumberedParagraph`):
real body paragraphs are always numbered (via a `num` attribute, USPTO
style, or an inline `[0001]`-style text prefix, EPO/AT style); trim
everything after the last node that looks numbered. Worth re-checking this
same trimming need when Step 5 (Claims) is built, in case Claims has an
analogous duplication problem in the other direction.

**Confirmed by a third real-world patent (US20170203654A1, Ford) found
after the initial two-patent test round: Google Patents has more than one
class name for the exact same native-language body-paragraph div.** Most
patents use `div.description-paragraph`; this one used
`div.description-line` instead — otherwise identical structure (same
`num` attribute, same surrounding `<heading>` tags). The original
selector only checked for `description-paragraph`, so Description came
back headings-only (silently "worked" — no crash, just empty body text).
Fixed by checking a small list of known class names
(`NATIVE_PARAGRAPH_SELECTOR` in `content.js`) instead of one hardcoded
class, and by gating the "Pattern A matched" decision on finding actual
*paragraph* nodes rather than just `<heading>` nodes (a page with
headings but zero recognized paragraph nodes now correctly falls through
to Pattern B instead of returning headings-only). **Lesson: two test
patents was not enough to find every rendering variant — if Description
ever comes back empty/headings-only again, check the raw HTML for yet
another class name and add it to that list.**

The full selector map (ported from two reference Python/BeautifulSoup
scrapers) lives as a comment block at the top of `content.js`. Summary:

- Title: `itemprop="pageTitle"` fallback `<h1 id="title">`.
- Publication number: `itemprop="publicationNumber"`.
- Inventors: `dd[itemprop="inventor"]` (one `<dd>` per inventor).
- Assignee (original): `dd[itemprop="assigneeOriginal"]`.
- Assignee (current): `dd[itemprop="assigneeCurrent"]`, falls back to
  original if a patent has no recorded current assignee.
- Publication / filing date: `dd[itemprop="..."]` falling back to
  `time[itemprop="..."]` — tag-scoped like the fields above.
- Priority date: bare `[itemprop="priorityDate"]` is safe (see note above
  on why this one field doesn't need tag-scoping).
- Abstract: `[itemprop="abstract"] [itemprop="content"]`.
- Description: `[itemprop="description"] [itemprop="content"]`. Two page
  structures depending on translation status — see `extractDescription()`
  in `content.js` for the full Pattern A / Pattern B breakdown and the
  `trimToLastNumberedParagraph` duplication fix.
- Claims: `[itemprop="claims"] [itemprop="content"]`, then
  `div.claim[num]` (native-language pages) or `claim[num]` (machine-
  translated pages) — flattened to our own sequential numbered list, not
  the source's internal numbering.
- Backward citations / references: `tr[itemprop="backwardReferences"]`
  rows only (the page's "Patent Citations" table) — patents THIS ONE
  cites. Two similarly-named itemprops exist and must NOT be used:
  `backwardReferencesFamily` ("Family Cites Families" — citations made by
  OTHER patents in the same family) and `backwardReferencesOrig`
  ("Citations" — a redundant subset). Each row: publication number via
  `span[itemprop="publicationNumber"]`, title via
  `td[itemprop="title"]`.
- `google-src-text` spans hold the ORIGINAL untranslated language on
  translated (non-English-origin) patents and duplicate every passage.
  These must be stripped so only one language remains. We only need to
  support English and German patents.

(See the top-of-file comment in `content.js` for the detailed,
source-cited version of this map.)

## Extraction (content.js)

Fields: title, publication number, patent URL, inventors, assignee,
publication date, filing date, priority date, abstract, description, claims,
references. Organize into small reusable functions, one per field or field
group. `content.js` returns structured JSON (a plain object) to `popup.js`
via message passing — no inline rendering in the content script.

## Markdown output format

1. YAML frontmatter, always included:
   ```
   ---
   title: ...
   publication_number: ...
   url: ...
   inventors: [ ... ]
   assignee: ...
   publication_date: ...
   filing_date: ...
   priority_date: ...
   ---
   ```
2. `# Title`
3. `## Metadata` — same info as frontmatter, human-readable.
4. `## Abstract`
5. `## Description` — keep `[0001]`-style paragraph numbers as-is, full text.
6. `## Claims` — flat numbered list (1., 2., 3. ...), never nest dependent
   claims.
7. `## References` — only if the References checkbox is on; always placed at
   the very bottom; own numbering separate from claims; backward citations
   only (patents this one cites): publication number + title.

## Filename

Publication number (e.g. `US10123456B2.md`). Fallback chain: publication
number → title → `patent.md`.

## Export behavior

- "Extract & Download": build markdown, then save per the settings checkbox
  (silent save to Downloads, or Save-As dialog if the setting is on).
- "Copy Markdown": copy the generated markdown text to the clipboard.

## Incremental build plan

1. `manifest.json` + `popup.html` + `popup.css` + minimal `popup.js` (UI
   only, buttons inert) + this `CLAUDE.md`. Stop — user loads unpacked
   extension and checks the popup looks right.
2. Fetch and read two reference Python scrapers, port their selector
   knowledge into a SELECTOR MAP (comment block in `content.js`, no
   extraction functions yet). Stop — user sanity-checks the map.
3. `content.js` extracts ONLY metadata; wire up popup↔content messaging.
   "Extract & Download" produces a `.md` with frontmatter + `## Metadata`
   only. Stop — user tests on one English and one German real patent page.
4. Add Abstract + Description extraction. Stop and test.
5. Add Claims extraction. Stop and test.
6. Add References extraction (behind its checkbox). Stop and test.
7. Add the settings panel (save-as checkbox, `chrome.storage`). Stop and
   test.
8. "Copy Markdown" button + README polish + final cleanup.

At every step: explain what changed, then wait for the user before moving
on.

## Reference scrapers consulted (Step 2)

- https://raw.githubusercontent.com/ryanlstevens/google_patent_scraper/master/google_patent_scraper/main.py
- https://raw.githubusercontent.com/CreepMania/Google-Patent-Scraper/master/Scraper.py

These are a few years old — selectors may have drifted. They provide a
starting map; live testing on real pages catches whatever Google has since
changed.
