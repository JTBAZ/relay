# Builder Boost Pack

## Purpose

This pack standardizes build decisions, contracts, quality gates, and traceability so Builder agents can execute the Relay roadmap with minimal ambiguity.

Use this pack with:

- [road map.md](c:\Users\jorda\Documents\Coding Projects\Rescue\road map.md)
- [analytics-action-center-spec.md](c:\Users\jorda\Documents\Coding Projects\Rescue\analytics-action-center-spec.md)
- [monetization-scheme-infrastructure-plan.md](c:\Users\jorda\Documents\Coding Projects\Rescue\monetization-scheme-infrastructure-plan.md)

## Authority Order (When Documents Conflict)

1. Contracts (`contracts/events.md`, `contracts/api.md`)
2. Security and compliance checklist (`standards/security-compliance-checklist.md`)
3. Non-functional requirements (`standards/non-functional-requirements.md`)
4. Roadmap and workstream sequence (`road map.md`)
5. Product strategy/reference docs (`analytics-action-center-spec.md`, `monetization-scheme-infrastructure-plan.md`)

If a conflict is discovered, log it in your implementation notes and follow the higher authority document.

## Documents In This Pack

- Decision checklist:
  - [builder-decision-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\builder-decision-checklist.md)
- Contracts:
  - [contracts/events.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\events.md)
  - [contracts/api.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\api.md)
- Standards:
  - [standards/non-functional-requirements.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\standards\non-functional-requirements.md)
  - [standards/security-compliance-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\standards\security-compliance-checklist.md)
- Delivery:
  - [delivery/definition-of-done.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\definition-of-done.md)
  - [delivery/workstream-traceability-matrix.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\workstream-traceability-matrix.md)

## Builder Execution Loop

For each workstream:

1. Check open decisions in `builder-decision-checklist.md`.
2. Implement against fixed contracts in `contracts/`.
3. Validate NFR and security/compliance checklists in `standards/`.
4. Verify completion against `delivery/definition-of-done.md`.
5. Confirm traceability row in `delivery/workstream-traceability-matrix.md`.

## Minimal Build Rules

- No feature merges without contract alignment.
- No outreach-related feature goes live without compliance checklist pass.
- No migration or deploy flow goes live without rollback test evidence.
- No analytics recommendation action ships without explainability and confidence score support.
