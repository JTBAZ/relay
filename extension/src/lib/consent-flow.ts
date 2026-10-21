import browser from "./browser";
import { PATREON_SESSION_COOKIE_NAME } from "./constants";
import { RELAY_API_BASE, credentialRequest, sha256Hex } from "./sync-now";
import * as storage from "./storage";

let consentGeneration = 0;
export function cancelConsentExchange(): void { consentGeneration++; }
export async function exchangeConsentCode(
  code: string
): Promise<{ ok: true; credentialCapture: string } | { ok: false; error: string }> {
  const generation = ++consentGeneration;
  // Invalidate old in-flight acknowledgments before reauthorizing this installation.
  await storage.clearGrant();
  const installationId = await storage.ensureInstallationId();
  const cookie = await browser.cookies.get({ url: "https://www.patreon.com/", name: PATREON_SESSION_COOKIE_NAME }).catch(() => null);
  const captured = cookie?.value?.trim() ?? "";
  let result: Awaited<ReturnType<typeof credentialRequest>>;
  try { result = await credentialRequest(`${RELAY_API_BASE}/api/v1/auth/extension/consent/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      consent_code: code.trim(),
      installation_id: installationId,
      ...(captured ? { session_id: captured } : {})
    })
  }); } catch {
    if (generation !== consentGeneration) return { ok: false, error: "Authorization was replaced. Use the latest connection." };
    await storage.setConsentLastError("Could not reach Relay. Connect again to retry authorization.");
    return { ok: false, error: "Could not reach Relay. Connect again to retry authorization." };
  }
  if (generation !== consentGeneration) return { ok: false, error: "Authorization was replaced. Use the latest connection." };
  if (result.status !== 200) {
    const msg =
      (result.status === 409
        ? "Consent code already used."
        : result.status === 410
          ? "Consent code expired."
          : `Exchange failed (${result.status}).`);
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const d = result.data;
  if (!d || typeof d !== "object") {
    const msg = "Invalid exchange response.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const token = d.token;
  const tokenId = d.token_id;
  const expiresAt = d.expires_at;
  const accountId = d.account_id;
  const relayCreatorId = d.relay_creator_id;

  if (typeof token !== "string" || typeof tokenId !== "string" || typeof expiresAt !== "string") {
    const msg = "Exchange response missing token fields.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }
  if (typeof accountId !== "string") {
    const msg = "Exchange response missing account_id.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  const rc =
    relayCreatorId === null || relayCreatorId === undefined
      ? ""
      : typeof relayCreatorId === "string"
        ? relayCreatorId
        : "";
  if (!rc.trim()) {
    const msg = "Relay workspace not provisioned — open the studio and try again.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  try {
    const accepted = await storage.setGrant({
      token: token.trim(),
      token_id: tokenId.trim(),
      expires_at: expiresAt.trim(),
      account_id: accountId.trim(),
      relay_creator_id: rc.trim(),
      created_at: new Date().toISOString()
    }, () => generation === consentGeneration);
    if (!accepted) return { ok: false, error: "Authorization was replaced. Use the latest connection." };
  } catch {
    const msg = "Could not store grant.";
    await storage.setConsentLastError(msg);
    return { ok: false, error: msg };
  }

  await storage.setConsentLastError(undefined);
  const context = await storage.getCredentialContext();
  const capture = d.credential_capture as { status?: unknown; checked_at?: unknown } | undefined;
  const stored = capture?.status === "stored" && typeof capture.checked_at === "string" && Number.isFinite(Date.parse(capture.checked_at));
  if (context && generation === consentGeneration) await storage.updateCredentialState(context, {
    observed_at: new Date().toISOString(), browser_session_present: Boolean(captured),
    status: stored ? "stored" : captured ? "capture_unavailable" : "no_patreon_cookie",
    ...(stored ? { hash: await sha256Hex(captured), acknowledged_at: capture!.checked_at as string, uploaded_at: capture!.checked_at as string } : {})
  });
  return { ok: true, credentialCapture: stored ? "stored" : captured ? "unavailable" : "missing_browser_session" };
}

