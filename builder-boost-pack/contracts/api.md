# API Contracts

## Purpose

Define canonical API patterns for Action Center, migration orchestration, and operational health endpoints.

## Global API Conventions

- Base path: `/api/v1`
- Auth: bearer token (tenant scoped)
- Content type: `application/json`
- Pagination: cursor-based
- Error format is standardized across services
- Naming conventions:
  - endpoint paths use kebab-case
  - query/body keys use snake_case
  - IDs use `*_id` format (`creator_id`, `recommendation_id`, etc.)

## Standard Error Response

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "tier_id is required",
    "details": [
      {
        "field": "tier_id",
        "issue": "missing"
      }
    ],
    "trace_id": "trace_abc"
  }
}
```

## Standard Success Envelope

```json
{
  "data": {},
  "meta": {
    "trace_id": "trace_abc"
  }
}
```

## Action Center Endpoints

### GET /api/v1/action-center/cards

Query parameters:

- `creator_id` (required)
- `impact_area` (optional)
- `confidence_min` (optional)
- `cursor` (optional)
- `limit` (optional, default 20, max 100)

Response `data` shape:

```json
{
  "items": [
    {
      "recommendation_id": "rec_123",
      "card_type": "cadence_rescue",
      "title": "Cadence Rescue: Tier 2 churn risk",
      "signal": "Churn up 2.3% in 14 days",
      "diagnosis": "Posting cadence fell 3 -> 1",
      "recommendation": "Schedule 2-part themed drop",
      "confidence_score": 0.74,
      "expected_impact": {
        "metric": "churn_rate",
        "delta_range": [-0.015, -0.008],
        "horizon_days": 30
      },
      "status": "open"
    }
  ],
  "next_cursor": "cur_456"
}
```

### POST /api/v1/action-center/cards/{recommendation_id}/accept

Request:

```json
{
  "creator_id": "creator_123",
  "notes": "Looks good"
}
```

Response:

```json
{
  "data": {
    "recommendation_id": "rec_123",
    "status": "accepted"
  },
  "meta": {
    "trace_id": "trace_abc"
  }
}
```

### POST /api/v1/action-center/cards/{recommendation_id}/execute

Request:

```json
{
  "creator_id": "creator_123",
  "action_type": "generate_post_drafts",
  "options": {
    "count": 2,
    "theme": "continuing story arc",
    "target_tier_ids": ["tier_2"]
  }
}
```

Response:

```json
{
  "data": {
    "recommendation_id": "rec_123",
    "action_job_id": "job_987",
    "execution_status": "queued"
  },
  "meta": {
    "trace_id": "trace_abc"
  }
}
```

### POST /api/v1/action-center/cards/{recommendation_id}/dismiss

Request:

```json
{
  "creator_id": "creator_123",
  "reason_code": "not_relevant_now"
}
```

Response:

```json
{
  "data": {
    "recommendation_id": "rec_123",
    "status": "dismissed"
  },
  "meta": {
    "trace_id": "trace_abc"
  }
}
```

### GET /api/v1/action-center/cards/{recommendation_id}/explanation

Response:

```json
{
  "data": {
    "recommendation_id": "rec_123",
    "reason_codes": ["cadence_drop", "series_gap"],
    "evidence_refs": ["snapshot_111", "post_222"],
    "confidence_score": 0.74
  },
  "meta": {
    "trace_id": "trace_abc"
  }
}
```

## Migration and Re-Populate Endpoints

### POST /api/v1/migrations/campaigns

Creates migration campaign draft with tier mapping.

### POST /api/v1/migrations/campaigns/{campaign_id}/preflight

Runs checks:

- suppression list
- link generation validity
- template quality
- recipient tier mapping completeness

### POST /api/v1/migrations/campaigns/{campaign_id}/send

Starts staged send (batch-aware).

### GET /api/v1/migrations/campaigns/{campaign_id}

Returns live delivery and conversion metrics.

## Operational Endpoints

### GET /api/v1/health

Returns service health and dependency status.

### GET /api/v1/metrics/summary?creator_id=...

Returns key KPIs for dashboard cards.

## API Security Requirements

- All mutation endpoints require tenant-scoped auth.
- Mass-outreach mutations require explicit creator confirmation token.
- Request and response logs must include trace IDs, never raw secrets.
- Rate limits:
  - read endpoints: higher burst
  - execute/send endpoints: strict burst and sustained controls
