# Non-Functional Requirements

## Purpose

Define required service quality, reliability, performance, and operability targets across the project.

## Availability and Reliability

- API availability: 99.9 percent monthly.
- Background job success rate: 99.0 percent or higher.
- Sync freshness: 95 percent of creators updated within configured interval.
- Rollback readiness: verified rollback path for clone deployments before production go-live.

## Performance Targets

- Dashboard and Action Center card load:
  - P95 <= 500 ms for cached reads.
- Gallery interaction latency:
  - P95 <= 300 ms for core UI operations.
- Migration campaign preflight:
  - 95 percent complete <= 60 seconds.

## Scalability Targets

- Must support 10,000 media items per creator without unusable UI degradation.
- Queue workers must scale horizontally based on backlog depth and age.
- APIs should remain stable under burst traffic via rate limiting and backpressure.

## Data Quality and Integrity

- Ingestion idempotency required for all sync jobs.
- Duplicate creation rate must remain below 0.1 percent.
- Exported backup objects require checksum metadata.
- Audit records must be immutable and queryable.

## Security and Privacy Baseline

- Credentials encrypted at rest and protected in transit.
- Signed URLs for protected media and strict TTL defaults.
- Tenant isolation controls enforced at data access layer.
- No raw secrets in logs, events, or analytics payloads.

## Observability Requirements

- Structured logging with trace IDs across all services.
- Error monitoring and alerting for:
  - OAuth refresh failures
  - dead-letter queue growth
  - migration send failures
  - payment checkout failures
- Core dashboards for:
  - sync health
  - recommendation execution
  - migration conversion funnel

## Testing Requirements

- Unit tests for transforms, mapping logic, and entitlement checks.
- Integration tests for OAuth, queue retries, and payment adapters.
- End-to-end tests for onboarding, clone deployment, and Re-Populate flow.
- Security test coverage for auth bypass and cross-tenant access.

## Release Gates

- No release if SLO burn rate exceeds internal threshold.
- No migration flow release without dry-run evidence.
- No outreach release without suppression and unsubscribe checks passing.
