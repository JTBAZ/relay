# Security and Compliance Checklist

Use this checklist before merging and before production release for any relevant workstream.

Mark each line with:

- `PASS`
- `FAIL`
- `N/A`

## A) Authentication and Authorization

- OAuth tokens encrypted at rest.
- Refresh token handling includes rotation and failure monitoring.
- Access control rules validated for public/member/tier-gated resources.
- Cross-tenant access tests pass.
- Admin or privileged endpoints require explicit role checks.

## B) Data Protection

- Sensitive data encrypted in transit and at rest.
- Signed URLs used for private media with explicit expiration.
- Secrets are never logged.
- Backup integrity checks (checksum/hash) implemented and verified.
- Data deletion and retention paths are documented and testable.

## C) Outreach and Re-Populate Compliance

- Legal basis for contact processing is documented.
- Suppression list checks are enforced before send.
- Unsubscribe and preference management links are included.
- Complaint and bounce thresholds trigger automatic pause.
- Campaign actions are audit logged (who, what, when).

## D) Payment and Financial Controls

- Payment provider keys stored in secure secret manager.
- Webhook signature verification enabled and tested.
- Failed payment and retry logic documented.
- Tier-to-product mapping is validated before launch.
- Dry-run mode exists for migration payment readiness checks.

## E) Infrastructure Security

- Least privilege IAM roles configured for services.
- Network ingress and egress rules reviewed.
- Deployment pipeline requires authenticated approvals for production.
- Dependency scanning and vulnerability triage is in place.
- Critical services have backup and restore procedures validated.

## F) Incident and Audit Readiness

- Incident severity levels and escalation contacts documented.
- Error and security alerts route to owner on-call.
- Audit logs are immutable and queryable by tenant and campaign.
- Post-incident review template exists.
- Recovery time objective and recovery point objective are declared.

## G) Sign-Off Block

```md
Workstream:
Reviewer:
Date:
Checklist status summary:
Blocking failures:
Mitigations:
Approval:
```
