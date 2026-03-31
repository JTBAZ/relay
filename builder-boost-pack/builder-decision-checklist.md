# Builder Decision Checklist

Use this checklist before and during implementation. Mark each item with one of:

- `TBD`
- `DECIDED`
- `BLOCKED`

## 1) Product and Platform Pathing

- Hosting mode default:
  - Managed mode / BYOI / hybrid rollout order.
- Post-independence offer:
  - Managed retainer scope and SLA level.
- Migration eligibility criteria:
  - Which creators can run Part 2 in initial cohorts.

## 2) Data Ownership and Storage

- Source-of-truth boundaries:
  - Patreon data vs local canonical replica.
- Backup storage ownership model:
  - Platform-managed buckets vs creator-managed buckets.
- Data retention and deletion windows:
  - Exported media, logs, and outreach history.

## 3) Security and Privacy

- Token encryption strategy and key rotation policy.
- Signed URL TTL defaults by content sensitivity.
- Tenant isolation model:
  - row-level / schema-level / service-level.
- Audit log retention duration for migration and outreach actions.

## 4) Compliance and Outreach Governance

- Legal basis handling for contact and outreach.
- Suppression list ownership and propagation rules.
- Unsubscribe and preference center behavior.
- Geographic restrictions and policy routing if required.

## 5) Billing and Monetization

- Core SaaS packaging boundaries.
- One-time migration package inclusions.
- Managed retainer feature bundle.
- Overage policy for storage, egress, and email.

## 6) Analytics and Recommendation Controls

- Minimum confidence threshold by card type.
- Explainability requirements for recommendation display.
- Human review required action types (mass email, paid campaign, etc.).
- Outcome measurement windows (30/60/90 day).

## 7) Release and Operations

- Pilot cohort size and success criteria.
- Rollback triggers and runbook ownership.
- On-call model and escalation path.
- Incident severity matrix and communication policy.

## 8) Builder Sign-Off Template

Use this template in implementation notes per workstream:

```md
Workstream:
Decision IDs:
Chosen defaults:
Risks:
Mitigations:
Open blockers:
Approval status:
```
