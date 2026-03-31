# Definition of Done (DoD)

This DoD applies to all workstreams in Part 1 and Part 2.

## 1) Functional Completion

- Feature behavior matches roadmap workstream intent.
- Acceptance criteria and exit-gate metrics are implemented or instrumented.
- Edge cases and failure states are handled explicitly.

## 2) Contract Compliance

- API and event contracts align with:
  - [contracts/api.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\api.md)
  - [contracts/events.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\contracts\events.md)
- Contract versioning is updated where breaking changes occur.
- Backward compatibility impact is documented.

## 3) Security and Compliance

- Relevant checklist items pass in:
  - [standards/security-compliance-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\standards\security-compliance-checklist.md)
- No credentials or sensitive payload leakage in logs.
- Outreach-related features enforce suppression and unsubscribe behavior.

## 4) NFR and Operability

- NFR targets are met or exceptions are documented and approved.
- Logging, metrics, and tracing added for new critical paths.
- Alerts configured for new failure modes.

Reference:
- [standards/non-functional-requirements.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\standards\non-functional-requirements.md)

## 5) Testing

- Unit and integration tests added or updated.
- End-to-end coverage updated for user-facing flows.
- Negative-path tests cover invalid inputs and degraded dependencies.

## 6) Documentation and Traceability

- Workstream traceability row updated in:
  - [delivery/workstream-traceability-matrix.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\workstream-traceability-matrix.md)
- Any decision changes reflected in:
  - [builder-decision-checklist.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\builder-decision-checklist.md)

## 7) Release Readiness

- Feature flags or rollout controls are in place if needed.
- Rollback plan exists and is tested for high-risk flows.
- Owner and support handoff notes are complete.

## 8) Checkpoint Stop Gate (Token Efficiency Policy)

- Builder must stop at the completion of each workstream (A through J) and request user approval before proceeding.
- Builder must not begin the next workstream until user explicitly approves continuation.
- At each stop, builder must provide a concise handoff summary using:
  - [delivery/handoff-checkpoints.md](c:\Users\jorda\Documents\Coding Projects\Rescue\builder-boost-pack\delivery\handoff-checkpoints.md)
- Handoff summary must include:
  - what was completed
  - what remains next
  - model recommendation for next step (`Auto (efficiency)`, `Opus (reasoning)`, or `Max`)
  - one-line reason for that model recommendation

## DoD Sign-Off Template

```md
Workstream:
Scope:
Contracts validated:
Security/compliance validated:
NFR status:
Tests passed:
Traceability updated:
Rollback validated:
Approved by:
```

## Checkpoint Handoff Template (Required at Stop)

```md
Checkpoint:
Completed in this checkpoint:
Remaining work before next checkpoint:
Risks or blockers:
Recommended next model: Auto (efficiency) | Opus (reasoning) | Max
Reason for model recommendation:
User action requested: Approve next checkpoint or adjust scope/model.
```
