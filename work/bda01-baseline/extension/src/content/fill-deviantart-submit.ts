/**
 * DeviantArt Studio submit fill — injected by the background worker on cross-post.
 * Reads pending package from extension storage, fills title/description/tags, attempts image attach.
 */
import { RELAY_API_BASE } from "../lib/constants";
import {
  notifyDistributionFillResult,
  readPendingAttemptId
} from "./fill-result-notify";
import {
  isFillableDeviantArtCrossPostPackage,
  parseDeviantArtCrossPostPackage,
  PENDING_CROSS_POST_STORAGE_KEY,
  type DeviantArtCrossPostPackage,
  type PatreonCrossPostMediaItem
} from "../lib/cross-post-types";

const WAIT_MS = 12_000;
const PHASE2_WAIT_MS = 65_000;
const POLL_MS = 200;
const BANNER_ID = "relay-cross-post-banner";
const MAX_IMAGES = 1;
const GRANT_STORAGE_KEY = "grant";

const BANNER_SUCCESS =
  "Draft filled from Relay. Review the deviation in DeviantArt, then publish manually.";
const BANNER_SUCCESS_WITH_IMAGES =
  "Draft and image filled from Relay. Review in DeviantArt, then publish manually.";
const BANNER_PARTIAL =
  "Relay filled part of the draft. Please review the highlighted missing field before publishing.";
const BANNER_ERROR = "Relay could not load the cross-post draft. Open Relay and try again.";
const BANNER_IMAGES_FALLBACK_PREFIX =
  "Relay filled the draft text. DeviantArt blocked automatic image attach. Upload this image manually:";
const BANNER_UPLOADING =
  "Relay is uploading your image to DeviantArt… Title and description will fill once the editor loads.";
const BANNER_WAITING_EDITOR =
  "Image uploaded. Waiting for DeviantArt's editor to load…";
const BANNER_PHASE2_TIMEOUT =
  "Image uploaded to DeviantArt drafts, but the editor didn't open automatically. Click 'Edit' on your latest draft to fill title and description.";

const TITLE_SELECTORS = [
  'input[name="title"]',
  'textarea[name="title"]',
  'input[placeholder*="Title" i]',
  'input[aria-label*="Title" i]'
];

const DESCRIPTION_SELECTORS = [
  'textarea[name="description"]',
  '.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  '[role="textbox"]'
];

const TAG_SELECTORS = [
  'input[name="tags"]',
  'textarea[name="tags"]',
  'input[placeholder*="tag" i]',
  'input[aria-label*="tag" i]'
];

const MEDIA_PREVIEW_SELECTORS = [
  'img[src^="blob:"]',
  '[class*="preview"] img',
  '[class*="Preview"] img',
  '[class*="upload"] img',
  '[class*="thumbnail"] img',
  '[data-testid*="preview"] img'
];

type ImageAttachOutcome = {
  imageCount: number;
  attachedCount: number;
  failedFilenames: string[];
};

type FillOutcome = {
  titleOk: boolean;
  bodyOk: boolean;
  tagsOk: boolean;
  imageOutcome: ImageAttachOutcome;
};

function isVisibleEnabled(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.disabled) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findBySelectors(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (isVisibleEnabled(el)) return el;
  }
  return null;
}

function findTitleCandidate(): HTMLElement | null {
  const direct = findBySelectors(TITLE_SELECTORS);
  if (direct) return direct;
  for (const el of document.querySelectorAll("input[type='text'], textarea")) {
    if (!isVisibleEnabled(el)) continue;
    const name = (el as HTMLInputElement).name?.toLowerCase() ?? "";
    const aria = el.getAttribute("aria-label")?.toLowerCase() ?? "";
    const placeholder = el.getAttribute("placeholder")?.toLowerCase() ?? "";
    if (name.includes("title") || aria.includes("title") || placeholder.includes("title")) {
      return el;
    }
  }
  return null;
}

function findDescriptionCandidate(): HTMLElement | null {
  const direct = findBySelectors(DESCRIPTION_SELECTORS);
  if (direct) return direct;
  for (const el of document.querySelectorAll("textarea")) {
    if (!isVisibleEnabled(el)) continue;
    const name = el.name?.toLowerCase() ?? "";
    const aria = el.getAttribute("aria-label")?.toLowerCase() ?? "";
    const placeholder = el.getAttribute("placeholder")?.toLowerCase() ?? "";
    if (
      name.includes("description") ||
      aria.includes("description") ||
      placeholder.includes("description")
    ) {
      return el;
    }
  }
  return null;
}

function findTagsCandidate(): HTMLElement | null {
  const direct = findBySelectors(TAG_SELECTORS);
  if (direct) return direct;
  const labels = [...document.querySelectorAll("label, div, span, p")].filter((el): el is HTMLElement => {
    return el instanceof HTMLElement && isVisibleEnabled(el) && visibleText(el).toLowerCase() === "tags";
  });
  for (const label of labels) {
    const labelRect = label.getBoundingClientRect();
    const nearby = [...document.querySelectorAll("input[type='text'], textarea")].filter(
      (el): el is HTMLElement => {
        if (!isVisibleEnabled(el)) return false;
        const rect = el.getBoundingClientRect();
        return rect.top >= labelRect.bottom && rect.top - labelRect.bottom < 90;
      }
    );
    if (nearby[0]) return nearby[0];
  }
  for (const el of document.querySelectorAll("input[type='text'], textarea")) {
    if (!isVisibleEnabled(el)) continue;
    const name = (el as HTMLInputElement).name?.toLowerCase() ?? "";
    const aria = el.getAttribute("aria-label")?.toLowerCase() ?? "";
    const placeholder = el.getAttribute("placeholder")?.toLowerCase() ?? "";
    if (
      name.includes("tag") ||
      aria.includes("tag") ||
      placeholder.includes("tag") ||
      placeholder.includes("rose") ||
      placeholder.includes("watercolor") ||
      placeholder.includes("fanart")
    ) {
      return el;
    }
  }
  return null;
}

function waitForCandidate(find: () => HTMLElement | null, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const found = find();
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(tick, POLL_MS);
    };
    tick();
  });
}

function setNativeInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function sanitizePostHtml(html: string): string {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "").trim();
}

function fillContentEditable(el: HTMLElement, text: string, html?: string): boolean {
  el.focus();
  const rich = html?.trim() ? sanitizePostHtml(html) : "";
  if (rich) {
    el.innerHTML = rich;
  } else {
    el.textContent = text;
  }
  el.dispatchEvent(
    new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertFromPaste" })
  );
  return Boolean((el.textContent ?? "").trim() || (el.innerHTML ?? "").trim());
}

function fillTitle(el: HTMLElement, title: string): boolean {
  const value = title.trim();
  if (!value) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeInputValue(el, value);
    return el.value.trim() === value;
  }
  if (el.isContentEditable) {
    return fillContentEditable(el, value);
  }
  return false;
}

function fillDescription(el: HTMLElement, bodyText: string, bodyHtml?: string): boolean {
  const text = bodyText.trim();
  const html = bodyHtml?.trim();
  if (!text && !html) return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeInputValue(el, text);
    return el.value.trim().length > 0;
  }
  if (el.isContentEditable) {
    return fillContentEditable(el, text, html);
  }
  return false;
}

function normalizeTag(tag: string): string {
  return tag.trim().replace(/^#/, "").toLowerCase();
}

function toDeviantArtTag(tag: string): string {
  // DeviantArt tags are tokenized keywords; spaces tend to trigger autocomplete
  // selection instead of creating the intended chip.
  return tag.trim().replace(/^#/, "").replace(/\s+/g, "").replace(/[^\w-]/g, "").toLowerCase();
}

function visibleText(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function isWithinTagInputArea(el: HTMLElement, input: HTMLInputElement | HTMLTextAreaElement): boolean {
  const inputRect = input.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const sameHorizontalBand =
    rect.bottom >= inputRect.top - 8 &&
    rect.top <= inputRect.bottom + 8 &&
    rect.left >= inputRect.left - 8 &&
    rect.right <= inputRect.right + 8;
  return sameHorizontalBand;
}

function selectedTagIsVisible(tag: string, input: HTMLInputElement | HTMLTextAreaElement): boolean {
  const normalized = normalizeTag(tag);
  if (!normalized) return true;
  const candidates = document.querySelectorAll("button, [role='button'], [class*='tag' i], [class*='Tag' i], span");
  for (const el of candidates) {
    if (!(el instanceof HTMLElement) || !isVisibleEnabled(el)) continue;
    if (!isWithinTagInputArea(el, input)) continue;
    const raw = visibleText(el);
    if (raw.includes("+")) continue;
    const text = normalizeTag(visibleText(el).replace(/[+×x]$/i, ""));
    if (text === normalized) return true;
  }
  return false;
}

function clickSuggestedTag(tag: string): boolean {
  const normalized = normalizeTag(tag);
  if (!normalized) return true;
  const candidates = document.querySelectorAll("button, [role='button']");
  for (const el of candidates) {
    if (!(el instanceof HTMLElement) || !isVisibleEnabled(el)) continue;
    const text = normalizeTag(visibleText(el).replace(/[+×x]$/i, ""));
    if (text === normalized) {
      el.click();
      return true;
    }
  }
  return false;
}

async function waitForTagVisible(
  tag: string,
  input: HTMLInputElement | HTMLTextAreaElement,
  timeoutMs = 1200
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (selectedTagIsVisible(tag, input)) return true;
    await new Promise((r) => window.setTimeout(r, 100));
  }
  return false;
}

function dispatchTagCommit(el: HTMLInputElement | HTMLTextAreaElement, key: "Enter" | "Tab" | ","): void {
  const code = key === "," ? "Comma" : key;
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, code }));
  el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key, code }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key, code }));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clearTagInput(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.focus();
  setNativeInputValue(el, "");
  el.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "deleteContentBackward" }));
}

async function typeIntoTagInput(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  clearTagInput(el);
  for (const char of value) {
    const nextValue = `${el.value}${char}`;
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: char }));
    el.dispatchEvent(new KeyboardEvent("keypress", { bubbles: true, cancelable: true, key: char }));
    setNativeInputValue(el, nextValue);
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: char
      })
    );
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: char }));
    await sleep(35);
  }
}

async function addTagToken(el: HTMLInputElement | HTMLTextAreaElement, tag: string): Promise<boolean> {
  const cleaned = toDeviantArtTag(tag);
  if (!cleaned) return true;
  if (selectedTagIsVisible(cleaned, el)) return true;

  el.scrollIntoView({ block: "center", inline: "nearest" });
  el.click();
  el.focus();
  await typeIntoTagInput(el, cleaned);
  // DeviantArt renders an autocomplete row before Enter creates the chip.
  await sleep(450);

  dispatchTagCommit(el, "Enter");
  if (await waitForTagVisible(cleaned, el)) return true;

  await typeIntoTagInput(el, cleaned);
  await sleep(450);
  dispatchTagCommit(el, "Enter");
  if (await waitForTagVisible(cleaned, el)) return true;

  await typeIntoTagInput(el, cleaned);
  await sleep(200);
  dispatchTagCommit(el, "Tab");
  el.blur();
  if (await waitForTagVisible(cleaned, el)) return true;

  if (clickSuggestedTag(cleaned) && await waitForTagVisible(cleaned, el)) return true;
  return waitForTagVisible(cleaned, el);
}

async function fillTags(el: HTMLElement, tags: string[]): Promise<boolean> {
  const cleaned = tags.map((tag) => tag.trim()).filter(Boolean);
  if (cleaned.length === 0) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    let ok = true;
    for (const tag of cleaned) {
      ok = (await addTagToken(el, tag)) && ok;
    }
    return ok;
  }
  return false;
}

function showBanner(message: string, tone: "success" | "warn" | "error"): void {
  document.getElementById(BANNER_ID)?.remove();
  const host = document.createElement("div");
  host.id = BANNER_ID;
  host.setAttribute("role", "status");
  host.style.cssText = [
    "position:fixed",
    "top:12px",
    "left:50%",
    "transform:translateX(-50%)",
    "z-index:2147483646",
    "max-width:min(560px,calc(100vw - 24px))",
    "padding:12px 40px 12px 14px",
    "border-radius:8px",
    "font:14px/1.4 system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.18)",
    tone === "success"
      ? "background:#ecfdf3;color:#14532d;border:1px solid #86efac"
      : tone === "warn"
        ? "background:#fffbeb;color:#78350f;border:1px solid #fcd34d"
        : "background:#fef2f2;color:#7f1d1d;border:1px solid #fca5a5"
  ].join(";");
  host.textContent = message;

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "×";
  dismiss.style.cssText =
    "position:absolute;top:6px;right:8px;border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;padding:4px;color:inherit";
  dismiss.addEventListener("click", () => host.remove());
  host.appendChild(dismiss);

  document.documentElement.appendChild(host);
}

function markMissing(el: HTMLElement | null): void {
  if (!el) return;
  el.style.outline = "2px solid #f59e0b";
  el.style.outlineOffset = "2px";
}

async function readPendingPackage(): Promise<DeviantArtCrossPostPackage | undefined> {
  const r = await chrome.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const raw = r[PENDING_CROSS_POST_STORAGE_KEY];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parseDeviantArtCrossPostPackage(raw);
  } catch {
    return undefined;
  }
}

async function clearPendingPackage(): Promise<void> {
  await chrome.storage.local.remove(PENDING_CROSS_POST_STORAGE_KEY);
}

async function readGrantToken(): Promise<string | undefined> {
  const r = await chrome.storage.local.get(GRANT_STORAGE_KEY);
  const raw = r[GRANT_STORAGE_KEY];
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const token = (raw as { token?: unknown }).token;
  return typeof token === "string" && token.trim() ? token.trim() : undefined;
}

function resolveContentUrl(contentUrl: string): string {
  const trimmed = contentUrl.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `${RELAY_API_BASE}${trimmed.startsWith("/") ? trimmed : `/${trimmed}`}`;
}

function partitionImages(media: PatreonCrossPostMediaItem[]): PatreonCrossPostMediaItem[] {
  return media
    .filter((item) => item.mime_type.toLowerCase().startsWith("image/"))
    .slice(0, MAX_IMAGES);
}

async function fetchImageFiles(
  items: PatreonCrossPostMediaItem[],
  token: string
): Promise<{ files: File[]; failedFilenames: string[] }> {
  const files: File[] = [];
  const failedFilenames: string[] = [];
  for (const item of items) {
    try {
      const res = await fetch(resolveContentUrl(item.content_url), {
        method: "GET",
        headers: {
          Accept: "image/*",
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        failedFilenames.push(item.filename || item.media_id);
        continue;
      }
      const blob = await res.blob();
      const type = item.mime_type.trim() || blob.type || "application/octet-stream";
      files.push(new File([blob], item.filename || `${item.media_id}.img`, { type }));
    } catch {
      failedFilenames.push(item.filename || item.media_id);
    }
  }
  return { files, failedFilenames };
}

function countMediaPreviewMarkers(): number {
  const seen = new Set<Element>();
  let count = 0;
  for (const selector of MEDIA_PREVIEW_SELECTORS) {
    for (const el of document.querySelectorAll(selector)) {
      if (seen.has(el)) continue;
      seen.add(el);
      count += 1;
    }
  }
  return count;
}

function findFileInputs(): HTMLInputElement[] {
  const inputs = [...document.querySelectorAll('input[type="file"]')].filter(
    (el): el is HTMLInputElement => el instanceof HTMLInputElement
  );
  const acceptImages = inputs.filter((input) => {
    const accept = (input.accept ?? "").toLowerCase();
    return !accept || accept.includes("image");
  });
  return acceptImages.length > 0 ? acceptImages : inputs;
}

function assignFilesToInput(input: HTMLInputElement, files: File[]): boolean {
  try {
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return input.files.length > 0;
  } catch {
    return false;
  }
}

function isSafeMediaAffordance(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
  if (/publish|submit|post now|schedule|delete|remove|cancel|sell|buy/.test(label)) {
    return false;
  }
  return /image|photo|media|attach|upload|browse|file|deviation/.test(label);
}

async function tryRevealFileInput(): Promise<HTMLInputElement | null> {
  const existing = findFileInputs()[0] ?? null;
  if (existing) return existing;

  const buttons = [...document.querySelectorAll("button, [role='button'], label")].filter(
    isSafeMediaAffordance
  );
  for (const button of buttons.slice(0, 6)) {
    button.click();
    await new Promise((r) => window.setTimeout(r, 400));
    const input = findFileInputs()[0] ?? null;
    if (input) return input;
  }
  return null;
}

async function waitForIncreasedMediaMarkers(baseline: number, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (countMediaPreviewMarkers() > baseline) {
      return true;
    }
    await new Promise((r) => window.setTimeout(r, POLL_MS));
  }
  return false;
}

async function attemptImageAttach(pkg: DeviantArtCrossPostPackage): Promise<ImageAttachOutcome> {
  const images = partitionImages(pkg.media);
  const outcome: ImageAttachOutcome = {
    imageCount: images.length,
    attachedCount: 0,
    failedFilenames: []
  };
  if (images.length === 0) {
    return outcome;
  }

  const token = await readGrantToken();
  if (!token) {
    outcome.failedFilenames = images.map((i) => i.filename || i.media_id);
    return outcome;
  }

  const { files, failedFilenames: fetchFailures } = await fetchImageFiles(images, token);
  outcome.failedFilenames.push(...fetchFailures);
  if (files.length === 0) {
    return outcome;
  }

  const input = await tryRevealFileInput();
  if (!input || !assignFilesToInput(input, files)) {
    outcome.failedFilenames = files.map((f) => f.name);
    return outcome;
  }

  const baseline = countMediaPreviewMarkers();
  await waitForIncreasedMediaMarkers(baseline);
  outcome.attachedCount = files.length;
  outcome.failedFilenames = [];
  return outcome;
}

function hasDescriptionContent(pkg: DeviantArtCrossPostPackage): boolean {
  return Boolean(pkg.body_text.trim() || pkg.body_html?.trim());
}

function buildBanner(outcome: FillOutcome): { message: string; tone: "success" | "warn" | "error" } {
  const { titleOk, bodyOk, tagsOk, imageOutcome } = outcome;
  if (!titleOk || !bodyOk || !tagsOk) {
    return { message: BANNER_PARTIAL, tone: "warn" };
  }

  if (imageOutcome.imageCount === 0) {
    return { message: BANNER_SUCCESS, tone: "success" };
  }

  if (imageOutcome.attachedCount > 0 && imageOutcome.failedFilenames.length === 0) {
    return { message: BANNER_SUCCESS_WITH_IMAGES, tone: "success" };
  }

  const failed =
    imageOutcome.failedFilenames.length > 0
      ? imageOutcome.failedFilenames.join(", ")
      : "attached image";
  return {
    message: `${BANNER_IMAGES_FALLBACK_PREFIX} ${failed}.`,
    tone: "warn"
  };
}

/**
 * After assigning the file, try to click the upload affordance button
 * to kick DeviantArt's internal state machine into processing the upload.
 */
function tryClickUploadAffordance(): void {
  const buttons = [...document.querySelectorAll("button, [role='button'], label, a")];
  for (const btn of buttons) {
    if (!(btn instanceof HTMLElement)) continue;
    const text = (btn.textContent ?? "").trim().toLowerCase();
    if (
      text === "upload your art" ||
      text === "upload" ||
      text === "submit" ||
      text.includes("upload your")
    ) {
      btn.click();
      return;
    }
  }
}

/**
 * Wait for Phase 2 — the metadata editor — by polling for a title input
 * that wasn't present during Phase 1 (upload screen).
 */
async function waitForPhase2TitleField(): Promise<HTMLElement | null> {
  const started = Date.now();
  while (Date.now() - started < PHASE2_WAIT_MS) {
    const el = findTitleCandidate();
    if (el) {
      // Verify it's actually fillable (not just a search bar)
      const placeholder = el.getAttribute("placeholder")?.toLowerCase() ?? "";
      const name = (el as HTMLInputElement).name?.toLowerCase() ?? "";
      if (name.includes("title") || placeholder.includes("title") || el.closest("form")) {
        return el;
      }
    }
    await new Promise((r) => window.setTimeout(r, POLL_MS));
  }
  return null;
}

function clickFirstVisibleMatching(
  selectors: string,
  predicate: (el: HTMLElement) => boolean
): boolean {
  const candidates = [...document.querySelectorAll(selectors)].filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      !el.closest(`#${BANNER_ID}`) &&
      isVisibleEnabled(el) &&
      predicate(el)
  );
  candidates.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const first = candidates[0];
  if (!first) return false;
  first.click();
  return true;
}

async function closeSubmitDialog(): Promise<boolean> {
  const clicked = clickFirstVisibleMatching(
    "button, [role='button'], a",
    (el) => {
      const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.trim().toLowerCase();
      return label === "×" || label === "x" || label.includes("close");
    }
  );
  if (clicked) {
    await new Promise((r) => window.setTimeout(r, 1000));
  }
  return clicked;
}

async function openLatestDraftEditor(): Promise<HTMLElement | null> {
  await closeSubmitDialog();
  const clicked = clickFirstVisibleMatching(
    "button, [role='button'], a",
    (el) => (el.textContent ?? "").trim().toLowerCase() === "edit"
  );
  if (!clicked) return null;
  return waitForPhase2TitleField();
}

async function runFill(): Promise<void> {
  const pkg = await readPendingPackage();
  if (!pkg || !isFillableDeviantArtCrossPostPackage(pkg)) {
    showBanner(BANNER_ERROR, "error");
    await notifyDistributionFillResult({
      attemptId: await readPendingAttemptId(),
      status: "fill_failed",
      fillResult: { page_url: window.location.href },
      errorCode: "package_missing"
    });
    await clearPendingPackage();
    return;
  }

  // Phase 1: Upload the image first
  const hasImages = partitionImages(pkg.media).length > 0;

  if (hasImages) {
    showBanner(BANNER_UPLOADING, "success");

    const imageOutcome = await attemptImageAttach(pkg);

    if (imageOutcome.attachedCount > 0) {
      // Try to trigger DA's transition to the metadata editor
      tryClickUploadAffordance();
      showBanner(BANNER_WAITING_EDITOR, "success");
    } else if (imageOutcome.failedFilenames.length > 0) {
      const failed = imageOutcome.failedFilenames.join(", ");
      showBanner(`${BANNER_IMAGES_FALLBACK_PREFIX} ${failed}.`, "warn");
    }

    // Phase 2: Wait for the metadata editor to appear
    const titleEl = await waitForPhase2TitleField();

    const fallbackTitleEl = titleEl ?? await openLatestDraftEditor();

    if (!fallbackTitleEl) {
      // Editor didn't appear — leave the pending package for a future retry.
      showBanner(BANNER_PHASE2_TIMEOUT, "warn");
      return;
    }

    // Editor is now visible — fill all fields
    await fillPhase2Fields(pkg, fallbackTitleEl);
  } else {
    // No images — try to fill fields directly (user may already be on the editor)
    const titleEl = await waitForCandidate(findTitleCandidate, WAIT_MS);
    await fillPhase2Fields(pkg, titleEl);
  }

  await clearPendingPackage();
}

async function fillPhase2Fields(
  pkg: DeviantArtCrossPostPackage,
  titleEl: HTMLElement | null
): Promise<void> {
  // Small delay to let DA's editor fully initialize
  await new Promise((r) => window.setTimeout(r, 500));

  // Re-find elements in case DOM shifted after editor loaded
  const actualTitleEl = titleEl ?? findTitleCandidate();
  const descriptionEl = hasDescriptionContent(pkg)
    ? await waitForCandidate(findDescriptionCandidate, 5000)
    : null;
  const tagsEl = pkg.tags.length > 0
    ? await waitForCandidate(findTagsCandidate, 5000)
    : null;

  const titleOk = actualTitleEl ? fillTitle(actualTitleEl, pkg.title) : false;
  const bodyOk = hasDescriptionContent(pkg)
    ? descriptionEl
      ? fillDescription(descriptionEl, pkg.body_text, pkg.body_html)
      : false
    : true;
  const tagsOk = pkg.tags.length > 0 ? (tagsEl ? await fillTags(tagsEl, pkg.tags) : false) : true;

  if (!titleOk) markMissing(actualTitleEl);
  if (!bodyOk) markMissing(descriptionEl);
  if (!tagsOk) markMissing(tagsEl);

  const imageOutcome: ImageAttachOutcome = {
    imageCount: partitionImages(pkg.media).length,
    attachedCount: partitionImages(pkg.media).length,
    failedFilenames: []
  };
  const banner = buildBanner({ titleOk, bodyOk, tagsOk, imageOutcome });
  showBanner(banner.message, banner.tone);

  const attemptId = await readPendingAttemptId();
  const allOk = titleOk && bodyOk && tagsOk;
  const anyOk = titleOk || bodyOk || tagsOk;
  await notifyDistributionFillResult({
    attemptId,
    status: allOk ? "fill_succeeded" : anyOk ? "fill_partial" : "fill_failed",
    fillResult: {
      title_ok: titleOk,
      body_ok: bodyOk,
      tags_ok: tagsOk,
      images_attached: imageOutcome.attachedCount,
      page_url: window.location.href
    }
  });
}

void runFill().catch(async () => {
  showBanner(BANNER_ERROR, "error");
  await notifyDistributionFillResult({
    attemptId: await readPendingAttemptId(),
    status: "fill_failed",
    fillResult: { page_url: window.location.href },
    errorCode: "script_error"
  });
  void clearPendingPackage();
});
