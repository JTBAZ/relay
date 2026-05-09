# Pilot load smoke (optional)

**Purpose:** P9-test-004 — light sustained traffic while you watch logs/latency. **Not** a substitute for real load testing at scale.

## Script

[`scripts/pilot-load-smoke.mjs`](../scripts/pilot-load-smoke.mjs) — hits:

1. `GET /api/v1/health/platform`
2. `GET /api/v1/health/analytics`
3. Optionally `GET /api/v1/gallery/items?creator_id=…&visitor=1` if `RELAY_LOAD_SMOKE_CREATOR_ID` is set  
4. Optionally `GET /api/v1/patron/feed` if `RELAY_LOAD_SMOKE_FEED=1` and `RELAY_LOAD_SMOKE_BEARER` is set  

## How to run

1. Start the API (`npm run build && npm run start`, or your staging URL).
2. From repo root:

```bash
npm run load:smoke:pilot
```

Quick test (shorter):

```bash
RELAY_LOAD_SMOKE_DURATION_SEC=30 RELAY_LOAD_SMOKE_RPS=2 npm run load:smoke:pilot
```

Point at staging:

```bash
RELAY_LOAD_SMOKE_BASE_URL=https://api.example.com RELAY_LOAD_SMOKE_DURATION_SEC=300 npm run load:smoke:pilot
```

Fail the process if any response is not 2xx:

```bash
RELAY_LOAD_SMOKE_STRICT=1 npm run load:smoke:pilot
```

## Recording a manual run

Paste the final `[load-smoke] done … ok=… fail=…` line into your pilot log or ticket (date, environment, commit).
