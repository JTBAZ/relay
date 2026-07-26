/**
 * Server-owned Social Playbook template registry (v1).
 * Coach/LLM may select these keys and validated atom overrides — not invent free-form timelines.
 */

import {
  SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
  type SocialPlaybookTemplateDefinition,
  type SocialPlaybookTemplateKey,
  type SocialPlaybookTemplateWire
} from "./social-playbook-contract.js";

export const SOCIAL_PLAYBOOK_TEMPLATES: readonly SocialPlaybookTemplateDefinition[] = [
  {
    template_key: "launch_boost",
    version: SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
    label: "Launch Boost",
    description: "First-hour replies, pin a CTA comment, then repost after a day.",
    atoms: [
      {
        action_key: "reply_block",
        label: "Top comment reply block",
        execution_mode: "reminder",
        event_type: "engage_comments",
        destination_policy: "anchor_primary",
        offset_minutes: 60,
        default_title: "First-hour reply block",
        default_note: "Answer early comments while the post is still ranking.",
        step_index: 1
      },
      {
        action_key: "pin_cta_comment",
        label: "Make and pin CTA",
        execution_mode: "reminder",
        event_type: "pin_comment",
        destination_policy: "anchor_primary",
        offset_minutes: 120,
        default_title: "Pin CTA comment",
        default_note: "Write and pin a clear call-to-action on the launch post.",
        step_index: 2
      },
      {
        action_key: "repost",
        label: "Repost after 24 hours",
        execution_mode: "reminder",
        event_type: "repost",
        destination_policy: "anchor_primary",
        offset_minutes: 24 * 60,
        default_title: "Repost launch",
        default_note: "Reshare the launch post once early engagement settles.",
        step_index: 3
      }
    ]
  },
  {
    template_key: "community_vibe",
    version: SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
    label: "Community Vibe",
    description: "Reply block, highlight a fan, then reshare after three days.",
    atoms: [
      {
        action_key: "reply_block",
        label: "Reply block",
        execution_mode: "reminder",
        event_type: "engage_comments",
        destination_policy: "anchor_primary",
        offset_minutes: 60,
        default_title: "Community reply block",
        default_note: "Batch replies and thank early commenters.",
        step_index: 1
      },
      {
        action_key: "highlight_fan",
        label: "Highlight a fan comment",
        execution_mode: "reminder",
        event_type: "engage_comments",
        destination_policy: "anchor_primary",
        offset_minutes: 24 * 60,
        default_title: "Highlight a fan",
        default_note: "Quote or amplify a strong fan comment / UGC.",
        step_index: 2
      },
      {
        action_key: "repost",
        label: "Reshare after three days",
        execution_mode: "reminder",
        event_type: "repost",
        destination_policy: "anchor_primary",
        offset_minutes: 3 * 24 * 60,
        default_title: "Community reshare",
        default_note: "Reshare with a community-forward note.",
        step_index: 3
      }
    ]
  },
  {
    template_key: "new_product_update",
    version: SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
    label: "New Product Update",
    description: "CTA banner follow-up, then a dedicated follow-up post.",
    atoms: [
      {
        action_key: "cta_banner",
        label: "CTA banner",
        execution_mode: "draft",
        event_type: "make_post",
        planned_format: "image",
        destination_policy: "anchor_all",
        offset_minutes: 3 * 24 * 60,
        default_title: "CTA banner follow-up",
        default_note: "Prepare a banner or graphic that points back to the update.",
        step_index: 1
      },
      {
        action_key: "follow_up_post",
        label: "Follow-up post",
        execution_mode: "draft",
        event_type: "make_post",
        planned_format: "mixed",
        destination_policy: "anchor_all",
        offset_minutes: 7 * 24 * 60,
        default_title: "Product follow-up post",
        default_note: "Ship a second post covering FAQs, social proof, or next steps.",
        step_index: 2
      }
    ]
  },
  {
    template_key: "evergreen_resurface",
    version: SOCIAL_PLAYBOOK_TEMPLATE_VERSION,
    label: "Evergreen Resurface",
    description: "Engagement check, then repost after 30 days.",
    atoms: [
      {
        action_key: "engagement_check",
        label: "Engagement check",
        execution_mode: "reminder",
        event_type: "engage_comments",
        destination_policy: "anchor_primary",
        offset_minutes: 7 * 24 * 60,
        default_title: "Engagement check",
        default_note: "Review comments and performance before resurfacing.",
        step_index: 1
      },
      {
        action_key: "repost",
        label: "Repost after 30 days",
        execution_mode: "reminder",
        event_type: "repost",
        destination_policy: "anchor_primary",
        offset_minutes: 30 * 24 * 60,
        default_title: "Evergreen repost",
        default_note: "Resurface the evergreen post for a new audience window.",
        step_index: 2
      }
    ]
  }
] as const;

const BY_KEY = new Map(
  SOCIAL_PLAYBOOK_TEMPLATES.map((t) => [t.template_key, t] as const)
);

export function getSocialPlaybookTemplate(
  key: SocialPlaybookTemplateKey
): SocialPlaybookTemplateDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function listSocialPlaybookTemplateDefinitions(): readonly SocialPlaybookTemplateDefinition[] {
  return SOCIAL_PLAYBOOK_TEMPLATES;
}

export function toSocialPlaybookTemplateWire(
  def: SocialPlaybookTemplateDefinition
): SocialPlaybookTemplateWire {
  return {
    template_key: def.template_key,
    version: def.version,
    label: def.label,
    description: def.description,
    atoms: def.atoms.map((a) => ({
      action_key: a.action_key,
      label: a.label,
      execution_mode: a.execution_mode,
      event_type: a.event_type,
      planned_format: a.planned_format ?? null,
      destination_policy: a.destination_policy,
      offset_minutes: a.offset_minutes,
      default_title: a.default_title,
      default_note: a.default_note,
      step_index: a.step_index
    }))
  };
}

export function listSocialPlaybookTemplatesWire(): SocialPlaybookTemplateWire[] {
  return SOCIAL_PLAYBOOK_TEMPLATES.map(toSocialPlaybookTemplateWire);
}
