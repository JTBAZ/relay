import browser from "./lib/browser";
import {
  MSG_REVOKE_LOCAL,
  MSG_START_CONSENT,
  MSG_STATUS,
  MSG_SYNC_NOW
} from "./lib/messages";
import { PATREON_SESSION_COOKIE_NAME, PATREON_URL, RELAY_WEB_BASE } from "./lib/constants";
import type { SyncResult } from "./lib/sync-now";
import type { CredentialStatus } from "./lib/storage";
import { renderPostLinkFallbackSections } from "./popup-post-link";

type StatusPayload = {
  hasGrant: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  accountId: string | null;
  relayCreatorId: string | null;
  consentError: string | null;
  credentialState?: CredentialStatus | null;
};

const region = document.getElementById("relay-region");
if (!region) {
  throw new Error("relay-region missing");
}

let lastSyncFailure: string | null = null;
let checking = false;

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

function syncResultMessage(r: SyncResult): string {
  if (r.ok) return "";
  switch (r.reason) {
    case "no_grant":
      return "Not connected.";
    case "no_creator":
      return "Studio not provisioned. Open Relay on the web first.";
    case "no_patreon_cookie":
      return "No Patreon login detected in this browser.";
    case "grant_revoked":
      return "This device was disconnected.";
    case "consent_required":
      return "Authorize this device again to capture your current Patreon session.";
    case "timeout":
      return "Relay took too long to respond. Check the connection again.";
    case "superseded":
      return "The connection changed. Use the latest authorization.";
    case "rate_limited":
      return "Too many sync attempts. Try again later.";
    case "http_error":
      return r.detail ? `Sync failed (${r.detail}).` : "Sync failed.";
    default:
      return "Sync failed.";
  }
}

async function getStatus(): Promise<StatusPayload | null> {
  try {
    const res = await browser.runtime.sendMessage({ type: MSG_STATUS });
    if (res && typeof res === "object" && "hasGrant" in res) {
      return res as StatusPayload;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function hasPatreonSessionCookie(): Promise<boolean> {
  try {
    const c = await browser.cookies.get({
      url: PATREON_URL,
      name: PATREON_SESSION_COOKIE_NAME
    });
    return Boolean(c?.value);
  } catch {
    return false;
  }
}

function el(
  tag: string,
  props: Record<string, string | undefined>,
  ...children: (Node | string)[]
): HTMLElement {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) n.setAttribute(k, v);
  }
  for (const ch of children) {
    n.append(typeof ch === "string" ? document.createTextNode(ch) : ch);
  }
  return n;
}

function clearRegion(): void {
  region.replaceChildren();
}

function renderError(msg: string, actions: HTMLElement): void {
  clearRegion();
  region.append(
    el("p", { class: "relay-error" }, msg),
    actions
  );
}

async function render(): Promise<void> {
  const status = await getStatus();
  const patreonOk = await hasPatreonSessionCookie();

  const actions = el("div", { class: "relay-actions" });

  if (!status) {
    clearRegion();
    region.append(
      el("p", {}, "Could not reach the Relay extension background."),
      el("p", { class: "relay-muted" }, "Try reloading the extension.")
    );
    return;
  }

  if (status.consentError && !status.hasGrant) {
    renderError(`Connection issue: ${status.consentError}`, actions);
    actions.append(
      el(
        "button",
        { type: "button", class: "relay-btn-primary" },
        "Try again"
      )
    );
    actions.querySelector("button")!.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ type: MSG_START_CONSENT });
      window.close();
    });
    return;
  }

  if (!status.hasGrant) {
    clearRegion();
    const connectActions = el("div", { class: "relay-actions" });
    const btn = el("button", { type: "button", class: "relay-btn-primary" }, "Connect to Relay");
    btn.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ type: MSG_START_CONSENT });
      window.close();
    });
    connectActions.append(btn);
    region.append(
      el("p", {}, "Connect this device to Relay so your Patreon session can sync securely."),
      connectActions
    );
    return;
  }

  if (!status.relayCreatorId?.trim()) {
    renderError(
      "Your Relay studio is not ready yet. Open Relay on the web and complete setup.",
      actions
    );
    const open = el("button", { type: "button", class: "relay-btn-primary" }, "Open Relay");
    open.addEventListener("click", () => {
      void browser.tabs.create({ url: `${RELAY_WEB_BASE}/` });
    });
    actions.append(open);
    return;
  }

  if (!patreonOk) {
    clearRegion();
    const patreonActions = el("div", { class: "relay-actions" });
    const login = el(
      "button",
      { type: "button", class: "relay-btn-primary" },
      "Open Patreon login"
    );
    login.addEventListener("click", () => {
      void browser.tabs.create({ url: "https://www.patreon.com/login" });
    });
    patreonActions.append(login);
    region.append(
      el(
        "p",
        {},
        "You’re not logged into Patreon in this browser. Log in on patreon.com, then open this popup again."
      ),
      patreonActions
    );
    return;
  }

  if (status.credentialState?.status === "consent_required" || status.credentialState?.status === "capture_unavailable") {
    renderError("Authorize this device again to capture your current Patreon session.", actions);
    const authorize = el("button", { type: "button", class: "relay-btn-primary" }, "Authorize again");
    authorize.addEventListener("click", async () => { await browser.runtime.sendMessage({ type: MSG_START_CONSENT }); window.close(); });
    actions.append(authorize);
    return;
  }

  const stateFailure = status.credentialState?.status;
  const syncErr = lastSyncFailure ?? (stateFailure === "http_error" || stateFailure === "timeout" || stateFailure === "rate_limited"
    ? syncResultMessage({ ok: false, reason: stateFailure }) : null);
  if (syncErr) {
    renderError(syncErr, actions);
    const retry = el("button", { type: "button", class: "relay-btn-primary" }, "Check connection");
    retry.addEventListener("click", () => void checkConnection(retry));
    actions.append(retry);
    return;
  }

  clearRegion();
  const studioLine = el(
    "p",
    { class: "relay-studio" },
    `Connected as ✓ ${status.relayCreatorId}`
  );
  const syncLine = el(
    "p",
    {},
    `Last credential check ${formatRelative(status.lastSyncAt)}${
      status.lastSyncStatus ? ` · ${status.lastSyncStatus}` : ""
    }.`
  );
  region.append(studioLine, syncLine);
  region.append(el("p", { class: "relay-muted" }, `Browser session observed ${formatRelative(status.credentialState?.observed_at ?? null)}.`));
  region.append(el("p", { class: "relay-muted" }, status.credentialState?.data_sync_at
    ? `Last data sync ${formatRelative(status.credentialState.data_sync_at)}.` : "Data sync status is available in Relay."));

  await renderPostLinkFallbackSections(region, render);

  region.append(actions);

  const manage = el("button", { type: "button", class: "relay-link" }, "Manage on Relay →");
  manage.addEventListener("click", () => {
    void browser.tabs.create({
      url: `${RELAY_WEB_BASE}/settings/connected-extensions`
    });
  });

  const syncBtn = el("button", { type: "button" }, "Check connection");
  syncBtn.addEventListener("click", () => void checkConnection(syncBtn));

  const disc = el("button", { type: "button", class: "relay-btn-danger" }, "Disconnect this device");
  disc.addEventListener("click", async () => {
    if (!window.confirm("Disconnect this device from Relay? The server's Patreon session stays stored. Remove it on Relay's Patreon cookie page if needed.")) {
      return;
    }
    await browser.runtime.sendMessage({ type: MSG_REVOKE_LOCAL });
    lastSyncFailure = null;
    await render();
  });

  actions.append(syncBtn, manage, disc);
  region.append(actions);
}

async function checkConnection(button: HTMLElement): Promise<void> {
  if (checking) return;
  checking = true;
  button.setAttribute("disabled", "");
  button.textContent = "Checking…";
  region!.setAttribute("aria-busy", "true");
  try {
    const result = await browser.runtime.sendMessage({ type: MSG_SYNC_NOW }) as SyncResult;
    lastSyncFailure = result.ok || result.reason === "superseded" ? null : syncResultMessage(result);
  } catch { lastSyncFailure = "Could not reach the extension. Open it again to retry."; }
  finally { checking = false; region!.setAttribute("aria-busy", "false"); }
  await render();
  (region!.querySelector("button") as HTMLButtonElement | null)?.focus();
}

void render();
