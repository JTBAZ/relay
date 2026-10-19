# Issue tracker

## Current execution policy

Airtable queues are legacy and are no longer needed for production. Ignore historical requirements to read or update Production Ledger, DB Integration Pipeline, Batting Order, or related Airtable queues. Queue refreshes, claims, Session Locks, and status updates are not prerequisites for current work. This policy supersedes older tracker instructions in linked documentation.

The GitHub remote is `JTBAZ/relay`. This setup does not select GitHub Issues or another external service as the replacement tracker.

## How the engineering skills work here

- Start from the user's current request, the current conversation, and the applicable checked-in product contracts and build plans identified by `AGENTS.md`.
- Resolve a user-supplied spec or ticket reference to its actual source and read it before acting. Ask if the reference is ambiguous.
- `to-spec` synthesizes the agreed work into a reviewable specification. `to-tickets` proposes complete vertical slices, acceptance criteria, and blocking relationships. Use existing program documentation conventions and a user-specified destination when provided.
- If a new spec or ticket has no established destination, draft it in the conversation and clarify the destination before publishing it. Do not invent a replacement queue, publish GitHub issues, or reactivate Airtable as a side effect of using these skills.
- Treat upstream tracker-specific labels such as `ready-for-agent` as workflow concepts unless the user selects a tracker and vocabulary. The `triage` skill is not installed, and this setup defines no triage labels or tracker status transitions.
- `implement` follows the approved spec or tickets and the repository's implementation boundaries, records verification and remaining work in the relevant handoff or plan, and reports completion based on acceptance criteria. It does not need an Airtable connection or queue update.

## Escape Hatch

Escape Hatch remains deferred. Existing plans are reference material, not an active queue. Do not start or resume its implementation, fixtures, tests, docs, deployment, or other backlog unless the user explicitly reactivates it. If reactivated, follow its documented ownership and agent boundaries in `AGENTS.md` and `docs/studio/escape-hatch-build-plans/10-AGENT-ORCHESTRATION.md`.
