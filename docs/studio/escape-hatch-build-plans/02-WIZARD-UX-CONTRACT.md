# Wizard UX contract

## Required specialist guidance

Before changing wizard UI, the assigned Cursor Grok 4.5 High builder must read and apply:

- `frontend-design` — intentional design and end-user language;
- `vercel-react-best-practices` — Next.js performance and server/client boundaries;
- `web-design-guidelines` — fetched fresh for accessibility and interaction review.

The master planner must use a `browser-use` agent for every UI slice and every milestone journey. A screenshot or DOM-only check is insufficient: the reviewer must complete the task as a creator, inspect desktop and mobile, and record confusing decisions, dead ends, and recovery quality.

## Location and visual language

The wizard lives in Relay Studio and uses the existing Relay shell. It may resize and compose existing chrome but must not invent a disconnected “setup SaaS” aesthetic.

The generated visitor site uses one premium theme derived from the current Relay patron gallery. Wizard preview controls are limited to:

- logo/avatar and hero media;
- display name, title, short introduction, and community link;
- accent color and approved type pairings;
- light/dark preference where the chassis supports both;
- gallery density and safe cover crop;
- paywall message and Discord/community CTA.

No arbitrary blocks, absolute-position editor, custom scripts, or raw CSS field.

## Journey map

### 0. Welcome and promise

- Explain what the creator receives, what they own, expected time, and potential recurring third-party costs.
- Offer “Save and leave” immediately.
- Show current Patreon import health; block only on data conditions that would produce a dishonest site.

### 1. Library truth

- Summarize creator identity, tiers, posts, media count, attachments, failed exports, and access ambiguities.
- Let the creator inspect Public, All paid members, and each tier.
- Every anomaly has: what Relay saw, likely effect, recommended resolution, and “exclude from this build.”
- Do not continue when premium media has no retrievable source unless the creator explicitly excludes it.

### 2. Access map

- Present posts grouped by effective access.
- Support bulk correction with an undoable review queue.
- Explain exact-tier versus tier-or-higher in creator language.
- Run an access simulation for Public, Paid member, and each tier before completion.

### 3. Brand the home

- Upload branding assets with crop/contrast checks.
- Preview using the creator's real sanitized content, not generic cards.
- Keep one primary preview viewport and an explicit mobile toggle.
- Persist every accepted change server-side; browser session state alone is not valid.

### 4. Choose a route

Offer two plain-language paths:

1. **Fastest launch:** Vercel + Supabase + R2.
2. **Portable deployment:** Docker/Postgres + R2 and a currently validated host recipe.

Show ownership, monthly third-party estimates, maintenance responsibility, content-policy fit, and migration difficulty. Do not label a route “recommended” when its current provider policy conflicts with the creator's declared business.

### 5. Connect infrastructure

For each provider:

- prefer OAuth/API connection where available;
- otherwise open the exact provider screen in a separate tab;
- keep Relay instructions visible;
- accept only the minimum required value;
- never ask the creator to paste secrets into chat or documentation;
- validate connectivity, permissions, and ownership immediately;
- show how to revoke Relay's temporary setup access.

Required checks: database migration status, auth callback, R2 put/get/delete probe, billing sandbox capability, transactional email delivery, deployment API, and domain readiness.

### 6. Preserve Patreon access

Offer equal, transparent choices:

- **Own your Patreon connection:** guided creator-owned Patreon OAuth app.
- **Let Relay maintain it:** monthly managed verification add-on billed through Relay.

For both, show data handled, runtime dependencies, cancellation effects, and migration path. The managed option cannot be preselected.

### 7. Map billing

- Run provider-policy eligibility before account connection.
- Map every paid Patreon tier to an independent product/price.
- Show currency, amount, interval, tax setting, benefits, and access result.
- Prevent duplicate subscription prompts for a patron with active Patreon access.
- Require sandbox checkout, webhook, cancellation, failed-payment, and restoration tests.

### 8. Copy and verify

- Copy normalized data and media with resumable progress.
- Show files, bytes, failures, retries, checksum mismatches, and excluded items.
- Let the creator download a diagnostic manifest.
- Never turn partial completion into silent success.

### 9. Preview as a patron

Creator must walk:

- public visitor;
- active Patreon patron;
- independent subscriber;
- insufficient tier;
- expired/canceled account;
- admin.

Premium responses must be verified at the network layer, not only blurred visually.

### 10. Launch

- Deploy a preview, run automated checks, and ask for approval.
- A provider URL is enough to complete the wizard; custom domain setup follows in the same guided workspace.
- Verify DNS, TLS, canonical URL, OAuth callbacks, billing return URLs, webhook endpoints, email sender, robots/sitemap choice, and admin recovery.
- “Launch” stays disabled until blocking checks pass.

### 11. Handoff

- Present the live URL, admin URL, health summary, recurring costs, and remaining optional work.
- Generate the ownership packet defined in [`12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md`](12-HUMAN-SIGNOFF-AND-OWNERSHIP-PACKET.md).
- Require the creator to prove they can log in as admin and download a backup before final completion.

## Interaction standards

- One primary action per screen; stable action names across button, loading copy, toast, and history.
- Sentence case, plain verbs, no celebratory copy before verification.
- Visible step name and progress, but no false percentages for variable work.
- Keyboard operation, visible focus, reduced motion, sufficient contrast, labeled errors, and 44px minimum touch targets.
- Destructive changes require impact preview and typed/explicit confirmation.
- External setup steps always include “I am stuck” and “Choose another route.”
- Resume must restore the last verified state, not merely the last visited screen.

## Browser acceptance script

For every UI slice, the master planner:

1. starts from a clean creator fixture;
2. completes the new action by visible controls;
3. checks 1440px desktop and approximately 390px mobile;
4. verifies keyboard-only navigation and one failure/recovery path;
5. captures before/after screenshots;
6. records friction and sends corrections to a Cursor Grok 4.5 High builder;
7. repeats until no blocking ambiguity remains.

At milestone gates, rerun the entire journey through live local services and provider sandboxes. The master planner may not accept its own UI implementation because it must not implement UI.
