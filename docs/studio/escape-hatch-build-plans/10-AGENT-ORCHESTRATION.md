# Agent orchestration contract

## Non-negotiable role boundary

Fable or Sol is the master planner/reviewer. The master may:

- read code, docs, git history, and current milestone evidence;
- refine product contracts;
- decompose and sequence work;
- issue sealed builder prompts;
- use the browser to inspect UX;
- review diffs, tests, security evidence, and milestone results;
- update planning/status documentation and milestone reports.

The master must not implement production code, UI, migrations, adapters, or tests.

All implementation is delegated to one approved builder:

- **Cursor Grok 4.5 High:** auth, entitlements, paywall/media delivery, billing adapters, provider webhooks, Patreon mediation, data migrations, deployment architecture, backup/restore, security fixes, complex integration/debugging, wizard UI, generated-theme/admin UI, fixture creation, bounded adapters, test implementation, documentation wiring, and mechanical/refactor work.

Do not recruit Composer 2.5 Fast for Escape Hatch implementation. If Cursor Grok 4.5 High is unavailable, stop and ask the human. Do not silently substitute.

## Risk routing

Cursor Grok 4.5 High owns every implementation slice. Security-critical work remains isolated behind explicit file ownership, security review, and human gates when failure could expose premium bytes, cross tenants, move money, corrupt migration data, break recovery, or misrepresent provider policy.

Cursor Grok 4.5 High receives UI slices only after the master supplies:

- user job and screen contract;
- allowed files/components;
- real fixture/data contract;
- loading/empty/error/recovery states;
- browser acceptance steps;
- prohibited scope.

## Required skills

The master includes skill requirements in every prompt.

| Task | Required guidance |
|---|---|
| Wizard/admin/visitor UI | `frontend-design`, `vercel-react-best-practices`; `web-design-guidelines` for review |
| Existing UI redesign | `redesign-existing-projects` where the task materially reshapes an existing surface |
| Supabase/Auth/RLS | `supabase`, `supabase-postgres-best-practices` |
| Prisma schema/migration | relevant Prisma migration/validate/generate skills plus migration best-practice rule |
| Stripe billing | `stripe-best-practices`; `connect-recommend` only for Connect decisions |
| Security-critical diff | `review-security` / `security-review` subagent |
| Browser UX | `browser-use` agent |

Skills are read before implementation, not cited after the fact.

## Sealed builder prompt

Every work item must include:

```text
Role and approved model
User outcome
Current contract and source files
Owned files
Files explicitly off-limits
Required skills
Implementation requirements
Security/privacy constraints
Real fixture/data shapes
Automated tests and exact commands
Browser acceptance script
Expected evidence
Stop conditions and human gates
```

No builder receives “finish Escape Hatch” as an open-ended task.

## File ownership

- One active writer per file.
- Parallel builders receive non-overlapping files or isolated worktrees.
- The master reconciles shared-contract changes before downstream prompts.
- Builders do not rewrite unrelated dirty work.
- Changes to canonical Patreon/tier contracts require explicit compatibility review.

## Execution state

Escape Hatch does not use Airtable as a build control plane. The program docs define scope/dependencies, git commits or PRs define implementation truth, and milestone reports record evidence and next work. Do not create, lock, or update Airtable rows for this program unless the human explicitly reintroduces that workflow later.

## Browser smart-guide obligation

The master uses browser evidence as product review, not ceremonial smoke testing:

1. complete the creator job through visible UI;
2. observe wording, order, external provider handoff, wait states, and recovery;
3. inspect desktop/mobile and keyboard operation;
4. identify friction with concrete screenshots/steps;
5. issue a correction prompt to Cursor Grok 4.5 High;
6. retest before acceptance.

The master browser-runs every UI slice and the complete golden journey at each milestone. A builder cannot self-certify its own UX.

## Review and acceptance

The master requires:

- diff summary by owned file;
- exact tests and exit codes;
- skipped tests and why;
- screenshots/browser evidence;
- security review for critical slices;
- provider-policy URLs/check date when relevant;
- remaining risks and rollback.

Green unit tests do not override a failed browser, security, policy, migration, or restore gate.

## Stop conditions

Stop and escalate when:

- OAuth, billing, hosting, email, or content policy is uncertain;
- a provider requires live charges or irreversible production action;
- a secret or real patron dataset is needed;
- migration would delete/overwrite source data;
- premium media is reachable without authorization;
- required approved builder model is unavailable;
- branch, worktree, or file ownership conflicts;
- acceptance would require claiming an unrun test passed.

## Session report

Each milestone report names:

- master planner/reviewer;
- builder model per work item;
- skills used;
- files and contracts changed;
- automated/browser/security evidence;
- human decisions;
- milestone status and next dependency.

This attribution is an execution contract, not proof derivable from git. Missing attribution blocks milestone acceptance.
