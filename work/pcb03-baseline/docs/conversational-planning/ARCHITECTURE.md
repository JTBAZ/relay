# Conversational planning architecture decisions

Architect: current parent agent. Planning author: gpt-6-sol. Implementation owner: gpt-6-luna. Updated 2026-10-14.

## Outcome and boundary

A creator describes a publishing sequence against selected Library content. Relay proposes typed, individually editable actions on the existing Schedule Rail. Confirming the plan initiates preparation and reminders. Every external publication remains a creator-controlled handoff. Data, metadata and file information are the interpreter inputs; image recognition is excluded. Previewizer remains an existing creator-reviewed transformation, not AI image analysis.

## Decisions for ticket authors and builders

1. Reuse the existing action registry and execution authorities: Library edit cart; social playbook atoms; CreatorScheduleEvent; AutopostDraft; PostDistributionPlan, variants and attempts; CreatorPreviewTemplate and Previewizer; existing reminder packets. Any new saved plan envelope is composition/provenance only, never a second execution ledger. A persistence design must demonstrate how retries map to existing records before approval.
2. A compact capability menu is an application contract. It need not introduce an MCP server or let the model execute arbitrary tools. Only authorized, currently supported capabilities appear. Unknown actions remain unresolved.
3. The interpreter returns intent and dependencies. Deterministic code resolves authorized IDs, validates parameters, checks entitlements and schedule semantics, and constructs a reviewable plan. Preserve manual edits on follow-up turns and detect stale revisions. Never guess destructive or broader scope from a matching title.
4. Separate proposed, confirmed-for-preparation, ready-for-handoff, handed-off, and confirmed-published facts. These are conceptual distinctions to map onto existing contracts, not permission to introduce duplicate status columns. A filled composer is not publication evidence. Never automatically click Publish or send replies.
5. Previewizer output must exist and belong to the creator before a teaser distribution plan materializes. Source artwork and teaser have distinct identities. Template selection, export, and destination approval keep their current human gates.
6. Follow-ups must declare their time anchor. Existing due_at playbooks retain their semantics; new publication-relative steps remain waiting until trusted publication evidence or explicit creator confirmation exists. Define timezone, DST, delayed publication, duplicates, missed reminders, cancellation and rescheduling before coding this adapter. Do not silently shift completed work.
7. 'Stoke engagement' becomes visible proposed existing actions, with an explicit assumption or focused clarification. Never invent audience interactions or promise engagement gains. Unknown X values in titles are clarified unless metadata resolves them unambiguously; literal requested titles are preserved.
8. Existing Autopost entitlement rules remain; Core manual actions are unaffected. Legacy automation presets remain bounded. New conversational composition does not silently activate deferred chaining in existing presets.
9. Production/default routing remains unchanged until metadata-only runtime evaluation proves acceptance. Coding-model Luna is an implementation assignment, not evidence that an identically named runtime model is available or meets product requirements. Verify candidate API availability, pricing and schema support before any paid benchmark.
10. No external tracking writes, posting, deployment, new chats, repo moves, or ledger resets are part of this program dispatch. Local ticket files are reviewable source of truth; the referenced .docs/anthropic/CURRENT_LEDGER_QUEUE.md is absent and no Airtable connector was available during planning.

## Review and dispatch

Sol authors the bounded plan. Parent architect reviews dependency and state-contract changes before Luna starts. Luna implements only the ticket-owned files and reports diff, tests, limitations and remaining questions. Parent accepts or returns the ticket; a passing unit suite alone cannot close a multi-platform UX gate. At most two implementation tickets may run concurrently, and only with disjoint files and independent accepted contracts. No implementation worker may expand scope or upgrade itself to Sol; return ambiguity for replanning. Use Luna medium for constrained adapters/copy, high for compiler, concurrency, persistence and time semantics. If high effort still fails, split the ticket and ask Sol to refine its plan, keeping implementation with Luna.

No further paid evaluation is authorized by this dispatch. Prepare offline corpus and harness first. Existing evaluation budget remains authoritative at C:\Users\jorda\Documents\Codex\2026-10-11\c\work\relay\.relay-data\gallery-editor-budget.json. Snapshot: development remaining $0.4098668; heldout remaining $8.9690346. Unknown historical costs remain reserved. Recheck ledger before any later paid dispatch; heldout budget cannot subsidize development tuning.

## Acceptance gate

The final synthetic end-to-end journey must show selected art -> Patreon draft title -> template review/export -> separate X and DeviantArt teaser handoffs -> day+1/+2 engagement reminders. Include cancellation, a changed teaser date, unavailable destination, partial image attachment failure (file transport only), duplicate confirmation, restart recovery and delayed publication. No pre-confirm execution, cross-creator access, lost manual edits, duplicate materialization or false completion is acceptable. Assess runtime semantic accuracy, unnecessary questions, latency, retries and cost per correctly completed task, including failures. Freeze evaluation cases before heldout use; no visual interpretation cases. A small metadata sample is baseline evidence, not a release claim.
