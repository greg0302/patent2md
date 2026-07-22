// popup.js — builds the markdown from data the content script extracts,
// then either downloads it or copies it to the clipboard. Also handles
// the settings panel and remembers the user's last checkbox selections.

// --- Element references ---
const settingsBtn = document.getElementById("settingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const mainView = document.getElementById("mainView");
const settingsView = document.getElementById("settingsView");
const extractBtn = document.getElementById("extractBtn");
const copyBtn = document.getElementById("copyBtn");
const statusEl = document.getElementById("status");

const includeMetadataEl = document.getElementById("includeMetadata");
const includeAbstractEl = document.getElementById("includeAbstract");
const includeDescriptionEl = document.getElementById("includeDescription");
const includeClaimsEl = document.getElementById("includeClaims");
const includeReferencesEl = document.getElementById("includeReferences");
const askWhereToSaveEl = document.getElementById("askWhereToSave");
const rememberSelectionsEl = document.getElementById("rememberSelections");

function setStatus(message) {
  statusEl.textContent = message;
}

// --- Settings panel toggle ---
settingsBtn.addEventListener("click", () => {
  mainView.classList.add("hidden");
  settingsView.classList.remove("hidden");
});

closeSettingsBtn.addEventListener("click", () => {
  settingsView.classList.add("hidden");
  mainView.classList.remove("hidden");
});

// --- Settings persistence ---
// "Ask where to save each time" is OFF by default (silent auto-save to
// Downloads). We keep a plain in-memory copy alongside chrome.storage so
// downloadMarkdown() doesn't need an extra async read every time the user
// clicks Extract & Download.
let askWhereToSave = false;

chrome.storage.sync.get(["askWhereToSave"], (result) => {
  askWhereToSave = Boolean(result.askWhereToSave);
  askWhereToSaveEl.checked = askWhereToSave;
});

askWhereToSaveEl.addEventListener("change", () => {
  askWhereToSave = askWhereToSaveEl.checked;
  chrome.storage.sync.set({ askWhereToSave });
});

// --- Section checkbox memory ---
// "Remember my section selections" is ON by default. When on, the five
// section checkboxes below persist their last-used state via
// chrome.storage.sync, the same way the save-location checkbox does. When
// off, they always start from the HTML defaults baked into popup.html
// (Metadata/Abstract/Description/Claims on, References off), and changes
// stop being saved.
let rememberSelections = true;

const sectionCheckboxes = {
  includeMetadata: includeMetadataEl,
  includeAbstract: includeAbstractEl,
  includeDescription: includeDescriptionEl,
  includeClaims: includeClaimsEl,
  includeReferences: includeReferencesEl,
};

chrome.storage.sync.get(["rememberSelections"], (result) => {
  // Absent from storage (first ever run) means the default: ON.
  rememberSelections = result.rememberSelections !== false;
  rememberSelectionsEl.checked = rememberSelections;

  if (rememberSelections) {
    chrome.storage.sync.get(Object.keys(sectionCheckboxes), (sections) => {
      for (const [key, el] of Object.entries(sectionCheckboxes)) {
        if (typeof sections[key] === "boolean") {
          el.checked = sections[key];
        }
      }
    });
  }
});

rememberSelectionsEl.addEventListener("change", () => {
  rememberSelections = rememberSelectionsEl.checked;
  chrome.storage.sync.set({ rememberSelections });
});

for (const [key, el] of Object.entries(sectionCheckboxes)) {
  el.addEventListener("change", () => {
    if (rememberSelections) {
      chrome.storage.sync.set({ [key]: el.checked });
    }
  });
}

// --- Markdown building ---

// Render a value as a YAML-safe double-quoted string. Using
// JSON.stringify gives us correct escaping for quotes/backslashes for
// free, and a JSON string is also valid YAML.
function yamlString(value) {
  return JSON.stringify(value == null ? "" : String(value));
}

// Render an array as a YAML flow sequence, e.g. ["A", "B"].
function yamlArray(values) {
  return JSON.stringify(values || []);
}

function buildFrontmatter(data) {
  return [
    "---",
    `title: ${yamlString(data.title)}`,
    `publication_number: ${yamlString(data.publicationNumber)}`,
    `url: ${yamlString(data.url)}`,
    `inventors: ${yamlArray(data.inventors)}`,
    `assignee: ${yamlString(data.assignee)}`,
    `publication_date: ${yamlString(data.publicationDate)}`,
    `filing_date: ${yamlString(data.filingDate)}`,
    `priority_date: ${yamlString(data.priorityDate)}`,
    "---",
    "",
  ].join("\n");
}

// Show "—" for any field we couldn't find, instead of a blank line.
function orDash(value) {
  return value ? value : "—";
}

function buildMetadataSection(data) {
  const inventors = data.inventors && data.inventors.length ? data.inventors.join(", ") : "—";
  return [
    "## Metadata",
    "",
    `- **Publication number:** ${orDash(data.publicationNumber)}`,
    `- **URL:** ${orDash(data.url)}`,
    `- **Inventors:** ${inventors}`,
    `- **Assignee:** ${orDash(data.assignee)}`,
    `- **Publication date:** ${orDash(data.publicationDate)}`,
    `- **Filing date:** ${orDash(data.filingDate)}`,
    `- **Priority date:** ${orDash(data.priorityDate)}`,
    "",
  ].join("\n");
}

function buildAbstractSection(data) {
  return ["## Abstract", "", data.abstract || "—", ""].join("\n");
}

function buildDescriptionSection(data) {
  return ["## Description", "", data.description || "—", ""].join("\n");
}

// Flat numbered list (1., 2., 3. ...) — never nest dependent claims, per
// the project spec. Numbering is our own sequential count, not whatever
// numbering (if any) the source page used.
function buildClaimsSection(data) {
  const lines = ["## Claims", ""];
  if (data.claims && data.claims.length) {
    data.claims.forEach((claim, i) => {
      lines.push(`${i + 1}. ${claim}`, "");
    });
  } else {
    lines.push("—", "");
  }
  return lines.join("\n");
}

// References get their own numbering, separate from Claims, and always
// sit at the very bottom (guaranteed by buildMarkdown appending it last).
// Backward citations only: publication number + title.
function buildReferencesSection(data) {
  const lines = ["## References", ""];
  if (data.references && data.references.length) {
    data.references.forEach((ref, i) => {
      const title = ref.title ? ` — ${ref.title}` : "";
      lines.push(`${i + 1}. ${ref.publicationNumber}${title}`, "");
    });
  } else {
    lines.push("—", "");
  }
  return lines.join("\n");
}

// Read the current checkbox states from the popup UI.
function getSelectedOptions() {
  return {
    metadata: includeMetadataEl.checked,
    abstract: includeAbstractEl.checked,
    description: includeDescriptionEl.checked,
    claims: includeClaimsEl.checked,
    references: includeReferencesEl.checked,
  };
}

// Frontmatter is always included per the project spec, regardless of the
// Metadata checkbox — that checkbox only controls the human-readable
// "## Metadata" section.
function buildMarkdown(data, options) {
  let markdown = buildFrontmatter(data);
  markdown += `\n# ${orDash(data.title)}\n\n`;
  if (options.metadata) {
    markdown += buildMetadataSection(data);
  }
  if (options.abstract) {
    markdown += "\n" + buildAbstractSection(data);
  }
  if (options.description) {
    markdown += "\n" + buildDescriptionSection(data);
  }
  if (options.claims) {
    markdown += "\n" + buildClaimsSection(data);
  }
  if (options.references) {
    markdown += "\n" + buildReferencesSection(data);
  }
  return markdown;
}

// --- Filename ---

// Strip characters that aren't safe in a Windows/Mac/Linux filename.
function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "").trim();
}

function getFilename(data) {
  if (data.publicationNumber) {
    return sanitizeFilename(data.publicationNumber) + ".md";
  }
  if (data.title) {
    return sanitizeFilename(data.title).slice(0, 80) + ".md";
  }
  return "patent.md";
}

// --- Download ---

async function downloadMarkdown(markdown, filename) {
  const blob = new Blob([markdown], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs: askWhereToSave,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// --- Talking to the content script ---

async function getActivePatentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("patents.google.com")) {
    return null;
  }
  return tab;
}

async function extractFromActiveTab() {
  const tab = await getActivePatentTab();
  if (!tab) {
    throw new Error("NOT_A_PATENT_PAGE");
  }
  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "EXTRACT_PATENT_DATA",
  });
  if (!response || !response.success) {
    throw new Error("EXTRACTION_FAILED");
  }
  return response.data;
}

// Shared by both buttons: extract the active tab's patent data and turn
// it into the markdown string + filename the current checkboxes ask for.
async function buildMarkdownForActiveTab() {
  const data = await extractFromActiveTab();
  const options = getSelectedOptions();
  const markdown = buildMarkdown(data, options);
  const filename = getFilename(data);
  return { data, markdown, filename };
}

// Show the same friendly message for both buttons' failure cases.
function setStatusForError(err) {
  console.error(err);
  if (err.message === "NOT_A_PATENT_PAGE") {
    setStatus("Open a Google Patents page first.");
  } else {
    setStatus("Couldn't extract this page. Try reloading it and retry.");
  }
}

// --- Button handlers ---

extractBtn.addEventListener("click", async () => {
  setStatus("Extracting...");
  try {
    const { data, markdown, filename } = await buildMarkdownForActiveTab();
    await downloadMarkdown(markdown, filename);
    setStatus(`Extracted ${data.publicationNumber || filename} ✓`);
  } catch (err) {
    setStatusForError(err);
  }
});

copyBtn.addEventListener("click", async () => {
  setStatus("Extracting...");
  try {
    const { data, markdown } = await buildMarkdownForActiveTab();
    await navigator.clipboard.writeText(markdown);
    setStatus(`Copied ${data.publicationNumber || "markdown"} to clipboard ✓`);
  } catch (err) {
    setStatusForError(err);
  }
});
