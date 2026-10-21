/**
 * Post-publish link confirmation toast — injected on platform tabs after URL detection.
 */
import browser from "../lib/browser";
import {
  MSG_POST_LINK_CONFIRM,
  MSG_POST_LINK_DISMISS,
  MSG_POST_LINK_GET_ACTIVE_WATCH
} from "../lib/messages";
import type { CrossPostDestination } from "../lib/cross-post-types";
import { detectPublishedPostMatch, type PostLinkWatch } from "../lib/post-link-patterns";

const TOAST_HOST_ID = "relay-post-link-toast-root";
const AUTO_DISMISS_MS = 15_000;

const DESTINATION_LABEL: Record<CrossPostDestination, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt"
};

function truncateUrl(url: string, max = 52): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

/**
 * Background is authoritative on "which watch belongs to this tab" (it knows the real
 * tab id via the message sender, which content scripts cannot query for themselves).
 * The page-side URL check below is a defense-in-depth sanity check, not the source of truth.
 */
async function resolveWatchForCurrentPage(): Promise<PostLinkWatch | null> {
  let response: { ok?: boolean; watch?: PostLinkWatch | null } | undefined;
  try {
    response = (await browser.runtime.sendMessage({
      type: MSG_POST_LINK_GET_ACTIVE_WATCH
    })) as typeof response;
  } catch {
    return null;
  }

  const watch = response?.watch;
  if (!watch) return null;

  const pageMatch = detectPublishedPostMatch(window.location.href);
  if (!pageMatch || pageMatch.destination !== watch.destination) return null;

  return watch;
}

function removeToastHost(): void {
  document.getElementById(TOAST_HOST_ID)?.remove();
}

async function sendConfirm(watch: PostLinkWatch): Promise<void> {
  if (!watch.canonical_url) return;
  try {
    await browser.runtime.sendMessage({
      type: MSG_POST_LINK_CONFIRM,
      attempt_id: watch.attempt_id,
      canonical_url: watch.canonical_url,
      external_id: watch.external_id
    });
  } catch {
    /* background may be unavailable */
  }
}

async function sendDismiss(attemptId: string): Promise<void> {
  try {
    await browser.runtime.sendMessage({
      type: MSG_POST_LINK_DISMISS,
      attempt_id: attemptId
    });
  } catch {
    /* background may be unavailable */
  }
}

function renderToast(watch: PostLinkWatch): void {
  if (document.getElementById(TOAST_HOST_ID)) return;

  const host = document.createElement("div");
  host.id = TOAST_HOST_ID;
  host.style.all = "initial";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });
  const platform = DESTINATION_LABEL[watch.destination];
  const urlLabel = truncateUrl(watch.canonical_url ?? watch.candidate_url ?? window.location.href);

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <style>
      :host, * { box-sizing: border-box; }
      .relay-toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 32px));
        border: 1px solid rgba(0, 170, 111, 0.35);
        border-radius: 12px;
        background: #111;
        color: #f5f5f5;
        box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        overflow: hidden;
      }
      .relay-toast__body { padding: 14px 14px 10px; }
      .relay-toast__brand {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: #00aa6f;
      }
      .relay-toast__brand-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #00aa6f;
        flex-shrink: 0;
      }
      .relay-toast__text {
        margin: 0;
        font-size: 13px;
        line-height: 1.45;
        color: #f0f0f0;
      }
      .relay-toast__title {
        font-weight: 700;
        color: #fff;
      }
      .relay-toast__url {
        margin: 8px 0 0;
        font-size: 11px;
        line-height: 1.35;
        color: rgba(255, 255, 255, 0.55);
        word-break: break-all;
      }
      .relay-toast__actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 0 14px 12px;
      }
      .relay-toast__btn {
        border: 0;
        border-radius: 8px;
        padding: 7px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .relay-toast__btn:focus-visible {
        outline: 2px solid #00aa6f;
        outline-offset: 2px;
      }
      .relay-toast__btn--dismiss {
        background: rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.75);
      }
      .relay-toast__btn--confirm {
        background: #00aa6f;
        color: #001a11;
      }
      .relay-toast__progress {
        height: 3px;
        background: rgba(255, 255, 255, 0.08);
      }
      .relay-toast__progress-bar {
        height: 100%;
        width: 100%;
        background: #00aa6f;
        transform-origin: left center;
        transition: transform ${AUTO_DISMISS_MS}ms linear;
      }
    </style>
    <div class="relay-toast" role="dialog" aria-live="polite" aria-label="Link post to Relay">
      <div class="relay-toast__body">
        <div class="relay-toast__brand">
          <span class="relay-toast__brand-dot" aria-hidden="true"></span>
          Relay
        </div>
        <p class="relay-toast__text">
          Link <span class="relay-toast__title"></span> on ${platform} to Relay?
        </p>
        <p class="relay-toast__url"></p>
      </div>
      <div class="relay-toast__actions">
        <button type="button" class="relay-toast__btn relay-toast__btn--dismiss" data-action="dismiss">
          Not now
        </button>
        <button type="button" class="relay-toast__btn relay-toast__btn--confirm" data-action="confirm">
          ✓ Link
        </button>
      </div>
      <div class="relay-toast__progress" aria-hidden="true">
        <div class="relay-toast__progress-bar"></div>
      </div>
    </div>
  `;

  const titleEl = wrap.querySelector(".relay-toast__title");
  const urlEl = wrap.querySelector(".relay-toast__url");
  if (titleEl) titleEl.textContent = watch.relay_post_title;
  if (urlEl) urlEl.textContent = urlLabel;

  shadow.appendChild(wrap);

  let settled = false;
  const settle = (fn: () => void) => {
    if (settled) return;
    settled = true;
    fn();
  };

  const dismissBtn = wrap.querySelector('[data-action="dismiss"]');
  const confirmBtn = wrap.querySelector('[data-action="confirm"]');
  const progressBar = wrap.querySelector(".relay-toast__progress-bar") as HTMLElement | null;

  dismissBtn?.addEventListener("click", () => {
    settle(() => {
      void sendDismiss(watch.attempt_id);
      removeToastHost();
    });
  });

  confirmBtn?.addEventListener("click", () => {
    settle(() => {
      void sendConfirm(watch);
      removeToastHost();
    });
  });

  requestAnimationFrame(() => {
    if (progressBar) progressBar.style.transform = "scaleX(0)";
  });

  window.setTimeout(() => {
    settle(removeToastHost);
  }, AUTO_DISMISS_MS);
}

async function main(): Promise<void> {
  const watch = await resolveWatchForCurrentPage();
  if (!watch) return;
  renderToast(watch);
}

void main();
