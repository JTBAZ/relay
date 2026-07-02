/**
 * One-shot Autopost API smoke test (Dev Ava pilot account).
 * Usage: node scripts/tmp-autopost-e2e-flow.mjs
 */
const BASE = process.env.RELAY_API_BASE ?? "http://127.0.0.1:8787";
const EMAIL = "creator_dev_ava@pilot.relay.test";
const PASSWORD = "pilot-ux-dev-only";
const CREATOR_ID = "rcx_pilot_dev_ava";
const CAMPAIGN_ID = "pilot_campaign_ava";

function log(step, ok, detail = "") {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`[${mark}] ${step}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, { method = "GET", token, body } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, { method, headers, body });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json };
}

const results = [];

function record(step, ok, detail = "") {
  log(step, ok, detail);
  results.push({ step, ok, detail });
}

try {
  // Health
  const health = await fetch(`${BASE}/api/v1/health`);
  record("API health", health.ok, `status=${health.status}`);

  // Login
  const login = await api("/api/v1/auth/login", {
    method: "POST",
    body: { email: EMAIL, password: PASSWORD }
  });
  const token = login.json?.data?.token;
  record("Login", login.status === 200 && !!token, login.status !== 200 ? JSON.stringify(login.json) : `user=${login.json?.data?.user_id}`);

  if (!token) throw new Error("No token — aborting");

  // Creator workspace (sets primaryRelayCreatorId for creator routes)
  const workspace = await api("/api/v1/creator/workspace", {
    method: "POST",
    token,
    body: {}
  });
  record(
    "POST creator/workspace",
    workspace.status === 200 && workspace.json?.data?.relay_creator_id === CREATOR_ID,
    workspace.json?.data?.relay_creator_id ?? String(workspace.status)
  );

  // Style profile presets
  const presets = await api("/api/v1/creator/style-profile/presets", { token });
  const presetCount = presets.json?.data?.presets?.length ?? 0;
  record("GET style-profile/presets", presets.status === 200 && presetCount >= 6, `count=${presetCount}`);

  // Upsert style profile
  const putProfile = await api("/api/v1/creator/style-profile", {
    method: "PUT",
    token,
    body: { tone_preset: "warm", user_prompt: "E2E smoke test voice" }
  });
  record("PUT style-profile", putProfile.status === 200, putProfile.json?.data?.tone_preset ?? putProfile.status);

  // Staging bin baseline
  const binBefore = await api(`/api/v1/relay/library/staging?creator_id=${CREATOR_ID}`, { token });
  const idsBefore = (binBefore.json?.data?.items ?? []).map((i) => i.media_id);
  record("GET staging bin (before)", binBefore.status === 200, `count=${idsBefore.length}`);

  if (idsBefore.length === 0) {
    record("Pick media for draft", false, "staging bin empty — cannot continue draft flow");
    throw new Error("No staging media");
  }

  const mediaId = idsBefore[0];

  // Clear any active draft first
  const activeBefore = await api("/api/v1/creator/autopost/draft", { token });
  const existingDraftId = activeBefore.json?.data?.draft?.draft_id;
  if (existingDraftId) {
    await api(`/api/v1/creator/autopost/draft/${existingDraftId}?force=true`, {
      method: "DELETE",
      token
    });
  }

  // Create draft
  const createDraft = await api("/api/v1/creator/autopost/draft", {
    method: "POST",
    token,
    body: { media_ids: [mediaId], generate: true }
  });
  const draftId = createDraft.json?.data?.draft?.draft_id;
  record(
    "POST autopost/draft",
    createDraft.status === 200 || createDraft.status === 201,
    draftId ? `draft_id=${draftId}` : JSON.stringify(createDraft.json)
  );

  // Media reserved — absent from bin
  const binAfterReserve = await api(`/api/v1/relay/library/staging?creator_id=${CREATOR_ID}`, { token });
  const idsAfterReserve = (binAfterReserve.json?.data?.items ?? []).map((i) => i.media_id);
  const reservedHidden = !idsAfterReserve.includes(mediaId);
  record("Media reserved (hidden from bin)", reservedHidden, `bin ${idsBefore.length}→${idsAfterReserve.length}`);

  if (!draftId) throw new Error("No draft_id");

  // Publish
  const publish = await api(`/api/v1/creator/autopost/draft/${draftId}/publish`, {
    method: "POST",
    token,
    body: { is_public: true, campaign_id: CAMPAIGN_ID }
  });
  const postId = publish.json?.data?.post_id;
  const draftStatus = publish.json?.data?.draft?.status;
  record(
    "POST …/publish",
    publish.status === 200 && !!postId && draftStatus === "published",
    postId ? `post_id=${postId}` : JSON.stringify(publish.json)
  );

  // No active draft after publish
  const activeAfter = await api("/api/v1/creator/autopost/draft", { token });
  const activeDraft = activeAfter.json?.data?.draft;
  record("Active draft cleared after publish", activeDraft == null, activeDraft ? `still=${activeDraft.draft_id}` : "null");

  // Create a fresh draft for discard flow (use another media if available)
  const binForDiscard = await api(`/api/v1/relay/library/staging?creator_id=${CREATOR_ID}`, { token });
  const discardMediaId = (binForDiscard.json?.data?.items ?? [])[0]?.media_id;
  if (!discardMediaId) {
    record("Discard flow", false, "no media left for second draft");
  } else {
    const discardDraftRes = await api("/api/v1/creator/autopost/draft", {
      method: "POST",
      token,
      body: { media_ids: [discardMediaId], generate: false, title: "Discard test", body: "test" }
    });
    const discardDraftId = discardDraftRes.json?.data?.draft?.draft_id;
    record("Second draft for discard test", !!discardDraftId, discardDraftId ?? "");

    if (discardDraftId) {
      const dist = await api(`/api/v1/creator/autopost/draft/${discardDraftId}/distribution`, {
        method: "POST",
        token,
        body: { destination: "patreon" }
      });
      record("POST …/distribution", dist.status === 200, dist.json?.data?.draft?.distribution_log?.patreon ? "logged" : JSON.stringify(dist.json));

      const discardWarn = await api(`/api/v1/creator/autopost/draft/${discardDraftId}`, {
        method: "DELETE",
        token
      });
      record(
        "DELETE without force (expect 409)",
        discardWarn.status === 409,
        discardWarn.json?.error?.code ?? String(discardWarn.status)
      );

      if (discardWarn.status === 409) {
        const discardForce = await api(
          `/api/v1/creator/autopost/draft/${discardDraftId}?force=true`,
          { method: "DELETE", token }
        );
        record(
          "DELETE with force=true",
          discardForce.status === 200,
          discardForce.json?.data?.draft?.status ?? String(discardForce.status)
        );

        const binAfterDiscard = await api(`/api/v1/relay/library/staging?creator_id=${CREATOR_ID}`, { token });
        const idsAfterDiscard = (binAfterDiscard.json?.data?.items ?? []).map((i) => i.media_id);
        const mediaBack = idsAfterDiscard.includes(discardMediaId);
        record("Media back in bin after force discard", mediaBack, mediaBack ? discardMediaId : `missing ${discardMediaId}`);
      }
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failed:", failed.map((f) => f.step).join(", "));
    process.exitCode = 1;
  }
} catch (err) {
  console.error("Fatal:", err.message);
  process.exitCode = 1;
}
