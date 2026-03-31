# Event Contracts

## Purpose

Define canonical event names and payload shapes used across ingestion, analytics, recommendation, migration, and outreach systems.

## Contract Rules

- Event names are snake_case, past tense where applicable.
- Every event must include common metadata envelope.
- Producers are responsible for schema validity.
- Consumers must ignore unknown fields for forward compatibility.
- Each event payload must include a deterministic `primary_id` field for idempotency and deduplication.

## Identity Model

- `tenant_id` (envelope) is the security, billing, and isolation boundary.
- `creator_id` (payload) is the creator domain actor inside a tenant.
- In single-creator tenants, values may map 1:1 logically, but both fields must still be carried explicitly.

## Common Envelope

```json
{
  "event_id": "evt_01J...",
  "event_name": "post_published",
  "occurred_at": "2026-03-30T12:00:00Z",
  "producer": "ingestion-service",
  "version": "1.0",
  "tenant_id": "creator_123",
  "trace_id": "trace_abc",
  "payload": {}
}
```

## Core Domain Events

### post_published (v1.0)

```json
{
  "primary_id": "post_123",
  "post_id": "post_123",
  "creator_id": "creator_123",
  "published_at": "2026-03-30T12:00:00Z",
  "title": "Episode 5",
  "tag_ids": ["tag_story", "tag_characterA"],
  "tier_ids": ["tier_gold"],
  "media_ids": ["media_1", "media_2"]
}
```

### post_tagged (v1.0)

```json
{
  "primary_id": "post_123",
  "post_id": "post_123",
  "creator_id": "creator_123",
  "tag_source": "ai_or_manual",
  "tag_ids": ["tag_story", "tag_characterA"],
  "confidence_map": {
    "tag_story": 0.88,
    "tag_characterA": 0.79
  }
}
```

### member_joined (v1.0)

```json
{
  "primary_id": "mem_123",
  "member_id": "mem_123",
  "creator_id": "creator_123",
  "tier_id": "tier_gold",
  "joined_at": "2026-03-30T12:00:00Z",
  "source": "patreon_or_clone"
}
```

### member_churned (v1.0)

```json
{
  "primary_id": "mem_123",
  "member_id": "mem_123",
  "creator_id": "creator_123",
  "tier_id": "tier_gold",
  "churned_at": "2026-03-30T12:00:00Z",
  "known_reason_code": "payment_failed_or_unknown"
}
```

### member_tier_changed (v1.0)

```json
{
  "primary_id": "mem_123",
  "member_id": "mem_123",
  "creator_id": "creator_123",
  "from_tier_id": "tier_silver",
  "to_tier_id": "tier_gold",
  "changed_at": "2026-03-30T12:00:00Z",
  "change_type": "upgrade_or_downgrade"
}
```

### recommendation_shown (v1.0)

```json
{
  "primary_id": "rec_123",
  "recommendation_id": "rec_123",
  "creator_id": "creator_123",
  "card_type": "cadence_rescue",
  "confidence_score": 0.74,
  "expected_metric": "churn_rate",
  "shown_at": "2026-03-30T12:00:00Z"
}
```

### recommendation_accepted (v1.0)

```json
{
  "primary_id": "rec_123",
  "recommendation_id": "rec_123",
  "creator_id": "creator_123",
  "accepted_at": "2026-03-30T12:00:00Z",
  "action_type": "generate_post_drafts"
}
```

### recommendation_executed (v1.0)

```json
{
  "primary_id": "rec_123",
  "recommendation_id": "rec_123",
  "creator_id": "creator_123",
  "action_job_id": "job_987",
  "executed_at": "2026-03-30T12:00:00Z",
  "execution_status": "success_or_failed"
}
```

### recommendation_outcome_evaluated (v1.0)

```json
{
  "primary_id": "rec_123",
  "recommendation_id": "rec_123",
  "creator_id": "creator_123",
  "evaluated_at": "2026-04-30T12:00:00Z",
  "metric": "churn_rate",
  "predicted_delta": -0.01,
  "actual_delta": -0.008
}
```

## Migration and Outreach Events

### migration_campaign_created (v1.0)

```json
{
  "primary_id": "mig_123",
  "campaign_id": "mig_123",
  "creator_id": "creator_123",
  "created_at": "2026-03-30T12:00:00Z",
  "target_tier_map_count": 3
}
```

### migration_campaign_sent (v1.0)

```json
{
  "primary_id": "mig_123_batch_1",
  "campaign_id": "mig_123",
  "creator_id": "creator_123",
  "sent_at": "2026-03-30T12:00:00Z",
  "recipient_count": 1200,
  "staged_batch": 1
}
```

### migration_repopulate_link_clicked (v1.0)

```json
{
  "primary_id": "mig_123_mem_123",
  "campaign_id": "mig_123",
  "creator_id": "creator_123",
  "member_id": "mem_123",
  "tier_id": "tier_gold",
  "clicked_at": "2026-03-30T12:00:00Z"
}
```

### migration_resubscribe_completed (v1.0)

```json
{
  "primary_id": "mig_123_mem_123",
  "campaign_id": "mig_123",
  "creator_id": "creator_123",
  "member_id": "mem_123",
  "tier_id": "tier_gold",
  "completed_at": "2026-03-30T12:00:00Z",
  "payment_provider": "stripe_or_paypal"
}
```

## Reliability Rules

- At-least-once delivery is acceptable; consumers must be idempotent.
- Deduplication key recommendation:
  - `event_name + tenant_id + payload.primary_id + occurred_at`.
- Dead-letter events must retain full envelope and producer error context.
