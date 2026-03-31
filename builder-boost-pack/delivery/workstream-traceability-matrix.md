# Workstream Traceability Matrix

Use this matrix to map each roadmap workstream to implementation contracts, standards, and primary reference docs.

| Workstream | Primary Goal | Primary Source | Contracts | Standards | DoD Focus | Stop Gate | Recommended Next Model |
|---|---|---|---|---|---|---|---|
| A: Onboarding and Auth | Patreon OAuth and creator onboarding flow | `road map.md` Part 1 / Workstream A | `contracts/api.md` | Security checklist A/B | Token safety, onboarding completion metrics | Stop and request user approval | Auto (efficiency) |
| B: Ingestion and Normalization | Reliable idempotent sync and canonical content records | `road map.md` Part 1 / Workstream B | `contracts/events.md`, `contracts/api.md` | NFR reliability, security B | Idempotency, dedupe, retry/DLQ behavior | Stop and request user approval | Auto (efficiency) |
| C: Export Storage and Delivery | Creator-owned media availability and retrieval | `road map.md` Part 1 / Workstream C | `contracts/events.md` | Security B/E, NFR data integrity | Backup integrity and retrieval success | Stop and request user approval | Auto (efficiency) |
| D: Gallery Experience | Fast searchable gallery UX | `road map.md` Part 1 / Workstream D | `contracts/api.md` | NFR performance | P95 UI response and discoverability | Stop and request user approval | Auto (efficiency) |
| E: Analytics Foundation | Insight generation and action card feed | `analytics-action-center-spec.md` | `contracts/events.md`, `contracts/api.md` | NFR observability/performance | Explainable cards, KPI instrumentation | Stop and request user approval | Opus (reasoning) |
| F: Replica Model and Clone Generation | Clone-ready data model and preview parity | `road map.md` Part 2 / Workstream F | `contracts/api.md` | NFR reliability, security A/B | Parity checks and deterministic tier logic | Stop and request user approval | Opus (reasoning) |
| G: Access and Identity | Tier-safe access across clone experience | `road map.md` Part 2 / Workstream G | `contracts/api.md` | Security A/B/E | Zero unauthorized access in tests | Stop and request user approval | Opus (reasoning) |
| H: Payment Provider Handoff | Independent billing readiness | `road map.md` Part 2 / Workstream H | `contracts/api.md` | Security D, NFR reliability/release gates | Dry-run validation and checkout reliability | Stop and request user approval | Max |
| I: Re-Populate Audience Recovery | Tier-mapped outreach and conversion | `analytics-action-center-spec.md`, `road map.md` | `contracts/events.md`, `contracts/api.md` | Security C/F, NFR release gates | Preflight pass, deliverability controls, conversion tracking | Stop and request user approval | Max |
| J: One-Click Deploy and Rollback | Fast launch with safe rollback | `road map.md` Part 2 / Workstream J | `contracts/api.md` | NFR availability/reliability, security E/F | Deployment and rollback time targets | Stop and request user approval | Opus (reasoning) |

## Build Mapping Notes

- For recommendation logic and Action Center behavior, default to `analytics-action-center-spec.md`.
- For pricing, hosting mode, and service boundaries (managed vs BYOI), default to `monetization-scheme-infrastructure-plan.md`.
- For contract-level implementation, this pack's `contracts/` directory is the source of truth.

## Change Control

When updating any workstream behavior:

1. Update this matrix row if scope or dependencies changed.
2. Update related contracts if payload or endpoint behavior changed.
3. Re-run Definition of Done and security checklist.

## Stop-Gate Enforcement

- Stop gates in this matrix are mandatory.
- At each stop gate, builder must output a handoff update using:
  - [delivery/handoff-checkpoints.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\handoff-checkpoints.md)
- Builder must include model recommendation and reason before asking user approval to continue.
