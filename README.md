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
  publication number (e.g. `US10123456B2.md`).
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
5. The status line confirms what happened, e.g. `Extracted US10123456B2 ✓`.

### Settings

Click the gear icon to open settings:

- **Remember my section selections** — on by default. Keeps your
  checkbox choices (Metadata/Abstract/Description/Claims/References)
  between popup opens. Turn it off to always start from the default
  selection instead.
- **Ask where to save each time** — off by default (silent save to
  Downloads). Turn it on to get a native Save As dialog on every export.

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
