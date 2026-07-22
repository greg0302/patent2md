# Patent Markdown Exporter

A Chrome extension that turns a [Google Patents](https://patents.google.com)
page into a clean Markdown (`.md`) file — handy for building a personal
knowledge base, feeding a RAG pipeline, or just keeping readable notes on
patents you're researching.

Works on both English-original and machine-translated (e.g. German →
English) patent pages.

## Features

- Extracts title, publication number, inventors, assignee, and key dates
  (publication / filing / priority) as YAML frontmatter plus a
  human-readable Metadata section.
- Extracts Abstract, Description (with original `[0001]`-style paragraph
  numbering preserved), and Claims (flattened into a clean numbered list).
- Optionally extracts backward References (patents this one cites).
- Toggle any section on/off per export — your last selection is
  remembered for next time.
- **Extract & Download** saves a `.md` file named after the patent's
  publication number (e.g. `US5443036A.md`).
- **Copy Markdown** copies the same output straight to your clipboard.
- Settings panel: choose silent auto-save to your Downloads folder, or a
  native Save As dialog every time.
- Automatically follows your browser's light/dark theme.

## Installing (unpacked)

This extension isn't on the Chrome Web Store — load it manually:

1. Download or clone this repository to a folder on your computer.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this folder.
5. The lightbulb icon should appear in your toolbar (pin it via the
   puzzle-piece icon if it's hidden).

## Usage

1. Open any patent on `patents.google.com`.
2. Click the extension icon.
3. Check the sections you want included (Metadata, Abstract, Description,
   Claims, References).
4. Click **Extract & Download** to save a `.md` file, or **Copy Markdown**
   to copy the text to your clipboard instead.
5. The status line confirms what happened, e.g. `Extracted US5443036A ✓`.

### Settings

Click the gear icon to open settings:

- **Remember my section selections** — on by default. Keeps your
  checkbox choices (Metadata/Abstract/Description/Claims/References)
  between popup opens. Turn it off to always start from the default
  selection instead.
- **Ask where to save each time** — off by default (silent save to
  Downloads). Turn it on to get a native Save As dialog on every export.

## Example output

Extracting [US5443036A](https://patents.google.com/patent/US5443036A/en) —
yes, this is a real patent — produces:

````markdown
---
title: "Method of exercising a cat"
publication_number: "US5443036A"
url: "https://patents.google.com/patent/US5443036A/en"
inventors: ["Kevin T. Amiss","Martin H. Abbott"]
assignee: "Individual"
publication_date: "1995-08-22"
filing_date: "1993-11-02"
priority_date: "1993-11-02"
---

# Method of exercising a cat

## Metadata

- **Publication number:** US5443036A
- **URL:** https://patents.google.com/patent/US5443036A/en
- **Inventors:** Kevin T. Amiss, Martin H. Abbott
- **Assignee:** Individual
- **Publication date:** 1995-08-22
- **Filing date:** 1993-11-02
- **Priority date:** 1993-11-02

## Abstract

A method for inducing cats to exercise consists of directing a beam of
invisible light produced by a hand-held laser apparatus onto the floor or
wall or other opaque surface in the vicinity of the cat, then moving the
laser so as to cause the bright pattern of light to move in an irregular
way fascinating to cats, and to any other animal with a chase instinct.

## Description

Technical Field

The present invention relates to recreational and amusement devices for
domestic animals and, more particularly, to a method for exercising and
entertaining cats.

*(...17 more paragraphs...)*

## Claims

1. A method of inducing aerobic exercise in an unrestrained cat
comprising the steps of: (a) directing an intense coherent beam of
invisible light produced by a hand-held laser apparatus to produce a
bright highly-focused pattern of light at the intersection of the beam
and an opaque surface, said pattern being of visual interest to a cat;
and (b) selectively redirecting said beam out of the cat's immediate
reach to induce said cat to run and chase said beam and pattern of light
around an exercise area.

2. The method of claim 1 wherein said bright pattern of light is small
in area relative to a paw of the cat.

*(...2 more claims...)*
````

## How it works (for the curious)

Google Patents renders its page content inside Polymer web components with
*closed* shadow roots, which hides the useful structured data
(`itemprop` microdata) from a live DOM query. To get around this, the
extension re-fetches the current page's own HTML and parses that instead
of reading the live page — the same approach older Python-based patent
scrapers used, just done from inside the browser. See
[`content.js`](content.js) for the full selector map and
[`CLAUDE.md`](CLAUDE.md) for the detailed build notes and quirks
discovered along the way (e.g. some patent offices' source documents
duplicate the Claims text inside the Description section — the extension
detects and trims that automatically).

## Limitations

- Only works on `patents.google.com` pages.
- Only tested against English-origin and German-origin patents.
- References only include *backward* citations (patents this one cites),
  not patents that cite this one.
- Priority date extraction has a best-effort fallback for pages where the
  usual structured field is missing; it may occasionally come up empty on
  unusual page layouts.

## Roadmap ideas

- Support additional source languages beyond English/German.
- Include forward citations ("Cited By") as an optional section.
- Bulk export across a list of patents.

## Project structure

```
manifest.json   Chrome extension manifest (Manifest V3)
popup.html      Popup UI markup
popup.css       Popup styling (incl. automatic dark mode)
popup.js        Popup logic: markdown building, settings, download/copy
content.js      Runs on patents.google.com; extracts structured patent data
icons/          Toolbar icon (lightbulb) at 16/32/48/128px
CLAUDE.md       Project constraints and build notes for future development
```

## License

[MIT](LICENSE).

The toolbar icon is Google's [Noto Emoji](https://github.com/googlefonts/noto-emoji)
💡 (Apache License 2.0), scaled down to 16/32/48/128px.
