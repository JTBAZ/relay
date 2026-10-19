# CP-06b calendar resolver evidence

Implemented the pure calendar resolver in `src/conversational-planning/calendar-resolver.ts`. It accepts the interpreted request, server request clock, frozen creator zone, and optional previously confirmed absolute time. UTC inputs receive strict calendar/time round-trip validation, so JavaScript date normalization cannot make an impossible instant valid. When local time is omitted, a coherent previously confirmed time may be inherited for either an explicit date or weekday. Its compiler adapter takes timezone authority only from `requestClock.timezone`; a model-supplied zone that conflicts with that value returns `null`. Missing or invalid clock, zone, date, or time returns the contract's `unknown_time` clarification result.

Weekday dates use the creator-local date of the supplied UTC instant and ISO Monday-to-Sunday week boundaries. Unqualified weekdays select the next occurrence, allowing today only when the resolved instant is future. `this` uses the current ISO week and clarifies when the instant has passed; `next` uses the following ISO week. Calendar date changes use UTC calendar fields, not 24-hour increments.

The existing `zonedLocalDateTimeToUtc` helper does not encode the frozen DST policy: its offset correction can settle on the later fall-fold occurrence, and its fixed iterations do not guarantee the first valid minute after a spring gap. This resolver instead checks possible offsets around the local wall time, requires an exact local round trip, selects the earliest UTC candidate in a fold, and advances a gap minute-by-minute to the first valid time on the same date. Offset probes and same-day search have finite bounds.

Focused tests use deterministic supplied clocks and no provider, database, network, or paid calls. They cover London and New York, explicit dates, unqualified cutoff, `this`/`next` ISO weeks, year rollover, spring gap, fall fold, invalid dates, missing/invalid inputs, confirmed-time inheritance, model-zone mismatch, process-zone independence, and the compiler adapter.

Validation:

- `npx vitest run tests/conversational-planning/calendar-resolver.test.ts` — passed, 11 tests.
- `npm run build` — passed (Prisma client generation, TypeScript build, and build asset copy).

The adapter deliberately returns `null` for unresolved time because that is the frozen `CalendarResolver` interface. The richer pure function returns `{ kind: "clarification", reason: "unknown_time" }` for the caller to map to a focused clarification slot.
