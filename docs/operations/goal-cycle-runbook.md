# Goal Cycle — operations runbook

Engineering and on-call reference for feature flags, rollback, and observability signals. Product contract: [`docs/studio/GOAL_CYCLE_PRODUCT_CONTRACT.md`](../studio/GOAL_CYCLE_PRODUCT_CONTRACT.md). Program: [`docs/studio/goal-cycle-build-plans/00-README.md`](../studio/goal-cycle-build-plans/00-README.md).

**Secrets:** Name env vars only. Never paste real keys into tickets or commits.

**Incident owner (local/staging):** Relay API on-call — Goal Cycle slice VS11 until rollout sign-off (VS11-T06).

**Rollout package / human checklist:** [`docs/qa/goal-cycle-release-evidence.md`](../qa/goal-cycle-release-evidence.md) § VS11-T06. Do not expand beyond the approved cohort or flip production flags without signed rows there.

---

## 1. Feature flags and kill switches

| Variable | Default (`.env.example`) | Effect when off / constrained |
|----------|--------------------------|-------------------------------|
| `RELAY_GOAL_CYCLE_ENABLED` | `false` | Master gate. Off → creator Goal Cycle HTTP routes return **404**; `startGoalCycle` rejects; credit grant/expiry and outcome workers skip. |
| `RELAY_GOAL_CYCLE_AI_ENABLED` | `false` | Off → deterministic planner path only (no AI questions/plan/revision). |
| `RELAY_GOAL_CYCLE_TREND_MODE` | `fixture` | `fixture` / `history_only` / `disabled` / `live`. `disabled` and `history_only` skip interest/web providers. `live` fail-closed until VS10 adapters exist. |
| `RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED` | `false` | Off → `approveAndMaterialize` fails with `materialization_disabled` (no new posts/rail events). |
| `RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS` | unset → 6h | Set to `0` / `off` / `false` → no BullMQ outcome refresh schedule. |
| `RELAY_GOAL_CYCLE_OUTCOME_REFRESH_BATCH` | unset → 40 | Batch size only. |

Related Coach Plan credit jobs: `RELAY_COACH_PLAN_INCLUDED_CREDITS`, `RELAY_COACH_PLAN_GRANT_INTERVAL_MS`, `RELAY_COACH_PLAN_EXPIRY_INTERVAL_MS`.

**Not implemented:** dedicated `RELAY_GOAL_CYCLE_TRENDS_KILL_SWITCH` — use `TREND_MODE=disabled` (or `fixture` for non-live). Live provider circuit breaker is **VS10** (blocked).

Flag parsing: `src/goal-cycle/contracts.ts` → `getGoalCycleFeatureFlags`.

---

## 2. Rollback rehearsal (preferred order)

Goal (VS11 contract): **disable new starts and materialization first**, while preserving read/resume/audit and existing scheduled tasks where possible.

### Practical staging rollback (preserve audit)

Leave master **on**, turn writes/jobs off:

1. Set `RELAY_GOAL_CYCLE_MATERIALIZATION_ENABLED=false` — blocks new approvals/materialization.
2. Set `RELAY_GOAL_CYCLE_AI_ENABLED=false` — no AI spend on new planning.
3. Set `RELAY_GOAL_CYCLE_TREND_MODE=disabled` (or keep `fixture` if research must stay deterministic).
4. Set `RELAY_GOAL_CYCLE_OUTCOME_REFRESH_MS=off` — stop outcome refresh ticks.
5. Optionally pause Coach Plan grant/expiry intervals if credit grants must freeze.
6. **Restart API** (and workers) so every process reloads env.
7. Verify: GET active cycle / `/studio/goals` still works; new **Approve Plan** fails; rail events already materialized remain.

### Hard stop (all Goal Cycle API)

1. Set `RELAY_GOAL_CYCLE_ENABLED=false` and restart API + workers.
2. Effect: all creator Goal Cycle routes **404**, including GET/audit. Existing rail tasks and unpublished drafts **remain** in DB/rail; creators can still open posts via Library/Designer and confirm publish manually.
3. Prefer this only for emergency total disable — it does **not** match “preserve audit” until route-layer read exceptions exist (known gap; see §5).

### After rollback

- Confirm no new `creator_goal_cycles` rows in `active`/`planning` from the freeze window.
- Confirm posting rhythm / destination publish paths still require human confirmation (extension never auto-publishes).

---

## 3. Observability signals (VS11-T05)

| Signal | Current tooling | How to verify | Alert / health gate |
|--------|-----------------|---------------|---------------------|
| Credit drift | `reconcileCoachPlanCreditWallet` in `src/usage/coach-plan-credit-service.ts` | Unit/integration: `tests/usage/coach-plan-credit-service.test.ts`, concurrency tests | **No** dedicated `gates.alerts` — repair exists; scrape/alert gap |
| Materialization failures | Pino `goal-cycle-materialization` route error + `GOAL_CYCLE_MATERIALIZATION_FAILED` | Approve with mat flag off; grep logs for `goal_cycle_materialization` / route failed | Log only — no `/health/goal-cycle` |
| Provider circuit breaker | Timeout/cache only in trend gateway | N/A until VS10 live adapters | **N/A — VS10 blocked** |
| Job lag | Worker tick / per-cycle failure logs (`goal-cycle-outcome-worker`, credit grant worker) | Set outcome refresh `off`; confirm no new repeat schedule; watch tick logs under load | No queue-depth lag alert |
| Extension packet errors | Extension classifies revoked/offline/outdated; due-packet contract | `tests/extension/goal-cycle-reminder.test.ts` | No ops metric emitter |
| Attribution refresh | Audit log `event: "goal_cycle_audit"` / `attribution_refresh` | POST `/api/v1/creator/goal-cycles/:id/attribution/refresh` | Audit log only |

**Health endpoints today:** `/api/v1/health`, `/health/ingest`, `/part1a`, `/analytics`, `/export`, `/platform` — **none** include Goal Cycle `gates.alerts`. Closest pattern to copy later: analytics insight job metrics.

**Dashboards:** No Grafana/Datadog Goal Cycle boards in-repo. Platform metrics registry does not seed Goal Cycle keys.

---

## 4. Quick verify commands

```bash
# Flag + outcome kill-switch + materialization refuse
npx vitest run tests/goal-cycle/goal-cycle-rollback-observability.test.ts
npx vitest run tests/goal-cycle/goal-cycle-materialization.test.ts
npx vitest run tests/goal-cycle/goal-cycle-vs9-prove.test.ts -t "kill-switch"
npx vitest run tests/usage/coach-plan-credit-service.test.ts

# Extension packet health classification
npx vitest run tests/extension/goal-cycle-reminder.test.ts
```

Stack: API `:8787`, web `:3000`. After env changes: `npm run dev:stack:restart` (or restart API + workers).

---

## 5. Known gaps (do not invent passes)

1. Master-off **404s audit/GET** — softer “preserve audit” rollback is mat/AI/jobs off with `ENABLED=true`.
2. No `/api/v1/health/goal-cycle` and no pager alerts for the six signals above.
3. Live trend kill switch / circuit breaker / cost provenance → **VS10**.
4. Dedicated trend kill-switch env name documented in some plans is **not** implemented — use `TREND_MODE`.

Track disposition in [`docs/qa/goal-cycle-release-evidence.md`](../qa/goal-cycle-release-evidence.md). Production flag flips and pilot expansion require **VS11-T06** human sign-off.

---

## 6. Related docs

- Extension ops: [`extension-runbook.md`](extension-runbook.md)
- Release evidence: [`../qa/goal-cycle-release-evidence.md`](../qa/goal-cycle-release-evidence.md)
- VS11 plan: [`../studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md`](../studio/goal-cycle-build-plans/12-VS11-PRODUCTION-VERIFICATION.md)
