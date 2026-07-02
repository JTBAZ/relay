/**
 * Patreon post editor fill — injected by the background worker on cross-post.
 * Reads pending package from extension storage, fills title/body, attempts image attach, shows banner.
 */
import {
  isFillablePatreonCrossPostPackage,
  parsePatreonCrossPostPackage,
  PENDING_CROSS_POST_STORAGE_KEY,
  type PatreonCrossPostMediaItem,
  type PatreonCrossPostPackage
} from "../lib/cross-post-types";
import { RELAY_API_BASE } from "../lib/constants";
import {
  notifyDistributionFillResult,
  readPendingAttemptId
} from "./fill-result-notify";

const WAIT_MS = 10_000;
const POLL_MS = 200;
const BANNER_ID = "relay-cross-post-banner";
const MAX_IMAGES = 10;
const GRANT_STORAGE_KEY = "grant";

const BANNER_SUCCESS =
  "Draft filled from Relay. Review the post in Patreon, then publish manually.";
const BANNER_SUCCESS_WITH_IMAGES =
  "Draft and images filled from Relay. Review in Patreon, then publish manually.";
const BANNER_PARTIAL =
  "Relay filled part of the draft. Please review the highlighted missing field before publishing.";
const BANNER_ERROR =
  "Relay could not load the cross-post draft. Open Relay and try again.";
const BANNER_IMAGES_FALLBACK_PREFIX =
  "Relay filled the draft text. Patreon blocked automatic image attach. Download or upload these images manually:";

const TITLE_SELECTORS = [
  'input[name="title"]',
  'textarea[name="title"]',
  '[data-testid="post-title-field"] input',
  '[data-testid="post-title-field"] textarea'
];

const BODY_SELECTORS = [
  '.ProseMirror[contenteditable="true"]',
  '[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"]',
  '[role="textbox"]'
];

const MEDIA_PREVIEW_SELECTORS = [
  'img[src^="blob:"]',
  '[data-testid*="media"] img',
  '[data-testid*="attachment"]',
  '[class*="MediaCard"]',
  '[class*="media-card"]',
  '[class*="upload"] img'
];

type ImageAttachOutcome = {
  imageCount: number;
  attachedCount: number;
  failedFilenames: string[];
  skippedNonImageFilenames: string[];
  limitSkippedCount: number;
};

function isVisibleEnabled(el: Element | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  if (el.disabled) return false;
  const style = getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findTitleCandidate(): HTMLElement | null {
  for (const selector of TITLE_SELECTORS) {
    const el = document.querySelector(selector);
    if (isVisibleEnabled(el)) return el;
  }
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

function findBodyCandidate(): HTMLElement | null {
  for (const selector of BODY_SELECTORS) {
    const el = document.querySelector(selector);
    if (isVisibleEnabled(el)) return el;
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

function fillBody(el: HTMLElement, bodyText: string, bodyHtml?: string): boolean {
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

async function readPendingPackage(): Promise<PatreonCrossPostPackage | undefined> {
  const r = await chrome.storage.local.get(PENDING_CROSS_POST_STORAGE_KEY);
  const raw = r[PENDING_CROSS_POST_STORAGE_KEY];
  if (raw === undefined || raw === null) return undefined;
  try {
    return parsePatreonCrossPostPackage(raw);
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

function partitionPackageMedia(media: PatreonCrossPostMediaItem[]): {
  images: PatreonCrossPostMediaItem[];
  skippedNonImageFilenames: string[];
  limitSkippedCount: number;
} {
  const images: PatreonCrossPostMediaItem[] = [];
  const skippedNonImageFilenames: string[] = [];
  for (const item of media) {
    if (!item.mime_type.toLowerCase().startsWith("image/")) {
      skippedNonImageFilenames.push(item.filename || item.media_id);
      continue;
    }
    images.push(item);
  }
  const limitSkippedCount = Math.max(0, images.length - MAX_IMAGES);
  return {
    images: images.slice(0, MAX_IMAGES),
    skippedNonImageFilenames,
    limitSkippedCount
  };
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

function tryPasteImages(target: HTMLElement, files: File[]): boolean {
  try {
    target.focus();
    const dt = new DataTransfer();
    for (const file of files) {
      dt.items.add(file);
    }
    const pasted = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    });
    return target.dispatchEvent(pasted);
  } catch {
    return false;
  }
}

function isSafeMediaAffordance(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const label = `${el.textContent ?? ""} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
  if (/publish|submit|schedule|paywall|delete|remove|cancel|post now/.test(label)) {
    return false;
  }
  return /image|photo|media|attach|upload|gallery/.test(label);
}

async function tryRevealFileInputViaMediaButton(): Promise<HTMLInputElement | null> {
  const buttons = [...document.querySelectorAll("button, [role='button']")].filter(isSafeMediaAffordance);
  for (const button of buttons.slice(0, 6)) {
    button.click();
    await new Promise((r) => window.setTimeout(r, 400));
    const inputs = findFileInputs();
    if (inputs.length > 0) {
      return inputs[0] ?? null;
    }
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

async function attachViaSingleFileInput(
  files: File[],
  baseline: number
): Promise<"attached" | "attempted" | "unavailable"> {
  const existingInput = findFileInputs()[0] ?? null;
  const input = existingInput ?? (await tryRevealFileInputViaMediaButton());
  if (!input) {
    return "unavailable";
  }

  if (!assignFilesToInput(input, files)) {
    return "attempted";
  }

  // Patreon may take several seconds to render previews after the file input change event.
  // Whether preview detection succeeds or not, do not try another strategy: repeated attempts
  // can create duplicate gallery/body images from a single Relay payload.
  return (await waitForIncreasedMediaMarkers(baseline)) ? "attached" : "attempted";
}

async function attemptImageAttach(
  pkg: PatreonCrossPostPackage,
  bodyEl: HTMLElement | null
): Promise<ImageAttachOutcome> {
  const { images, skippedNonImageFilenames, limitSkippedCount } = partitionPackageMedia(pkg.media);
  const outcome: ImageAttachOutcome = {
    imageCount: images.length,
    attachedCount: 0,
    failedFilenames: [],
    skippedNonImageFilenames,
    limitSkippedCount
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

  const baseline = countMediaPreviewMarkers();
  const fileInputResult = await attachViaSingleFileInput(files, baseline);
  if (fileInputResult !== "unavailable") {
    // If assigning to Patreon's file input succeeds, treat the handoff as successful even when
    // preview detection misses the async React render. A false fallback is worse than a reviewable
    // "images sent" banner because the creator can see the editor before publishing.
    outcome.attachedCount = files.length;
    outcome.failedFilenames = [];
    return outcome;
  }

  // Last resort only when Patreon exposes no file input path. This can place media in the body,
  // so it is deliberately not combined with file-input upload.
  if (bodyEl && tryPasteImages(bodyEl, files) && (await waitForIncreasedMediaMarkers(baseline))) {
    outcome.attachedCount = files.length;
    outcome.failedFilenames = [];
    return outcome;
  }

  outcome.failedFilenames = files.map((f) => f.name);
  return outcome;
}

function buildSuccessBanner(
  imageOutcome: ImageAttachOutcome,
  titleOk: boolean,
  bodyOk: boolean
): { message: string; tone: "success" | "warn" | "error" } {
  if (!titleOk || !bodyOk) {
    return { message: BANNER_PARTIAL, tone: "warn" };
  }

  const notes: string[] = [];
  if (imageOutcome.skippedNonImageFilenames.length > 0) {
    notes.push(
      `Non-image attachments were skipped: ${imageOutcome.skippedNonImageFilenames.join(", ")}.`
    );
  }
  if (imageOutcome.limitSkippedCount > 0) {
    notes.push(`${imageOutcome.limitSkippedCount} additional image(s) were omitted (v1 limit ${MAX_IMAGES}).`);
  }

  if (imageOutcome.imageCount === 0) {
    const base = BANNER_SUCCESS;
    return { message: notes.length ? `${base} ${notes.join(" ")}` : base, tone: "success" };
  }

  if (imageOutcome.attachedCount > 0 && imageOutcome.failedFilenames.length === 0) {
    const base = BANNER_SUCCESS_WITH_IMAGES;
    return { message: notes.length ? `${base} ${notes.join(" ")}` : base, tone: "success" };
  }

  const failedNames =
    imageOutcome.failedFilenames.length > 0
      ? imageOutcome.failedFilenames.join(", ")
      : "attached images";
  const fallback = `${BANNER_IMAGES_FALLBACK_PREFIX} ${failedNames}.`;
  return { message: notes.length ? `${fallback} ${notes.join(" ")}` : fallback, tone: "warn" };
}

async function runFill(): Promise<void> {
  console.log("[relay:post-link] (content) fill-patreon-editor script running", {
    url: window.location.href,
    t: Date.now()
  });
  const pkg = await readPendingPackage();
  console.log("[relay:post-link] (content) pending package read", {
    found: Boolean(pkg),
    fillable: pkg ? isFillablePatreonCrossPostPackage(pkg) : false,
    t: Date.now()
  });
  if (!pkg || !isFillablePatreonCrossPostPackage(pkg)) {
    showBanner(BANNER_ERROR, "error");
    await clearPendingPackage();
    return;
  }

  const [titleEl, bodyEl] = await Promise.all([
    waitForCandidate(findTitleCandidate, WAIT_MS),
    waitForCandidate(findBodyCandidate, WAIT_MS)
  ]);

  const titleOk = titleEl ? fillTitle(titleEl, pkg.title) : false;
  const bodyOk = bodyEl ? fillBody(bodyEl, pkg.body_text, pkg.body_html) : false;

  if (!titleOk) markMissing(titleEl);
  if (!bodyOk) markMissing(bodyEl);

  const imageOutcome = await attemptImageAttach(pkg, bodyEl);
  const banner = buildSuccessBanner(imageOutcome, titleOk, bodyOk);
  showBanner(banner.message, banner.tone);

  const attemptId = await readPendingAttemptId();
  console.log("[relay:post-link] (content) notify start", { attemptId, t: Date.now() });
  await notifyDistributionFillResult({
    attemptId,
    status: titleOk && bodyOk ? "fill_succeeded" : titleOk || bodyOk ? "fill_partial" : "fill_failed",
    fillResult: {
      title_ok: titleOk,
      body_ok: bodyOk,
      images_attached: imageOutcome.attachedCount,
      page_url: window.location.href
    }
  });
  console.log("[relay:post-link] (content) notify resolved", { attemptId, t: Date.now() });

  await clearPendingPackage();
  console.log("[relay:post-link] (content) pending package cleared", { attemptId, t: Date.now() });
}

void runFill().catch(() => {
  showBanner(BANNER_ERROR, "error");
  void clearPendingPackage();
});
