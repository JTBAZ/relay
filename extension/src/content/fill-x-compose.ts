/**
 * X compose fill — injected by the background worker on cross-post.
 */
import { RELAY_API_BASE } from "../lib/constants";
import {
  isFillableXCrossPostPackage,
  parseXCrossPostPackage,
  PENDING_CROSS_POST_STORAGE_KEY,
  type PatreonCrossPostMediaItem,
  type XCrossPostPackage
} from "../lib/cross-post-types";
import {
  notifyDistributionFillResult,
  readPendingAttemptId,
  type DistributionImageAttachFailure,
  type DistributionImageAttachFailureReason
} from "./fill-result-notify";
import {
  composeFieldMatchesExpected,
  normalizeComposeTextForMatch,
  splitXPostTextForFill,
  type SplitXPostText,
  textTriggersHashtagTypeahead,
  typeaheadSettleTimeoutMs,
  verifyTimeoutMsForText
} from "./x-compose-fill-helpers";

const WAIT_MS = 12_000;
const POLL_MS = 200;
const BANNER_ID = "relay-cross-post-banner";
const GRANT_STORAGE_KEY = "grant";
const MAX_IMAGES = 4;

const COMPOSE_SELECTORS = [
  '[data-testid="tweetTextarea_0"]',
  'div[contenteditable="true"][role="textbox"]',
  'div[contenteditable="true"]'
];

const FILE_INPUT_SELECTORS = [
  '[data-testid="fileInput"]',
  'input[type="file"][accept*="image"]',
  'input[type="file"]'
];

const MEDIA_PREVIEW_SELECTORS = [
  '[data-testid="attachments"] img',
  '[data-testid="videoPlayer"]',
  '[data-testid="previewInterstitial"]',
  'div[aria-label*="Image"] img',
  '[class*="media"] img'
];

/** X compose hashtag/cashtag/user typeahead surfaces that can race paste verification. */
const TYPEAHEAD_SELECTORS = [
  '[data-testid="typeaheadDropdown"]',
  '[data-testid="TypeaheadHashtag"]',
  '[data-testid="TypeaheadCashtag"]',
  '[data-testid="TypeaheadUser"]'
];

type ImageAttachOutcome = {
  imageCount: number;
  attachedCount: number;
  failedFilenames: string[];
  imageFailures: DistributionImageAttachFailure[];
  attachMethod: "compose_paste" | "file_input" | null;
};

function pushImageFailure(
  outcome: ImageAttachOutcome,
  filename: string,
  reason: DistributionImageAttachFailureReason
): void {
  outcome.imageFailures.push({ filename, reason });
  if (!outcome.failedFilenames.includes(filename)) {
    outcome.failedFilenames.push(filename);
  }
}

function isVisible(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findComposeField(): HTMLElement | null {
  for (const selector of COMPOSE_SELECTORS) {
    const el = document.querySelector(selector);
    if (!isVisible(el)) continue;
    if (el instanceof HTMLElement && el.isContentEditable) return el;
    const editable = el.querySelector('[contenteditable="true"]');
    if (isVisible(editable) && editable instanceof HTMLElement && editable.isContentEditable) {
      return editable;
    }
  }
  return null;
}

function showBanner(message: string, tone: "success" | "error" | "partial"): void {
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "status");
    Object.assign(banner.style, {
      position: "fixed",
      bottom: "16px",
      right: "16px",
      zIndex: "2147483647",
      maxWidth: "320px",
      padding: "12px 14px",
      borderRadius: "8px",
      fontFamily: "system-ui, sans-serif",
      fontSize: "13px",
      lineHeight: "1.4",
      boxShadow: "0 8px 24px rgba(0,0,0,0.25)"
    });
    document.body.appendChild(banner);
  }
  banner.textContent = message;
  banner.style.background =
    tone === "success" ? "#064e3b" : tone === "partial" ? "#78350f" : "#7f1d1d";
  banner.style.color = "#f8fafc";
}

function isComposeFieldEmpty(el: HTMLElement): boolean {
  return !normalizeComposeTextForMatch(el.textContent ?? "");
}

function findComposeDialogRoot(el: HTMLElement): HTMLElement | null {
  const dialog = el.closest('[role="dialog"]');
  if (dialog instanceof HTMLElement) {
    return dialog;
  }
  const layer = el.closest('[data-testid="twc-cc-mask"]')?.parentElement;
  return layer instanceof HTMLElement ? layer : null;
}

/** True only when a known X compose typeahead dropdown is visible near the compose field. */
function isComposeTypeaheadOpen(composeField: HTMLElement): boolean {
  const scope = findComposeDialogRoot(composeField) ?? composeField;

  for (const selector of TYPEAHEAD_SELECTORS) {
    for (const candidate of scope.querySelectorAll(selector)) {
      if (isVisible(candidate)) {
        return true;
      }
    }
  }

  return false;
}

/** Dismiss compose typeahead only — never Escape on document (that closes the whole modal). */
function dismissComposeTypeahead(el: HTMLElement): void {
  if (!isComposeTypeaheadOpen(el)) {
    return;
  }

  el.focus();
  el.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: false,
      cancelable: true,
      key: "Escape",
      code: "Escape"
    })
  );
  el.dispatchEvent(
    new KeyboardEvent("keyup", {
      bubbles: false,
      cancelable: true,
      key: "Escape",
      code: "Escape"
    })
  );
}

async function waitForTypeaheadClosed(el: HTMLElement, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let dismissAttempts = 0;

  while (Date.now() < deadline) {
    if (!isComposeTypeaheadOpen(el)) {
      return;
    }

    if (dismissAttempts < 2) {
      dismissComposeTypeahead(el);
      dismissAttempts += 1;
    }

    await new Promise((r) => setTimeout(r, 100));
  }
}

async function waitForExpectedText(
  el: HTMLElement,
  expectedText: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (composeFieldMatchesExpected(el.textContent ?? "", expectedText)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return composeFieldMatchesExpected(el.textContent ?? "", expectedText);
}

async function settleComposeAfterInsert(el: HTMLElement, expectedText: string): Promise<boolean> {
  if (textTriggersHashtagTypeahead(expectedText)) {
    await waitForTypeaheadClosed(el, typeaheadSettleTimeoutMs(expectedText));
  }
  const matched = await waitForExpectedText(el, expectedText, verifyTimeoutMsForText(expectedText));
  if (matched && textTriggersHashtagTypeahead(expectedText)) {
    el.focus();
    moveComposeCursorToEnd(el);
    try {
      document.execCommand("insertText", false, " ");
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } catch {
      // Best-effort — user can tap space manually if Draft.js ignores synthetic input.
    }
  }
  return matched;
}

function shouldSkipInsertFallback(el: HTMLElement, expectedText: string): boolean {
  return composeFieldMatchesExpected(el.textContent ?? "", expectedText);
}

function moveComposeCursorToEnd(el: HTMLElement): void {
  el.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

type InsertComposeSegmentOptions = {
  clearFirst: boolean;
  append: boolean;
  expectedFull: string;
  expectedPartial?: string;
};

async function pasteSegmentIntoCompose(el: HTMLElement, segment: string): Promise<boolean> {
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", segment);
    const pasted = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    el.dispatchEvent(pasted);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

async function insertTextSegmentIntoCompose(el: HTMLElement, segment: string): Promise<boolean> {
  try {
    return document.execCommand("insertText", false, segment);
  } catch {
    return false;
  }
}

function segmentVerifyTarget(opts: InsertComposeSegmentOptions): string {
  return opts.expectedPartial ?? opts.expectedFull;
}

function segmentMatchesTarget(el: HTMLElement, opts: InsertComposeSegmentOptions): boolean {
  const target = segmentVerifyTarget(opts);
  if (opts.expectedPartial) {
    return composeFieldMatchesExpected(el.textContent ?? "", target);
  }
  return composeFieldMatchesExpected(el.textContent ?? "", opts.expectedFull);
}

/** Insert one compose segment (paste → insertText). No textContent fallback. */
async function insertComposeSegment(
  el: HTMLElement,
  segment: string,
  opts: InsertComposeSegmentOptions
): Promise<boolean> {
  if (!el.isContentEditable || !segment) {
    return segment ? false : segmentMatchesTarget(el, opts);
  }

  el.focus();
  el.click();

  if (opts.clearFirst) {
    await clearComposeField(el);
  } else if (opts.append || !isComposeFieldEmpty(el)) {
    moveComposeCursorToEnd(el);
  }

  const verifyTarget = segmentVerifyTarget(opts);

  if (await pasteSegmentIntoCompose(el, segment)) {
    if (await settleComposeAfterInsert(el, verifyTarget)) {
      return segmentMatchesTarget(el, opts);
    }
  }

  if (shouldSkipInsertFallback(el, opts.expectedFull)) {
    return settleComposeAfterInsert(el, opts.expectedFull);
  }

  if (opts.append || !opts.clearFirst) {
    moveComposeCursorToEnd(el);
  }

  if (await insertTextSegmentIntoCompose(el, segment)) {
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    if (await settleComposeAfterInsert(el, verifyTarget)) {
      return segmentMatchesTarget(el, opts);
    }
  }

  if (shouldSkipInsertFallback(el, opts.expectedFull)) {
    return settleComposeAfterInsert(el, opts.expectedFull);
  }

  return false;
}

async function fillSplitComposeField(
  el: HTMLElement,
  split: SplitXPostText,
  postText: string,
  mediaAttached: boolean
): Promise<boolean> {
  if (shouldSkipInsertFallback(el, postText)) {
    return true;
  }

  const clearFirst = !mediaAttached;

  if (split.body) {
    const bodyOk = await insertComposeSegment(el, split.body, {
      clearFirst,
      append: false,
      expectedFull: postText,
      expectedPartial: split.body
    });
    if (!bodyOk && !composeFieldMatchesExpected(el.textContent ?? "", split.body)) {
      return false;
    }
    await settleComposeAfterInsert(el, split.body);
  } else if (clearFirst) {
    await clearComposeField(el);
  }

  if (shouldSkipInsertFallback(el, postText)) {
    return true;
  }

  if (!split.tagLine) {
    return composeFieldMatchesExpected(el.textContent ?? "", postText);
  }

  const tagSegment = split.body ? `\n\n${split.tagLine}` : split.tagLine;
  const tagsOk = await insertComposeSegment(el, tagSegment, {
    clearFirst: false,
    append: Boolean(split.body),
    expectedFull: postText
  });

  if (tagsOk || shouldSkipInsertFallback(el, postText)) {
    return settleComposeAfterInsert(el, postText);
  }

  return false;
}

async function clearComposeField(el: HTMLElement): Promise<void> {
  el.focus();
  el.click();

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  try {
    document.execCommand("selectAll", false);
  } catch {
    // Fall through to delete attempt.
  }

  try {
    document.execCommand("delete", false);
  } catch {
    // Fall through to keyboard fallback.
  }

  el.dispatchEvent(new InputEvent("input", { bubbles: true }));

  if (!isComposeFieldEmpty(el)) {
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
        code: "Backspace"
      })
    );
    el.dispatchEvent(
      new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        key: "Backspace",
        code: "Backspace"
      })
    );
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  if (!isComposeFieldEmpty(el)) {
    try {
      document.execCommand("selectAll", false);
      document.execCommand("insertText", false, "");
    } catch {
      // Last resort for stubborn Draft.js states.
    }
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  await new Promise((r) => setTimeout(r, 50));
}

async function fillComposeField(
  el: HTMLElement,
  text: string,
  options: { clearFirst?: boolean; allowTextContentFallback?: boolean } = {}
): Promise<boolean> {
  const clearFirst = options.clearFirst ?? true;
  const allowTextContentFallback = options.allowTextContentFallback ?? true;
  el.focus();
  if (!el.isContentEditable) return false;
  el.click();
  const pasteText = text.trim();

  if (shouldSkipInsertFallback(el, pasteText)) {
    return true;
  }

  const segmentOk = await insertComposeSegment(el, pasteText, {
    clearFirst,
    append: false,
    expectedFull: pasteText
  });
  if (segmentOk) {
    return true;
  }

  if (!allowTextContentFallback) {
    return shouldSkipInsertFallback(el, pasteText);
  }

  if (clearFirst) {
    await clearComposeField(el);
  }

  try {
    el.textContent = pasteText;
    el.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: pasteText
      })
    );
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return settleComposeAfterInsert(el, pasteText);
  } catch {
    return false;
  }
}

async function fillComposeText(
  el: HTMLElement,
  postText: string,
  mediaAttached: boolean
): Promise<{ ok: boolean; mode: "split" | "single" }> {
  const split = splitXPostTextForFill(postText);
  const clearFirst = !mediaAttached;

  if (split.tagLine) {
    const ok = await fillSplitComposeField(el, split, postText, mediaAttached);
    return { ok, mode: "split" };
  }

  const ok = await fillComposeField(el, postText, {
    clearFirst,
    allowTextContentFallback: !textTriggersHashtagTypeahead(postText)
  });
  return { ok, mode: "single" };
}

async function readPendingPackage(): Promise<XCrossPostPackage | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY, (result) => {
      const raw = result[PENDING_CROSS_POST_STORAGE_KEY];
      if (raw === undefined || raw === null) {
        resolve(null);
        return;
      }
      try {
        resolve(parseXCrossPostPackage(raw));
      } catch {
        resolve(null);
      }
    });
  });
}

async function clearPending(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.remove(PENDING_CROSS_POST_STORAGE_KEY, () => resolve());
  });
}

async function readGrantToken(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.storage.local.get(GRANT_STORAGE_KEY, (result) => {
      const raw = result[GRANT_STORAGE_KEY];
      if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
        resolve(undefined);
        return;
      }
      const token = (raw as { token?: unknown }).token;
      resolve(typeof token === "string" && token.trim() ? token.trim() : undefined);
    });
  });
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
): Promise<{ files: File[]; failures: DistributionImageAttachFailure[] }> {
  const files: File[] = [];
  const failures: DistributionImageAttachFailure[] = [];
  for (const item of items) {
    const filename = item.filename || item.media_id;
    try {
      const res = await fetch(resolveContentUrl(item.content_url), {
        method: "GET",
        headers: {
          Accept: "image/*",
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        failures.push({ filename, reason: `fetch_failed:${res.status}` });
        continue;
      }
      const blob = await res.blob();
      const type = item.mime_type.trim() || blob.type || "application/octet-stream";
      files.push(new File([blob], item.filename || `${item.media_id}.img`, { type }));
    } catch {
      failures.push({ filename, reason: "fetch_failed:network" });
    }
  }
  return { files, failures };
}

function findFileInput(): HTMLInputElement | null {
  for (const selector of FILE_INPUT_SELECTORS) {
    const el = document.querySelector(selector);
    if (el instanceof HTMLInputElement) return el;
  }
  return null;
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

function tryPasteImages(target: HTMLElement, files: File[]): boolean {
  try {
    target.focus();
    target.click();
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    const pasted = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    target.dispatchEvent(pasted);
    target.dispatchEvent(new InputEvent("input", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

async function attachViaComposePaste(
  composeField: HTMLElement,
  files: File[],
  baseline: number
): Promise<boolean> {
  if (!tryPasteImages(composeField, files)) {
    return false;
  }
  if (await waitForIncreasedMediaMarkers(baseline)) {
    return true;
  }

  let attachedCount = 0;
  for (const file of files) {
    const markerBaseline = countMediaPreviewMarkers();
    if (!tryPasteImages(composeField, [file])) {
      continue;
    }
    if (await waitForIncreasedMediaMarkers(markerBaseline, 4000)) {
      attachedCount += 1;
    }
  }
  return attachedCount === files.length;
}

async function attachViaFileInput(
  files: File[],
  baseline: number
): Promise<
  | { ok: true }
  | { ok: false; reason: "no_file_input" | "assign_failed" | "preview_not_detected" }
> {
  const input = await tryRevealFileInput();
  if (!input) {
    return { ok: false, reason: "no_file_input" };
  }
  if (!assignFilesToInput(input, files)) {
    return { ok: false, reason: "assign_failed" };
  }

  const previewDetected = await waitForIncreasedMediaMarkers(baseline);
  if (previewDetected || input.files.length > 0) {
    return { ok: true };
  }
  return { ok: false, reason: "preview_not_detected" };
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

async function waitForIncreasedMediaMarkers(baseline: number, timeoutMs = 8000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (countMediaPreviewMarkers() > baseline) {
      return true;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return false;
}

function isSafeMediaAffordance(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
  if (/publish|submit|schedule|post now|tweet|send/.test(label)) {
    return false;
  }
  return /photo|image|media|attach|upload|video|gif/.test(label);
}

async function tryRevealFileInput(): Promise<HTMLInputElement | null> {
  const existing = findFileInput();
  if (existing) return existing;

  const buttons = [...document.querySelectorAll("button, [role='button'], label")].filter(
    isSafeMediaAffordance
  );
  for (const button of buttons.slice(0, 6)) {
    button.click();
    await new Promise((r) => setTimeout(r, 400));
    const input = findFileInput();
    if (input) return input;
  }
  return null;
}

async function attemptImageAttach(
  pkg: XCrossPostPackage,
  composeField: HTMLElement | null
): Promise<ImageAttachOutcome> {
  const images = partitionImages(pkg.media);
  const outcome: ImageAttachOutcome = {
    imageCount: images.length,
    attachedCount: 0,
    failedFilenames: [],
    imageFailures: [],
    attachMethod: null
  };
  if (images.length === 0) {
    return outcome;
  }

  const token = await readGrantToken();
  if (!token) {
    for (const item of images) {
      pushImageFailure(outcome, item.filename || item.media_id, "fetch_failed:no_grant");
    }
    return outcome;
  }

  const { files, failures: fetchFailures } = await fetchImageFiles(images, token);
  for (const failure of fetchFailures) {
    pushImageFailure(outcome, failure.filename, failure.reason);
  }
  if (files.length === 0) {
    return outcome;
  }

  const baseline = countMediaPreviewMarkers();

  if (composeField && (await attachViaComposePaste(composeField, files, baseline))) {
    outcome.attachedCount = files.length;
    outcome.failedFilenames = [];
    outcome.imageFailures = [];
    outcome.attachMethod = "compose_paste";
    return outcome;
  }

  const fileInputResult = await attachViaFileInput(files, baseline);
  if (fileInputResult.ok) {
    outcome.attachedCount = files.length;
    outcome.failedFilenames = [];
    outcome.imageFailures = [];
    outcome.attachMethod = "file_input";
    return outcome;
  }

  for (const file of files) {
    pushImageFailure(outcome, file.name, fileInputResult.reason);
  }
  return outcome;
}

function buildBannerMessage(textOk: boolean, imageOutcome: ImageAttachOutcome): {
  message: string;
  tone: "success" | "error" | "partial";
} {
  if (!textOk) {
    return {
      message:
        "Relay could not fill the compose field. Copy your draft from Relay and paste manually.",
      tone: "partial"
    };
  }

  if (imageOutcome.imageCount === 0) {
    return {
      message:
        "Draft filled from Relay on X. Review and post manually — Relay never publishes for you.",
      tone: "success"
    };
  }

  if (imageOutcome.attachedCount > 0 && imageOutcome.failedFilenames.length === 0) {
    return {
      message:
        "Draft and images filled from Relay on X. Review and post manually — Relay never publishes for you.",
      tone: "success"
    };
  }

  const failed =
    imageOutcome.failedFilenames.length > 0
      ? imageOutcome.failedFilenames.join(", ")
      : "attached images";
  return {
    message: `Relay filled the draft text. X blocked automatic image attach. Upload these manually: ${failed}.`,
    tone: "partial"
  };
}

async function waitForComposeField(): Promise<HTMLElement | null> {
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    const field = findComposeField();
    if (field) return field;
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  return null;
}

void (async () => {
  const pkg = await readPendingPackage();
  if (!pkg || !isFillableXCrossPostPackage(pkg)) {
    showBanner("Relay could not load the X cross-post draft.", "error");
    await clearPending();
    return;
  }

  const field = await waitForComposeField();
  if (!field) {
    showBanner(
      "Relay opened X but could not find the compose field. Paste your draft manually.",
      "partial"
    );
    await clearPending();
    return;
  }

  const imageOutcome = await attemptImageAttach(pkg, field);
  const mediaAttached = imageOutcome.attachedCount > 0;
  const textFill = await fillComposeText(field, pkg.post_text, mediaAttached);
  const textOk = textFill.ok;
  const banner = buildBannerMessage(textOk, imageOutcome);
  showBanner(banner.message, banner.tone);
  const attemptId = await readPendingAttemptId();
  await notifyDistributionFillResult({
    attemptId,
    status:
      banner.tone === "success"
        ? "fill_succeeded"
        : banner.tone === "partial"
          ? "fill_partial"
          : "fill_failed",
    fillResult: {
      post_text_ok: textOk,
      images_attached: imageOutcome.attachedCount,
      images_failed: imageOutcome.failedFilenames,
      image_failures: imageOutcome.imageFailures,
      attach_method: imageOutcome.attachMethod,
      text_fill_mode: textFill.mode,
      page_url: window.location.href
    }
  });
  await clearPending();
})();
