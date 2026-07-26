import { describe, expect, it } from "vitest";
import {
  resolvePlaybookDueAt,
  isSocialPlaybookTemplateKey,
  isSocialPlaybookActionKey,
  SOCIAL_PLAYBOOK_TEMPLATE_KEYS,
  SOCIAL_PLAYBOOK_ACTION_KEYS
} from "../src/autopost/social-playbook-contract.js";
import {
  listSocialPlaybookTemplatesWire,
  getSocialPlaybookTemplate,
  SOCIAL_PLAYBOOK_TEMPLATES
} from "../src/autopost/social-playbook-templates.js";
import {
  isSocialPlaybooksFeatureEnabled,
  SOCIAL_PLAYBOOKS_FEATURE_ENV
} from "../src/autopost/social-playbook-service.js";

function formatPlaybookOffsetLabel(offsetMinutes: number): string {
  if (offsetMinutes < 60) return `+${offsetMinutes}m`;
  if (offsetMinutes < 24 * 60) {
    const h = Math.round(offsetMinutes / 60);
    return `+${h}h`;
  }
  const d = Math.round(offsetMinutes / (24 * 60));
  return `+${d}d`;
}

describe("social playbook contract", () => {
  it("recognizes locked template and action keys", () => {
    for (const k of SOCIAL_PLAYBOOK_TEMPLATE_KEYS) {
      expect(isSocialPlaybookTemplateKey(k)).toBe(true);
    }
    for (const k of SOCIAL_PLAYBOOK_ACTION_KEYS) {
      expect(isSocialPlaybookActionKey(k)).toBe(true);
    }
    expect(isSocialPlaybookTemplateKey("nope")).toBe(false);
    expect(isSocialPlaybookActionKey("nope")).toBe(false);
  });

  it("resolves offset minutes from anchor due_at", () => {
    const anchor = new Date("2026-07-19T16:00:00.000Z");
    expect(resolvePlaybookDueAt(anchor, 60).toISOString()).toBe("2026-07-19T17:00:00.000Z");
    expect(resolvePlaybookDueAt(anchor, 24 * 60).toISOString()).toBe(
      "2026-07-20T16:00:00.000Z"
    );
    expect(resolvePlaybookDueAt(anchor, 30 * 24 * 60).toISOString()).toBe(
      "2026-08-18T16:00:00.000Z"
    );
  });
});

describe("social playbook templates v1", () => {
  it("ships four locked templates with ordered atoms", () => {
    const wires = listSocialPlaybookTemplatesWire();
    expect(wires.map((t) => t.template_key)).toEqual([
      "launch_boost",
      "community_vibe",
      "new_product_update",
      "evergreen_resurface"
    ]);
    expect(SOCIAL_PLAYBOOK_TEMPLATES).toHaveLength(4);
  });

  it("Launch Boost timeline matches product offsets", () => {
    const t = getSocialPlaybookTemplate("launch_boost");
    expect(t).toBeTruthy();
    expect(t!.atoms.map((a) => [a.action_key, a.offset_minutes])).toEqual([
      ["reply_block", 60],
      ["pin_cta_comment", 120],
      ["repost", 24 * 60]
    ]);
  });

  it("maps reminder atoms onto existing event types and drafts onto make_post", () => {
    for (const t of SOCIAL_PLAYBOOK_TEMPLATES) {
      for (const atom of t.atoms) {
        if (atom.execution_mode === "reminder") {
          expect(["engage_comments", "pin_comment", "repost"]).toContain(atom.event_type);
        } else {
          expect(atom.event_type).toBe("make_post");
          expect(atom.planned_format).toBeTruthy();
        }
      }
    }
  });

  it("New Product Update and Evergreen offsets match locked copy", () => {
    const product = getSocialPlaybookTemplate("new_product_update")!;
    expect(product.atoms.map((a) => a.offset_minutes)).toEqual([
      3 * 24 * 60,
      7 * 24 * 60
    ]);
    const evergreen = getSocialPlaybookTemplate("evergreen_resurface")!;
    expect(evergreen.atoms.map((a) => a.offset_minutes)).toEqual([
      7 * 24 * 60,
      30 * 24 * 60
    ]);
  });
});

describe("social playbooks feature flag", () => {
  it("defaults on and respects false/0/off", () => {
    expect(isSocialPlaybooksFeatureEnabled({})).toBe(true);
    expect(isSocialPlaybooksFeatureEnabled({ [SOCIAL_PLAYBOOKS_FEATURE_ENV]: "false" })).toBe(
      false
    );
    expect(isSocialPlaybooksFeatureEnabled({ [SOCIAL_PLAYBOOKS_FEATURE_ENV]: "0" })).toBe(false);
    expect(isSocialPlaybooksFeatureEnabled({ [SOCIAL_PLAYBOOKS_FEATURE_ENV]: "off" })).toBe(false);
  });
});

describe("social playbooks offset labels", () => {
  it("formats offset labels", () => {
    expect(formatPlaybookOffsetLabel(45)).toBe("+45m");
    expect(formatPlaybookOffsetLabel(120)).toBe("+2h");
    expect(formatPlaybookOffsetLabel(3 * 24 * 60)).toBe("+3d");
  });
});
