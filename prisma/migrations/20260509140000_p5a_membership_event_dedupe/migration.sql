-- P5a-db-003 — Idempotent membership ingest: one row per logical Patreon membership change instant.
-- Rule: replays that reproduce the same (creator_id, patreon_member_id, event_type, occurred_at) fail the unique constraint.
-- If sub-millisecond Patreon events ever collide on TIMESTAMP(3), add an optional `dedupe_key` + separate unique (see schema comment).

CREATE UNIQUE INDEX "creator_membership_events_creator_id_patreon_member_id_event_type_occurred_at_key" ON "creator_membership_events"("creator_id", "patreon_member_id", "event_type", "occurred_at");
