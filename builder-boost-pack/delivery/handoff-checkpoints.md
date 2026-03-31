# Handoff Checkpoints

## Purpose

Standardize builder stop points to maximize token efficiency and improve user control over model selection between checkpoints.

Use this file at every mandatory stop gate.

## Trigger Rule

Builder must trigger a handoff when any of the following occurs:

- Current workstream is completed (A through J).
- A blocker requires a strategic choice.
- Implementation enters a reasoning-heavy area that may justify model escalation.
- The task drifts beyond the approved scope for the current checkpoint.

## Handoff Output Requirements (User-Facing)

Each handoff message must include:

1. What has been done.
2. What still needs to be done.
3. Risks, blockers, or assumptions.
4. Recommended model for the next segment:
   - `Auto (efficiency)` for deterministic implementation and routine test/fix loops.
   - `Opus (reasoning)` for complex logic decisions, architecture branching, or non-trivial refactors.
   - `Max` for the most complex high-risk segments (payments, migration orchestration, audience recovery logic).
5. One-line explanation for model recommendation.
6. Explicit user action request:
   - approve continuation
   - adjust scope
   - override model recommendation

## Token Efficiency Guardrails

- Keep handoff summaries concise (5 to 8 bullets max).
- Do not reprint large document content in handoff updates.
- Reference changed files by path only.
- Recommend `Auto (efficiency)` unless complexity clearly demands escalation.

## Handoff Template

```md
Checkpoint: <Workstream and slice>

Completed:
- ...

Remaining:
- ...

Risks/Blockers:
- ...

Recommended next model: Auto (efficiency) | Opus (reasoning) | Max
Why this model: <one-line reason>

User decision needed:
- Approve next checkpoint
- Adjust scope
- Override model recommendation
```

## Model Recommendation Rubric

- Use `Auto (efficiency)` when:
  - contracts are already defined
  - work is mostly implementation, tests, and small bug fixes
- Use `Opus (reasoning)` when:
  - there are multi-path technical choices
  - cross-cutting behavior must be reconciled
- Use `Max` when:
  - changes combine legal/compliance, payments, migration risk, and difficult data-flow reasoning
  - mistake cost is high and ambiguity remains
