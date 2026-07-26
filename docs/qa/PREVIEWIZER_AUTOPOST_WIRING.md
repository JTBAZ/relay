/**
 * Previewizer ↔ Autopost wiring — manual verification matrix
 *
 * Automated coverage: `web/lib/distribution-media-routing.test.ts` (wiring matrix),
 * `web/lib/previewizer-session.test.ts`, `web/lib/previewizer-feature.test.ts`.
 *
 * Run unit tests:
 *   npx vitest run web/lib/previewizer-session.test.ts web/lib/previewizer-feature.test.ts web/lib/distribution-media-routing.test.ts
 */

# Previewizer → Autopost wiring QA

## Prerequisites

- Relay API running; web app on `:3000`
- Creator signed in with at least one image in staging / a published Relay post
- Connected destinations available (e.g. X + Patreon) for Autopost Strategy

## Path A — Previewizer enabled (default)

| Step | Action | Expected |
|------|--------|----------|
| A1 | Autopost → publish Relay post → Strategy | “Before we route” questionnaire visible |
| A2 | Preview = **Yes** | X / DeviantArt / Bluesky default **Preview**; Patreon **Full** |
| A3 | Open Previewizer → edit → Export → **Use as preview** | Overlay closes; “Preview ready” thumb; routing toggles unchanged |
| A4a | Custom text already answered **No** | Auto-routes (or Route CTA emphasized then plan creates) |
| A4b | Custom text unanswered | Scrolls/highlights custom-text question |
| A4c | Then answer custom text **No** | Auto-routes |
| A4d | Answer custom text **Yes** | Route CTA emphasized (edit copy first) |
| A5 | After plan | Step 3 send cards; preview destinations show teaser thumb |
| A6 | Adjust Full/Preview or pick new preview under “Adjust preview…” | Stale banner if plan diverges; **Re-route to apply** recreates plan |
| A7 | Post one destination | Extension/API handoff uses preview media when routed Preview |

## Path B — Picker only (Previewizer flagged off)

Set in `web/.env.local`:

```bash
NEXT_PUBLIC_RELAY_PREVIEWIZER_ENABLED=0
```

Restart `web` dev server.

| Step | Action | Expected |
|------|--------|----------|
| B1 | Preview = **Yes** | **Open Previewizer** hidden; copy points to existing preview; picker opens/emphasized |
| B2 | Choose existing preview from staging/library | Preview ready; can Route |
| B3 | Route → send | Same as Path A for package media binding |
| B4 | Confirm Autopost never imports broken Previewizer | No overlay; no console errors from missing Previewizer |

Unset or set `NEXT_PUBLIC_RELAY_PREVIEWIZER_ENABLED=1` and restart to restore Path A.

## Path C — No preview

| Step | Action | Expected |
|------|--------|----------|
| C1 | Preview = **No** | No Previewizer / picker required; routing cleared |
| C2 | Answer custom text → Route | Plan has no `preview_media_id`; all Full |
| C3 | Send cards | Main/full image thumbs |

### Path C variant

| Step | Action | Expected |
|------|--------|----------|
| C4 | Preview = **Yes** but flip all destinations to **Full** | Route enabled without preview media id |
| C5 | Plan payload | `needs_preview: true`, no `preview_media_id` |

## Silo / regression checks

| Check | Expected |
|-------|----------|
| Production Overlay import | `@/app/components/previewizer` (not `app/dev/…`) |
| Standalone playground | `/dev/previewizer` still loads (dev bench / flag as before) |
| Previewizer package | No import of `relay-native-staging-upload` inside `web/app/components/previewizer/` |
| Upload ownership | Staging upload only from Transformer/`onUploadPreview` adapter |

## Custom preview templates (settings save)

Creator-scoped templates store **overlay / composition settings only** (no crop). Max **3** per creator.

| Step | Action | Expected |
|------|--------|----------|
| T1 | Distribution Previewizer → Export → check **Also save…** → name → Use as preview | Preview uploads; template appears under **My templates** |
| T2 | At 3 templates, save again | Must pick a slot to **replace** |
| T3 | **My templates** → Apply on a different post image | Overlay/QR/settings restore; **crop unchanged**; sticky handle text restored |
| T4 | Apply with Patreon destination but Patreon unlinked | Banner: pick a destination for QR |
| T5 | Standalone `/dev/previewizer` | No save checkbox / My templates (distribution-only) |

API: `GET/POST /api/v1/creator/preview-templates`, `PATCH/DELETE …/:template_id`. Config contract: `web/lib/previewizer-template-config.ts`.

## Pass criteria (from wiring plan)

1. Previewizer path reaches Post with ≤1 intentional Route click after export when questionnaires were already done (ideally zero via auto-route).
2. Autopost works with Previewizer feature-flagged off (picker path).
3. Autopost works with needs-preview = No.
4. Previewizer refactors stay behind the adapter; Autopost does not import Previewizer internals beyond Overlay + port types.
