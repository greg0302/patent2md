// content.js — Google Patents extraction.
//
// The comment block below documents where each field lives in the Google
// Patents DOM, ported from two reference Python/BeautifulSoup scrapers
// into vanilla JS query selectors. The extraction functions further down
// this file are built on this map.
//
// Sources consulted:
//   [R1] ryanlstevens/google_patent_scraper (main.py) — itemprop-heavy,
//        BeautifulSoup .find()/.find_all() calls on the single-patent
//        detail page.
//   [R2] CreepMania/Google-Patent-Scraper (Scraper.py) — class-name-heavy
//        (".style-scope.patent-text" / ".style-scope.patent-result"),
//        mixes single-patent-page scraping with search-result-card
//        scraping and a CSV of pre-fetched metadata.
//
// Both are a few years old, so classes especially may have drifted (Google
// regenerates most CSS class names). itemprop attributes are Google's own
// structured-data hooks (used for Google Search rich results), so they are
// far more likely to still be accurate — that's why itemprop is PRIMARY
// everywhere it's available, with R2's class names kept only as FALLBACK.
// Every field must degrade gracefully to "skip it" if neither matches.
//
// ---------------------------------------------------------------------
// TITLE
// ---------------------------------------------------------------------
//   Primary:  [itemprop="pageTitle"]
//             Not in either reference scraper directly, but it's Google's
//             structured-data hook for the title on the live detail page
//             (R1 only had meta[name="DC.title"] to work with; the itemprop
//             is the modern equivalent and matches our own live-DOM check).
//   Fallback: meta[name="DC.title"]  →  read the `content` attribute
//             [R1] soup.find('meta', attrs={'name': 'DC.title'})
//   Fallback: #title  (the page's <h1 id="title">, plain text)
//
// ---------------------------------------------------------------------
// PUBLICATION NUMBER
// ---------------------------------------------------------------------
//   Primary:  [itemprop="publicationNumber"]
//             [R1] single_citation.find('span', itemprop='publicationNumber')
//             — R1 uses this pattern inside citation table rows; the same
//             itemprop is used at the top of the detail page for the
//             patent's own number.
//
// ---------------------------------------------------------------------
// INVENTORS
// ---------------------------------------------------------------------
//   Primary:  dd[itemprop="inventor"]   (one <dd> per inventor)
//             [R1] soup.find_all('dd', itemprop='inventor')
//   Fallback: [data-inventor]
//             [R2] soup.find_all(attrs={'data-inventor': compile(r".*")})
//             — R2 uses this on search-result cards, not the detail page,
//             but it's a reasonable structural fallback to try.
//
// ---------------------------------------------------------------------
// ASSIGNEE (ORIGINAL / CURRENT)
// ---------------------------------------------------------------------
//   Primary:  dd[itemprop="assigneeOriginal"]
//             dd[itemprop="assigneeCurrent"]
//             [R1] soup.find_all('dd', itemprop='assigneeOriginal'/'assigneeCurrent')
//   Fallback: [data-assignee]
//             [R2] soup.find_all(attrs={'data-assignee': compile(r".*")})
//   Note: if assigneeCurrent is empty/missing, fall back to
//         assigneeOriginal as "the assignee" for the Markdown output.
//
// ---------------------------------------------------------------------
// PUBLICATION DATE / FILING DATE
// ---------------------------------------------------------------------
//   Primary:  dd[itemprop="publicationDate"], dd[itemprop="filingDate"]
//             [R1] soup.find('dd', itemprop='publicationDate'/'filingDate')
//   Fallback: time[itemprop="publicationDate"], time[itemprop="filingDate"]
//             — live Google Patents pages often render dates in a <time>
//             tag rather than <dd>; try both tag shapes with the same
//             itemprop.
//
// ---------------------------------------------------------------------
// PRIORITY DATE
// ---------------------------------------------------------------------
//   Primary:  [itemprop="priorityDate"]
//             — direct itemprop hook on the summary section (R1 didn't
//             have this directly; it instead looped the "Application
//             events" timeline looking for an event of type "priority"
//             and then read a sibling `time[itemprop="date"]`).
//   Fallback: [R1]-style event loop — find an element with
//             itemprop="type" whose text mentions "priority", then read
//             the nearby time[itemprop="date"] in that same event entry.
//
// ---------------------------------------------------------------------
// ABSTRACT
// ---------------------------------------------------------------------
//   Primary:  [itemprop="abstract"]
//             — full-text abstract section, lives inside a <patent-text>
//             component on the live page.
//   Fallback: .abstract.style-scope.patent-text  (container)
//             [R2] soup.find_all(class_='abstract style-scope patent-text')
//             Text lives in a nested .notranslate.style-scope.patent-text;
//             a nested .google-src-text.style-scope.patent-text sibling
//             holds the untranslated original — must be stripped (see
//             TRANSLATION HANDLING below).
//   Weakest fallback: meta[name="DC.description"] → `content` attribute
//             [R1] soup.find('meta', attrs={'name': 'DC.description'})
//             — only a single flattened line, last resort only.
//
// ---------------------------------------------------------------------
// DESCRIPTION
// ---------------------------------------------------------------------
//   Primary:  [itemprop="description"]
//             — paragraphs inside carry [0001]-style numbers as part of
//             their own text (sometimes also as a `num` attribute on the
//             paragraph element); preserve the numbering exactly as
//             printed, don't try to re-derive it.
//   Fallback: .description.style-scope.patent-text
//             [R2] soup.find_all(class_='description style-scope patent-text')
//             Same nested .notranslate / .google-src-text structure as
//             the abstract — strip .google-src-text.
//   Note: neither reference scraper actually extracts description text
//         in a usable form (R1 doesn't support it at all); this section
//         is the least proven and needs the most live-page testing.
//
// ---------------------------------------------------------------------
// CLAIMS
// ---------------------------------------------------------------------
//   Primary:  [itemprop="claims"]
//             — section containing individual claim entries; flatten to a
//             numbered list (1., 2., 3. ...) and do NOT try to reproduce
//             dependent-claim nesting.
//   Fallback: .claims.style-scope.patent-text
//             [R2] soup.find_all(class_='claims style-scope patent-text')
//             Same nested .notranslate / .google-src-text structure —
//             strip .google-src-text.
//   Note: like description, neither reference scraper fully extracts
//         claims text — treat this as a live-test-and-adjust field too.
//
// ---------------------------------------------------------------------
// BACKWARD CITATIONS / REFERENCES (patents THIS ONE cites)
// ---------------------------------------------------------------------
//   Primary:  tr[itemprop="backwardReferences"],
//             tr[itemprop="backwardReferencesFamily"]
//             [R1] soup.find_all('tr', itemprop='backwardReferences')
//                  soup.find_all('tr', itemprop='backwardReferencesFamily')
//             Each row: publication number via
//             span[itemprop="publicationNumber"], title in the row's
//             remaining text.
//   Fallback: #patentCitations heading → sibling traversal to the
//             citations table; row cells via
//             .td.style-scope.patent-result; result links via
//             [data-result^="patent/"].
//             [R1] soup.find('h3', id='patentCitations').next_sibling...
//   IMPORTANT: only backward references (patents cited BY this one) are
//   wanted. Ignore forward-citation itemprops/tables ("Cited By" — patents
//   that cite this one), e.g. anything named forwardReferences*.
//
// ---------------------------------------------------------------------
// TRANSLATION HANDLING (google-src-text)
// ---------------------------------------------------------------------
//   On translated (non-English-origin) patents, Google duplicates every
//   passage: the translated text plus the original language, wrapped in
//   an element carrying the google-src-text class
//   (R2: "google-src-text style-scope patent-text"; R1 doesn't handle
//   this at all — a gap we have to cover ourselves).
//   Rule: whenever reading text out of an abstract/description/claims
//   element, first remove/skip any descendant matching
//   [class*="google-src-text"] (substring match, in case Google appends
//   extra style-scope suffixes) so only ONE language remains in the
//   output. This matters for German-origin patents viewed in English
//   translation; it's a safe no-op for English-origin patents.
//   We only need to support English and German patents.
//
// ---------------------------------------------------------------------
// WHY THIS FILE NEVER QUERIES THE LIVE `document`
// ---------------------------------------------------------------------
//   Abstract/description/claims render inside a <patent-text> custom
//   element on the live page, and neither reference scraper had to deal
//   with this since they parse static fetched HTML, not a live DOM.
//   Confirmed by testing on real pages (one English, one German patent):
//   Google Patents hydrates the page into Polymer custom elements
//   (<search-app>, <browser-ui>, etc.) with CLOSED shadow roots. Closed
//   shadow roots can't be pierced by any public JS API, so by the time our
//   content script runs against the live `document`, every itemprop
//   attribute is invisible — document.querySelectorAll('[itemprop]')
//   returns zero matches, even though document.title is still correct
//   (that one comes from the <title> tag, not the hydrated content).
//
//   The server-rendered initial HTML (fetched fresh over HTTP) DOES still
//   contain all ~4600 itemprop attributes described above — this is
//   exactly what the Python reference scrapers were reading, since they
//   fetched raw HTML and never touched a live browser DOM. So instead of
//   reading `document`, we do the same thing they did: fetch the current
//   page's own URL, parse the response text with DOMParser into a
//   detached document, and run every selector against THAT.
//
//   One more gotcha found while testing: several itemprops (assigneeOriginal,
//   priorityDate, publicationDate, publicationNumber, ...) also appear
//   dozens/hundreds of times elsewhere on the page, inside the "Similar
//   Documents" / "Citations" / "Family" tables, where OTHER patents' data
//   carries the same itemprop names. Tag-scoping fixes this: the current
//   patent's own bibliography list uses <dd itemprop="..."> and
//   <time itemprop="..."> tags, while those other tables use
//   <span itemprop="..."> tags nested in <table> cells. So selectors like
//   dd[itemprop="assigneeOriginal"] or time[itemprop="publicationDate"]
//   (never the bare [itemprop="..."] attribute selector for these fields)
//   correctly return only the current patent's own value(s) and skip the
//   citation-table noise. This was verified directly against both the
//   English and German test patents.

// =========================================================================
// METADATA extraction.
// =========================================================================

// Fetch this page's own URL and parse it into a detached Document. We
// extract from THIS document, never from the live `document` — see
// "WHY THIS FILE NEVER QUERIES THE LIVE `document`" above.
async function fetchPatentDocument() {
  const response = await fetch(window.location.href, { credentials: "omit" });
  const html = await response.text();
  return new DOMParser().parseFromString(html, "text/html");
}

// Read the trimmed text content of the first element matching `selector`,
// or null if nothing matches. Every extractor function is built on this so
// a missing field never throws — it just comes back empty.
function getText(doc, selector) {
  const el = doc.querySelector(selector);
  return el ? el.textContent.trim() : null;
}

// Read a meta tag's `content` attribute, or null if the tag isn't there.
function getMetaContent(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el) return null;
  const value = el.getAttribute("content");
  return value ? value.trim() : null;
}

// --- Title ---
// Primary: itemprop="pageTitle". Fallbacks: DC.title meta tag, then #title.
//
// The raw pageTitle text is actually the whole browser-tab title, e.g.
// 'US11527783B2 - Battery state monitoring...\n        - Google Patents'
// (confirmed by live testing) — collapse the stray whitespace/newlines and
// strip the publication-number prefix + " - Google Patents" suffix so we
// keep just the patent's own title.
function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

function cleanTitle(rawTitle, publicationNumber) {
  if (!rawTitle) return null;
  let title = collapseWhitespace(rawTitle);
  title = title.replace(/-\s*Google Patents\s*$/i, "").trim();
  if (publicationNumber) {
    const escaped = publicationNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`^${escaped}\\s*-\\s*`), "").trim();
  }
  return title || null;
}

function extractTitle(doc) {
  return (
    getText(doc, '[itemprop="pageTitle"]') ||
    getMetaContent(doc, 'meta[name="DC.title"]') ||
    getText(doc, "#title")
  );
}

// --- Publication number ---
// Tag-scoped to <dd> so we don't also match publication numbers from the
// "Similar Documents" / "Citations" tables further down the page.
function extractPublicationNumber(doc) {
  return getText(doc, 'dd[itemprop="publicationNumber"]');
}

// --- Inventors (can be more than one) ---
function extractInventors(doc) {
  const nodes = doc.querySelectorAll('dd[itemprop="inventor"]');
  return Array.from(nodes)
    .map((node) => node.textContent.trim())
    .filter(Boolean);
}

// --- Assignee ---
// Prefer the current assignee; fall back to the original assignee if the
// patent has no recorded current one (common on freshly-filed patents).
function extractAssignee(doc) {
  const current = doc.querySelectorAll('dd[itemprop="assigneeCurrent"]');
  const original = doc.querySelectorAll('dd[itemprop="assigneeOriginal"]');
  const nodes = current.length ? current : original;
  const names = Array.from(nodes)
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  return names.length ? names.join(", ") : null;
}

// --- Dates ---
// Same itemprop can show up on a <dd> or a <time> element depending on the
// page layout, so we try both tag shapes. Both are tag-scoped (never the
// bare [itemprop="..."] selector) to avoid matching citation-table rows.
function extractDateByItemprop(doc, itemprop) {
  return (
    getText(doc, `dd[itemprop="${itemprop}"]`) ||
    getText(doc, `time[itemprop="${itemprop}"]`)
  );
}

function extractPublicationDate(doc) {
  return extractDateByItemprop(doc, "publicationDate");
}

function extractFilingDate(doc) {
  return extractDateByItemprop(doc, "filingDate");
}

// Priority date: the bare [itemprop="priorityDate"] selector is safe here
// (unlike the other dates) because it's confirmed to appear first in
// document order, before any citation tables — querySelector always
// returns the first match. Falls back to scanning the "Application
// events" timeline for an entry whose type mentions "priority", for pages
// where the direct itemprop is missing.
function extractPriorityDate(doc) {
  const direct = getText(doc, '[itemprop="priorityDate"]');
  if (direct) return direct;

  const typeNodes = doc.querySelectorAll('[itemprop="type"]');
  for (const typeNode of typeNodes) {
    if (typeNode.textContent.toLowerCase().includes("priority")) {
      const entry = typeNode.parentElement;
      const timeNode = entry ? entry.querySelector('time[itemprop="date"]') : null;
      if (timeNode) return timeNode.textContent.trim();
    }
  }
  return null;
}

// Gather every metadata field into one plain object.
function extractMetadata(doc) {
  const publicationNumber = extractPublicationNumber(doc);
  return {
    title: cleanTitle(extractTitle(doc), publicationNumber),
    publicationNumber,
    url: window.location.href,
    inventors: extractInventors(doc),
    assignee: extractAssignee(doc),
    publicationDate: extractPublicationDate(doc),
    filingDate: extractFilingDate(doc),
    priorityDate: extractPriorityDate(doc),
  };
}

// =========================================================================
// ABSTRACT + DESCRIPTION extraction.
//
// Live testing (one English-origin patent, one German-origin patent viewed
// in English machine translation) found TWO different underlying page
// structures depending on whether Google machine-translated the text:
//
//   Pattern A — native language (load-source="patent-office"): each
//   description paragraph is a <div class="description-paragraph"
//   num="0001"> with the paragraph NUMBER only in the `num` attribute, not
//   in the visible text. Section headings are separate <heading> tags.
//   No google-src-text spans (nothing to translate).
//
//   Pattern B — Google-machine-translated (load-source="google"): each
//   paragraph is a plain <p>, and the [0001]-style number is already part
//   of the translated text itself (inherited from the original filing's
//   own numbering convention). Every text-bearing element wraps its
//   content in <span class="notranslate"><span class="google-src-text">
//   ORIGINAL</span>TRANSLATED</span> — remove the google-src-text span
//   before reading textContent, or both languages end up concatenated.
//
// We try Pattern A first (it's unambiguous — those elements simply don't
// exist on a translated page) and fall back to Pattern B.
// =========================================================================

// Remove google-src-text spans from a clone of `node` and return the
// cleaned, whitespace-collapsed text. Cloning means we never mutate the
// shared parsed document. Safe to call on Pattern A content too — if there
// are no google-src-text spans, this is a no-op.
function cleanTranslatedText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[class*="google-src-text"]').forEach((el) => el.remove());
  return collapseWhitespace(clone.textContent);
}

// --- Abstract ---
function extractAbstract(doc) {
  const content = doc.querySelector('[itemprop="abstract"] [itemprop="content"]');
  if (!content) return null;
  const text = cleanTranslatedText(content);
  return text || null;
}

// --- Description ---
//
// Confirmed by live testing on the Austrian test patent: some patent
// offices' source documents bleed the Claims section, a trailing
// reference-numeral list, and a drawing-sheet count into the SAME content
// block as the Description — Google's own parsing duplicates the claims
// text as extra paragraph nodes appended after the real description body
// (reproduced identically in both Pattern A and Pattern B; the US test
// patent has no such trailing junk, so this is a no-op there).
//
// Real body paragraphs are always numbered — either via a `num` attribute
// (USPTO-style) or an inline "[0001]"-style text prefix (EPO/AT-style) —
// while the duplicated/back-matter junk is not. So after collecting
// candidate paragraph nodes, we trim everything after the LAST node that
// looks numbered.
function trimToLastNumberedParagraph(nodes, getText) {
  let lastIndex = -1;
  nodes.forEach((node, i) => {
    if (node.tagName.toLowerCase() === "heading") return;
    const looksNumbered = node.hasAttribute("num") || /^\[\d+\]/.test(getText(node));
    if (looksNumbered) lastIndex = i;
  });
  return lastIndex === -1 ? nodes : nodes.slice(0, lastIndex + 1);
}

// Class name(s) Google Patents uses for a native-language body paragraph
// div. Confirmed two so far — "description-paragraph" on most patents,
// "description-line" on a Ford-assigned US patent (US20170203654A1) that
// otherwise looks identical (same num attribute, same surrounding
// <heading> tags). If Description ever comes back empty/headings-only
// again on some other patent, check the raw HTML for a third class name
// and add it to this list.
const NATIVE_PARAGRAPH_SELECTOR = "div.description-paragraph, div.description-line";

function extractDescription(doc) {
  const content = doc.querySelector('[itemprop="description"] [itemprop="content"]');
  if (!content) return null;

  // Pattern A: numbered paragraph divs + separate heading tags. Checked
  // against paragraph nodes specifically (not headings) so a page with
  // headings but an undiscovered paragraph class name correctly falls
  // through to Pattern B below instead of silently returning headings only.
  const nativeParagraphNodes = content.querySelectorAll(NATIVE_PARAGRAPH_SELECTOR);
  if (nativeParagraphNodes.length) {
    const nativeNodes = Array.from(
      content.querySelectorAll(`heading, ${NATIVE_PARAGRAPH_SELECTOR}`)
    );
    const trimmed = trimToLastNumberedParagraph(nativeNodes, (node) => node.textContent.trim());
    const paragraphs = trimmed
      .map((node) => {
        const text = node.textContent.trim();
        if (!text) return null;
        if (node.tagName.toLowerCase() === "heading") return text;
        const num = node.getAttribute("num");
        return num ? `[${num}] ${text}` : text;
      })
      .filter(Boolean);
    return paragraphs.length ? paragraphs.join("\n\n") : null;
  }

  // Pattern B: machine-translated <p> tags, number already embedded in text.
  const translatedNodes = Array.from(content.querySelectorAll("heading, p"));
  const trimmed = trimToLastNumberedParagraph(translatedNodes, (node) => cleanTranslatedText(node));
  const paragraphs = trimmed.map((node) => cleanTranslatedText(node)).filter(Boolean);
  return paragraphs.length ? paragraphs.join("\n\n") : null;
}

// =========================================================================
// CLAIMS extraction.
//
// Live testing (native-language pages for both the US and AT test patents,
// plus the AT patent's English machine translation) found the same two
// structural patterns as Description:
//
//   Pattern A — native language: each claim is a <div class="claim"
//   num="N">. The `num` attribute selector naturally skips the outer
//   wrapper <div class="claim"> (no num attribute) that surrounds
//   dependent claims — confirmed the match count equals the page's own
//   itemprop="count" on all three test pages (19, 12, 12).
//
//   Pattern B — machine-translated: each claim is a <claim num="N"> tag
//   instead of a div, same google-src-text duplication as Description.
//
// Claim text already starts with its own number ("1. ...", "2. ...") in
// both patterns, but we strip that and re-number sequentially ourselves —
// this guarantees a clean flat "1. 2. 3." list per the project spec
// regardless of what numbering the source used internally.
// =========================================================================
function extractClaims(doc) {
  const content = doc.querySelector('[itemprop="claims"] [itemprop="content"]');
  if (!content) return [];

  let claimNodes = Array.from(content.querySelectorAll("div.claim[num]")); // Pattern A
  if (!claimNodes.length) {
    claimNodes = Array.from(content.querySelectorAll("claim[num]")); // Pattern B
  }

  return claimNodes
    .map((node) => cleanTranslatedText(node))
    .filter(Boolean)
    .map((text) => text.replace(/^\d+\.\s*/, ""));
}

// =========================================================================
// REFERENCES extraction (backward citations — patents THIS ONE cites —
// behind the References checkbox).
//
// Live testing on the US test patent found THREE separate citation tables
// with confusingly similar itemprop names, only one of which is what the
// project spec asks for:
//   - "Patent Citations"      -> tr[itemprop="backwardReferences"]
//     Patents this one cites. This is the one we want.
//   - "Family Cites Families" -> tr[itemprop="backwardReferencesFamily"]
//     Citations made by OTHER patents in the same family — not citations
//     made by this patent. Excluded.
//   - "Citations"             -> tr[itemprop="backwardReferencesOrig"]
//     A redundant subset of Patent Citations. Excluded.
// The AT test patent (a very recent filing) has zero rows in any of these
// tables — Google hasn't indexed citations for it yet — confirming the
// extraction needs to degrade gracefully to an empty list, not crash.
// =========================================================================
function extractReferences(doc) {
  const rows = doc.querySelectorAll('tr[itemprop="backwardReferences"]');
  return Array.from(rows)
    .map((row) => {
      const publicationNumber = getText(row, '[itemprop="publicationNumber"]');
      const title = getText(row, '[itemprop="title"]');
      return publicationNumber ? { publicationNumber, title } : null;
    })
    .filter(Boolean);
}

// Gather metadata + abstract + description + claims + references into one
// plain object.
function extractPatentData(doc) {
  return {
    ...extractMetadata(doc),
    abstract: extractAbstract(doc),
    description: extractDescription(doc),
    claims: extractClaims(doc),
    references: extractReferences(doc),
  };
}

// --- Messaging ---
// popup.js sends { type: "EXTRACT_PATENT_DATA" } and expects
// { success: true, data: {...} } back (or { success: false } on error).
// Extraction now involves a fetch(), so it's async — we return `true` to
// tell Chrome to keep the message channel open until sendResponse() fires.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "EXTRACT_PATENT_DATA") {
    fetchPatentDocument()
      .then((doc) => {
        sendResponse({ success: true, data: extractPatentData(doc) });
      })
      .catch((error) => {
        console.error("Patent Markdown Exporter: extraction failed", error);
        sendResponse({ success: false });
      });
    return true; // keep sendResponse valid across the async fetch
  }
});
