# CP-06a implementation evidence

`compileNewPlan` is implemented in `src/conversational-planning/compiler.ts`. It accepts the typed CP-05 `InterpretedRequest`, latest request text, creator and selected IDs, authoritative request clock/source fingerprint, a read-only creator-scoped lookup, an injected calendar resolver, and optional ID/clock seams. It returns a validated `PlanSnapshot`, an inert clarification preview, or a stable limitation. The compiler has no model, database-write, posting, preview-export, route, or materialization calls.

The exported `TrustedLookup` row types follow the frozen read seam in `COMPILER-PLAN.md`. The compiler validates returned row ownership and shape, resolves selected media to one exact linked post (or an eligible staged-media source), verifies source relations, parses an owned template config, preserves literal titles, and substitutes only one explicit placeholder token when the post has a verified series part. Missing template, title, destination, time, or engagement details stay inert. It assigns IDs and dependencies in server code and orders the Patreon distribution and handoff ahead of the later preview and teaser variants. It calls both contract validators before returning any snapshot.

`CalendarResolver` is frozen for CP-06b as:

```ts
type CalendarResolver = {
  resolve(input: {
    request: RequestIntent;
    requestClock: { receivedAtUtc: string; timezone: string | null };
    previousConfirmedTime?: Extract<TimeSpec, { kind: "absolute" }>;
  }): Promise<Extract<TimeSpec, { kind: "absolute" }> | null>
    | Extract<TimeSpec, { kind: "absolute" }> | null;
};
```

CP-06a passes the original typed request and authoritative request clock through this interface; a resolver failure creates an `unknown_time` clarification. The fake resolver in tests checks absolute placement only and makes no date or DST correctness claim.

Teaser-only compilation returns `{ kind: "limitation", code: "contract_gap" }` and no executable snapshot. The frozen `CompileResult` limitation shape contains no source field; the caller retains selected source context outside this result for review. Generic typed interpreter limitations return `unsupported_request` because CP-05 does not distinguish visual limitations from other unsupported requests. The compiler does not infer that distinction from request keywords.

## Verification

- `npx vitest run tests/conversational-planning/compiler.test.ts` — passed, 11 tests.
- `npm run build` — passed: Prisma client generation, backend TypeScript build, and build asset copy.

The focused tests cover the Patreon-first graph, saved template snapshots, X/DeviantArt preview dependencies, literal `X`, verified part substitution and malformed placeholders, both X publication-relative actions, deterministic fake absolute time, ambiguous and foreign sources, missing/foreign template references, missing and unlinked destination details, staged media, visual/unsupported typed results, inert follow-up clarification, contract-gap teaser-only requests, missing source, attachment repair, invalid quote, and malformed interpreted shape.
