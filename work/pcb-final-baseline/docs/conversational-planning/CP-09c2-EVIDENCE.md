# CP-09c2 — Real source and attention preparation

Root accepted the bounded CP-09 source/attention integration on 2026-10-17 after source review and a passing real PostgreSQL proof. This closes the preparation dependency for grouped review UI authoring. It does not accept a complete compound journey or authorize production enablement.

Command: `node scripts/conversational-plan-test-db.mjs --run --suite cp09`. All 11 real scenarios passed in `relay_cp07_test_6f5ff4fbddb8a624373901ed798645b4`. Only that fresh nonce-owned local database received migrations and fixtures; the fixed harness disposed it. Root maintenance catalog checks afterward returned zero remaining nonce test databases and zero test roles. The ordinary application database was untouched.

The test uses production Prisma context, plan repository, preparation repository/materializer and owning draft/attention services. It proves:

- Concurrent preparation of the same approved plan yields one correlated source draft, attention event and pointer set with the correct media reservation. Two approved plans competing for one file produce one successful owner.
- Existing-post reuse preserves the selected attached source and binds attention to the exact post; wrong draft selectors and empty helper media cannot create stand-in drafts.
- Injected failure after real draft/pointer/reservation writes rolls that transaction back. A separate failed attention transaction preserves the committed source, rolls back its event/pointer, and succeeds on explicit retry without duplicating the source.
- A fresh Prisma client reuses persisted draft/event identities and repairs missing correlated pointers while preserving manually changed draft title/status and event title/note/date/status/URL.
- Own reservations leave the source fingerprint stable; genuine source revision drift blocks the next attention unit while retaining prior work. Creator/revision guards, cancellation before preparation and cancellation after committed outputs retain the expected state.
- Concurrent CP preparation respects the creator-serialized soft-cap check. Barrier-controlled legacy saves and media-changing patches both pass their real staging reads before competing; the losing patch retains its original media/reservation while the winner releases only its own original file.

Root independently passed all 11 offline harness safety tests and strict TypeScript checking for both changed TypeScript tests. The only harness extension is the closed `cp09` fixed-test selector and matching label/usage; loopback, nonce/comment ownership, environment scrubbing, fixed child commands and exact cleanup remain unchanged. Backend build and 56 integrated focused checks passed immediately before this test-only slice.

Limits: these are repository/materializer and owning-service tests, not full server startup, HTTP-confirm concurrency, process termination, unknown-commit transport simulation or a controlled cancellation-race trace. Cancellation is characterized in both sequential orders; existing CP-07 separately proves row-lock/CAS behavior. The broader pilot must retain its concurrency/cancellation matrix. Legacy writers still lack CP's creator cap serialization and may overshoot the soft cap. No global metadata linearizability is claimed after the final checked read. Preview export, source promotion after draft publication, destination handoffs and engagement remain separate original tickets. No provider call, image processing, budget-ledger change, flag/default change or external publication occurred.
