# Patreon creator scrape — identity and OAuth guardrails

When a creator’s **Patreon OAuth** or **browser session** does not match their **actual creator account**, Relay can ingest **teaser-quality or blurred media**: Patreon bakes transforms such as blur into CDN URLs for identities that are not entitled to full-tier assets. The wrong account can also cause **campaign / tenant mismatch** (OAuth bound to one Patreon user while the studio expects another).

This document records the **operational fix** creators should use and the **product guardrails** we should enforce before allowing scrape.

## Operational checklist (creators & support)

1. **Confirm Patreon identity in the browser**  
   In the **same browser profile** you use for Relay, open Patreon and verify you are logged in as the **creator** (the account that owns the campaign), not a patron-only or alt account.

2. **Re-initiate creator OAuth from that context**  
   Complete **creator Patreon connect** again so the token Relay stores is issued for the **creator** identity you intend. If you previously OAuth’d while Patreon had a **different** account active (or a stale tab), disconnect/reconnect or run through connect again after step 1.

3. **Refresh the Patreon session cookie**  
   After OAuth, use Relay’s **cookie** flow so the encrypted `session_id` used for cookie-based scraping matches the same **creator** session as in step 1.

4. **Re-scrape**  
   Run a normal sync or **full campaign re-scrape** as appropriate so ingest and export pick up URLs and revisions consistent with the corrected identity.

**Rule of thumb:** If thumbnails look like Patreon “preview” quality or stay blurred after fixes, assume **identity or entitlement** on Patreon’s side first—then repeat the sequence above before debugging Relay’s gallery code.

## Product requirement: gate scrape on OAuth “shape”

**Goal:** Do not let a creator kick off **scrape / full re-scrape / export-driving sync** until we have verified that **creator OAuth** matches what the studio expects.

**What “shape” means (minimum bar):**

- **Identity:** The Patreon user id (and display context) returned for the stored **creator** OAuth token is the one we expect for this `creator_id` / studio—not a different Patreon account that happened to complete the OAuth UI flow.
- **Campaign binding:** The resolved **Patreon campaign** for that token aligns with **`CreatorProfile.patreonCampaignId`** (or equivalent) for this creator, so we are not ingesting another campaign’s posts under the wrong tenant.
- **Health:** Token is **valid, not expired**, and any existing **credential health** signals from sync-state are acceptable before exposing scrape actions.

**UI expectations:**

- Surface a **blocking callout** in the Patreon / Library sync area when OAuth shape checks **fail** or are **unknown** (e.g. “Connect Patreon as your **creator** account” / “Campaign mismatch—reconnect”).
- **Disable** scrape and cookie-dependent actions until checks pass, with a **single primary action** (e.g. “Reconnect Patreon”) rather than silent failure after scrape.
- After **OAuth reconnect**, prompt to **re-register webhooks** and **re-save the Patreon cookie** when those steps are required for your deployment.

Implementation should reuse or extend existing server-side validation (e.g. identity and campaign resolution used on exchange) so the UI does not rely on heuristics alone.

## Related

- [sync-health.md](../sync-health.md) — `GET /api/v1/patreon/sync-state`, Library Patreon menu, OAuth health.
- [export-behavior.md](../export-behavior.md) — how `upstream_url` drives exported bytes; bad URLs → bad thumbnails.
- [cookie-auth-legal-rationale.md](../cookie-auth-legal-rationale.md) — why the Patreon cookie exists alongside OAuth.
