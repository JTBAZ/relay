# Goals lab frame — beat → Goal Cycle API map

**Status:** Frame-only on `/studio/lab`. Mock dialogue; no approve/materialize wiring in this pass.  
**Product spine:** [`goal-cycle-build-plans/COACH-PLAN-CONVERSATIONAL-UX-PASS.md`](./goal-cycle-build-plans/COACH-PLAN-CONVERSATIONAL-UX-PASS.md)

| Lab chat beat | UI intent | Future Goal Cycle mapping (do not invent new APIs here) |
|---|---|---|
| 0 Closed | Goals nav idle | — |
| 1 Activate | Greeting + optional positive chip + “Plan this month” | Launcher / `plan_this_month` CTA |
| 2 Goal (+ break mode) | Bounded goal chips | `start` + goal kind / break mode |
| 3 Context | One vibe chip question | `context` fields (topic/niche/notes) under the hood |
| 4 Scan | Narrated progress + one takeaway | Research phase progress / evidence collapse |
| 5 Soft strategy | Approach + Looks good / adjust | Questions slot + gate before `generate` |
| 6 Plan card | Itemized checklist | Plan + logistics preview |
| 7 Revise (≤2) | Free-text revise | `revise` + `ai_revision_count`; then manual-edit only |
| Confirm success (frame) | Calm handoff copy | Later: `approve` → materialization receipt → rail highlight |

**Fence:** Frame must not write Schedule Rail events. Later precision pass hooks Beat 6/7 confirm → existing `approveCreatorGoalCycle` + `onMaterialized`.
