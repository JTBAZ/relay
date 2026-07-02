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
  readPendingAttemptId
} from "./fill-result-notify";

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

type ImageAttachOutcome = {
  imageCount: number;
  attachedCount: number;
  failedFilenames: string[];
};

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

async function fillComposeField(el: HTMLElement, text: string): Promise<boolean> {
  el.focus();
  if (!el.isContentEditable) return false;
  el.click();
  const pasteText = text.trim();
  const expected = pasteText.slice(0, Math.min(20, pasteText.length));
  const waitForExpectedText = async (timeoutMs = 800) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if ((el.textContent ?? "").includes(expected)) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return (el.textContent ?? "").includes(expected);
  };
  const closeAutocompleteSoon = () => {
    window.setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, cancelable: true, key: "Escape", code: "Escape" }));
    }, 250);
  };

  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", pasteText);
    const pasted = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    el.dispatchEvent(pasted);
    el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    if (await waitForExpectedText()) {
      closeAutocompleteSoon();
      return true;
    }
  } catch {
    // Fall through to insertText.
  }

  try {
    const inserted = document.execCommand("insertText", false, pasteText);
    if (inserted) {
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      closeAutocompleteSoon();
      return waitForExpectedText();
    }
  } catch {
    // Fall through to direct text assignment.
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
    closeAutocompleteSoon();
    return waitForExpectedText();
  } catch {
    return false;
  }
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

async function attemptImageAttach(pkg: XCrossPostPackage): Promise<ImageAttachOutcome> {
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
    outcome.failedFilenames.push(...files.map((f) => f.name));
    return outcome;
  }

  const baseline = countMediaPreviewMarkers();
  const previewDetected = await waitForIncreasedMediaMarkers(baseline);
  if (previewDetected || input.files.length > 0) {
    outcome.attachedCount = files.length;
    outcome.failedFilenames = [];
  } else {
    outcome.failedFilenames = files.map((f) => f.name);
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

  const textOk = await fillComposeField(field, pkg.post_text);
  const imageOutcome = await attemptImageAttach(pkg);
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
      page_url: window.location.href
    }
  });
  await clearPending();
})();
