import type { CrossPostDestination } from "./lib/cross-post-types";
import { detectPublishedPostMatch } from "./lib/post-link-patterns";
import {
  isPostLinkWatchExpired,
  listPostLinkWatches
} from "./lib/post-link-watch";
import type { PostLinkWatch } from "./lib/post-link-patterns";
import { MSG_POST_LINK_CONFIRM, MSG_POST_LINK_FORGET } from "./lib/messages";
import browser from "./lib/browser";

const DESTINATION_LABEL: Record<CrossPostDestination, string> = {
  patreon: "Patreon",
  x: "X",
  deviantart: "DeviantArt"
};

const PLACEHOLDER_URL: Record<CrossPostDestination, string> = {
  patreon: "https://www.patreon.com/posts/…",
  x: "https://x.com/you/status/…",
  deviantart: "https://www.deviantart.com/you/art/…"
};

function el(
  tag: string,
  props: Record<string, string | undefined>,
  ...children: (Node | string)[]
): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value !== undefined) node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export async function renderPostLinkFallbackSections(
  container: HTMLElement,
  onChanged: () => Promise<void>
): Promise<void> {
  const watches = await listPostLinkWatches();
  if (watches.length === 0) return;

  for (const watch of watches) {
    container.append(buildPostLinkSection(watch, onChanged));
  }
}

function buildPostLinkSection(watch: PostLinkWatch, onChanged: () => Promise<void>): HTMLElement {
  const platform = DESTINATION_LABEL[watch.destination];
  const expired = isPostLinkWatchExpired(watch);
  const section = el("section", {
    class: "relay-post-link",
    "aria-label": `Link ${platform} post to Relay`
  });

  const lead = expired
    ? `Recently cross-posted “${watch.relay_post_title}” to ${platform} — paste the URL to link it.`
    : `Link “${watch.relay_post_title}” on ${platform} to Relay?`;

  const input = el("input", {
    type: "url",
    class: "relay-post-link__input",
    placeholder: PLACEHOLDER_URL[watch.destination],
    "aria-label": `${platform} post URL`
  }) as HTMLInputElement;
  if (watch.canonical_url) {
    input.value = watch.canonical_url;
  }

  const feedback = el("p", { class: "relay-post-link__feedback relay-muted" });
  feedback.hidden = true;

  const actions = el("div", { class: "relay-post-link__actions" });

  const linkBtn = el(
    "button",
    { type: "button", class: "relay-btn-primary relay-post-link__btn" },
    "Link"
  ) as HTMLButtonElement;

  const dismissBtn = el(
    "button",
    { type: "button", class: "relay-post-link__dismiss" },
    "Dismiss"
  ) as HTMLButtonElement;

  linkBtn.addEventListener("click", () => {
    void (async () => {
      feedback.hidden = true;
      const match = detectPublishedPostMatch(input.value.trim());
      if (!match || match.destination !== watch.destination) {
        feedback.textContent = `Paste a valid ${platform} post URL.`;
        feedback.hidden = false;
        return;
      }

      try {
        const res = (await browser.runtime.sendMessage({
          type: MSG_POST_LINK_CONFIRM,
          attempt_id: watch.attempt_id,
          canonical_url: match.canonical_url,
          external_id: match.external_id
        })) as { ok?: boolean };

        if (!res?.ok) {
          feedback.textContent = "Could not link this post. Try again from Relay.";
          feedback.hidden = false;
          return;
        }

        await onChanged();
      } catch {
        feedback.textContent = "Could not reach the extension background.";
        feedback.hidden = false;
      }
    })();
  });

  dismissBtn.addEventListener("click", () => {
    void (async () => {
      linkBtn.disabled = true;
      dismissBtn.disabled = true;
      try {
        await browser.runtime.sendMessage({
          type: MSG_POST_LINK_FORGET,
          attempt_id: watch.attempt_id
        });
      } catch {
        /* best-effort — fall through to re-render either way */
      }
      await onChanged();
    })();
  });

  actions.append(linkBtn, dismissBtn);
  section.append(
    el("p", { class: "relay-post-link__lead" }, lead),
    input,
    actions,
    feedback
  );
  return section;
}
