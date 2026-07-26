/**
 * Frozen Goal Cycle due-packet fixtures (VS8-T01).
 * Safe titles/instructions only — no private media bytes or patron data.
 */

import { GOAL_CYCLE_DUE_PACKET_VERSION } from "../execution/goal-cycle-due-packet.js";
import type { ScheduleReminderPacket } from "../../distribution/schedule-reminder-extension-api.js";

export const GOAL_CYCLE_DUE_PACKET_FIXTURE_VERSION = GOAL_CYCLE_DUE_PACKET_VERSION;

const BASE_CTA = {
  kind: "relay_studio" as const,
  url: "http://localhost:3000/studio",
  label: "Review in Relay"
};

function basePacket(
  patch: Partial<ScheduleReminderPacket> = {}
): ScheduleReminderPacket {
  return {
    reminder_id: "schedule_reminder:task:task_fixture",
    task_id: "task_fixture",
    variant_id: "var_fixture",
    post_id: "relay_p_fixture",
    destination: "patreon",
    action: "post",
    title: "Fixture reminder",
    open_url: null,
    due_at: "2026-07-20T23:00:00.000Z",
    plan_label: "Goal Cycle plan",
    media_ready: true,
    primary_cta: BASE_CTA,
    secondary_cta: null,
    goal_cycle_id: null,
    goal_cycle_slot_id: null,
    campaign_key: null,
    relay_post_id: null,
    distribution_plan_id: null,
    rail_event_id: null,
    task_kind: null,
    due_local: null,
    time_zone: null,
    media_requirements: [],
    instructions: null,
    ...patch
  };
}

/** New-post / publish path with media ready. */
export const GOAL_CYCLE_DUE_PACKET_PUBLISH_FIXTURE: ScheduleReminderPacket = basePacket({
  reminder_id: "schedule_reminder:task:task_publish",
  task_id: "task_publish",
  title: "Evening sketch drop",
  media_ready: true,
  primary_cta: {
    kind: "relay_autopost",
    url: "http://localhost:3000/studio/autopost",
    label: "Open in Autopost"
  },
  secondary_cta: {
    kind: "external_post",
    url: "https://www.patreon.com/posts/example",
    label: "Open on Patreon"
  },
  open_url: "https://www.patreon.com/posts/example",
  goal_cycle_id: "cycle_dream_seed",
  goal_cycle_slot_id: "slot_1",
  campaign_key: "gc_camp_cycle_dream_seed",
  relay_post_id: "relay_p_fixture",
  distribution_plan_id: "plan_fixture",
  rail_event_id: "task_publish",
  task_kind: "publish",
  due_local: "2026-07-20T19:00:00",
  time_zone: "America/New_York",
  media_requirements: [],
  instructions: "Review the draft in Relay, then confirm publish on Patreon."
});

/** Publish path waiting on media. */
export const GOAL_CYCLE_DUE_PACKET_MISSING_MEDIA_FIXTURE: ScheduleReminderPacket = basePacket({
  reminder_id: "schedule_reminder:task:task_missing_media",
  task_id: "task_missing_media",
  title: "Warm-up (needs media)",
  media_ready: false,
  primary_cta: {
    kind: "relay_autopost",
    url: "http://localhost:3000/studio/autopost",
    label: "Stage in Autopost"
  },
  goal_cycle_id: "cycle_dream_seed",
  goal_cycle_slot_id: "slot_2",
  campaign_key: "gc_camp_cycle_dream_seed",
  relay_post_id: "relay_p_missing",
  distribution_plan_id: "plan_missing",
  rail_event_id: "task_missing_media",
  task_kind: "publish",
  due_local: "2026-07-21T19:00:00",
  time_zone: "America/New_York",
  media_requirements: ["attach_media"],
  instructions: "Attach media in Relay, then confirm publish on Patreon."
});

/** Social upkeep — no fake publish post required. */
export const GOAL_CYCLE_DUE_PACKET_UPKEEP_FIXTURE: ScheduleReminderPacket = basePacket({
  reminder_id: "schedule_reminder:task:task_upkeep",
  task_id: "task_upkeep",
  action: "repost",
  title: "Reply to a recent post",
  media_ready: true,
  primary_cta: {
    kind: "external_post",
    url: "https://x.com/home",
    label: "Open on X"
  },
  open_url: "https://x.com/home",
  destination: "x",
  goal_cycle_id: "cycle_upkeep",
  goal_cycle_slot_id: "slot_upkeep_1",
  campaign_key: "gc_camp_cycle_upkeep",
  relay_post_id: "relay_p_upkeep",
  distribution_plan_id: "plan_upkeep",
  rail_event_id: "task_upkeep",
  task_kind: "social_upkeep",
  due_local: "2026-07-22T12:00:00",
  time_zone: "America/New_York",
  media_requirements: [],
  instructions: "Social upkeep on X — engage without publishing a new Relay post."
});

/** Active rest — light touch, never masquerades as published. */
export const GOAL_CYCLE_DUE_PACKET_ACTIVE_REST_FIXTURE: ScheduleReminderPacket = basePacket({
  reminder_id: "schedule_reminder:task:task_rest",
  task_id: "task_rest",
  action: "schedule",
  title: "Quiet check-in",
  media_ready: true,
  destination: "bluesky",
  goal_cycle_id: "cycle_rest",
  goal_cycle_slot_id: "slot_rest_1",
  campaign_key: "gc_camp_cycle_rest",
  relay_post_id: "relay_p_rest",
  distribution_plan_id: "plan_rest",
  rail_event_id: "task_rest",
  task_kind: "active_rest",
  due_local: "2026-07-23T10:00:00",
  time_zone: "America/Chicago",
  media_requirements: [],
  instructions: "Active rest cue on Bluesky — light touch only; no new publish required."
});

/** Phase 5–compatible packet with Goal Cycle keys omitted (backward compat). */
export const PHASE5_DUE_PACKET_COMPAT_FIXTURE: ScheduleReminderPacket = {
  reminder_id: "schedule_reminder:task:task_phase5",
  task_id: "task_phase5",
  variant_id: "var_fixture",
  post_id: "relay_p_fixture",
  destination: "patreon",
  action: "post",
  title: "Legacy schedule reminder",
  open_url: null,
  due_at: "2026-07-20T23:00:00.000Z",
  plan_label: null,
  media_ready: true,
  primary_cta: BASE_CTA,
  secondary_cta: null
};

export const GOAL_CYCLE_DUE_PACKET_FIXTURES = {
  fixture_id: GOAL_CYCLE_DUE_PACKET_FIXTURE_VERSION,
  publish: GOAL_CYCLE_DUE_PACKET_PUBLISH_FIXTURE,
  missing_media: GOAL_CYCLE_DUE_PACKET_MISSING_MEDIA_FIXTURE,
  social_upkeep: GOAL_CYCLE_DUE_PACKET_UPKEEP_FIXTURE,
  active_rest: GOAL_CYCLE_DUE_PACKET_ACTIVE_REST_FIXTURE,
  phase5_compat: PHASE5_DUE_PACKET_COMPAT_FIXTURE
} as const;
