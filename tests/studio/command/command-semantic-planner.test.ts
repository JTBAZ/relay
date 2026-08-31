import { describe, expect, it } from "vitest";
import { generateStructured } from "../../../src/ai/ai-service.js";
import type { AiGenerateStructuredResult } from "../../../src/ai/types.js";
import {
  parseCommandPlannerOutput,
  planCommandSelection,
  type CommandPlannerGenerateFn
} from "../../../src/studio/command/command-semantic-planner.js";
import { interpretCreatorHarnessInstruction } from "../../../src/studio/eval/command-harness-interpret-creator.js";
import type { CommandLibraryItem } from "../../../src/studio/command/selection.js";
import type { GalleryItem } from "../../../src/gallery/types.js";

function item(overrides: Partial<CommandLibraryItem> = {}): CommandLibraryItem {
  const base: GalleryItem = {
    media_id: overrides.media_id ?? "media_1",
    post_id: overrides.post_id ?? "post_1",
    title: overrides.title ?? "Standalone study",
    published_at: overrides.published_at ?? "2026-03-01T00:00:00.000Z",
    tag_ids: overrides.tag_ids ?? [],
    tier_ids: [],
    has_export: true,
    processing_status: "READY",
    export_status: "ready",
    content_url_path: "",
    preview_url_path: "",
    thumb_url_path: "",
    visibility: overrides.visibility ?? "visible",
    collection_ids: overrides.collection_ids ?? [],
    collection_theme_tag_ids: [],
    distribution_summary: overrides.distribution_summary
  };
  return { ...base, source: "PATREON", ...overrides };
}

function stubGenerate(payload: unknown): CommandPlannerGenerateFn {
  return async () =>
    ({
      ok: true,
      parsed: payload,
      text: JSON.stringify(payload),
      tool_calls: [{ name: "command_planner_result", input: payload as Record<string, unknown> }],
      provider: "stub",
      model: "stub",
      tier: "cheap",
      usage: { input_tokens: 8, output_tokens: 8 }
    }) satisfies AiGenerateStructuredResult;
}

const watercolorQuery = {
  tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"]
};

const heroAcademyQuery = {
  title_contains: "Hero Academy",
  numbered_sequence: true
};

describe("CommandSemanticPlanner (RC-P7-T02)", () => {
  it("parses plan_patch weekday without searching the library", async () => {
    const out = parseCommandPlannerOutput({
      kind: "plan_patch",
      op: "set_weekday",
      weekday: "saturday"
    });
    expect(out).toEqual({
      kind: "plan_patch",
      op: "set_weekday",
      weekday: "saturday",
      interval_days: undefined,
      start_local: undefined
    });
    const planned = await planCommandSelection({
      instruction: "Use the weekend opener.",
      creatorId: "cr_plan",
      items: [item({ post_id: "a", media_id: "ma", title: "Hero Academy Cover" })],
      generate: stubGenerate({
        kind: "plan_patch",
        op: "set_weekday",
        weekday: "saturday"
      })
    });
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.output.kind).toBe("plan_patch");
    expect(planned.search).toBeNull();
  });

  it("parses watercolor tag AST", () => {
    const out = parseCommandPlannerOutput({
      kind: "selection_intent",
      query: watercolorQuery,
      collection_title: "Watercolor landscapes"
    });
    expect(out.kind).toBe("selection_intent");
    if (out.kind !== "selection_intent") return;
    expect(out.query).toEqual(watercolorQuery);
  });

  it("parses Academy clarification without picking a series", () => {
    const out = parseCommandPlannerOutput({
      kind: "clarification",
      prompt: "Which Academy series?",
      candidate_labels: ["Hero Academy", "Academy Studies"]
    });
    expect(out).toEqual({
      kind: "clarification",
      prompt: "Which Academy series?",
      candidate_labels: ["Hero Academy", "Academy Studies"]
    });
  });

  it("parses Hero Academy query AST", () => {
    const out = parseCommandPlannerOutput({
      kind: "selection_intent",
      query: heroAcademyQuery,
      collection_title: "Hero Academy"
    });
    expect(out.kind).toBe("selection_intent");
    if (out.kind !== "selection_intent") return;
    expect(out.query).toEqual(heroAcademyQuery);
  });

  it("refuses publish / SQL planner payloads", () => {
    expect(() =>
      parseCommandPlannerOutput({
        kind: "selection_intent",
        query: { title_contains: "apply_change_set" }
      })
    ).toThrow(/forbidden operation/);
    expect(() =>
      parseCommandPlannerOutput({
        kind: "refuse",
        message: "publish_external now"
      })
    ).toThrow(/forbidden operation/);
  });

  it("rejects an unconstrained library dump", () => {
    expect(() => parseCommandPlannerOutput({ kind: "selection_intent", query: {} })).toThrow(
      /constraint/
    );
  });

  it("maps a novel watercolor sentence through search_library", async () => {
    const items = [
      item({
        post_id: "wc_1",
        title: "River morning",
        tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"],
        published_at: "2026-04-02T00:00:00.000Z"
      }),
      item({
        post_id: "wc_0",
        title: "Hill dusk",
        tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"],
        published_at: "2026-04-01T00:00:00.000Z"
      }),
      item({
        post_id: "other",
        title: "Ink sketch",
        tag_ids: ["sl2_tag_ink"]
      })
    ];
    const plan = await planCommandSelection({
      instruction: "Stack my watercolor landscapes newest first.",
      creatorId: "cr_dev_ava",
      items,
      generate: stubGenerate({
        kind: "selection_intent",
        query: watercolorQuery,
        collection_title: "Watercolor landscapes"
      })
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.output.kind).toBe("selection_intent");
    if (plan.output.kind !== "selection_intent") return;
    expect(plan.output.query).toEqual(watercolorQuery);
    expect(plan.search?.records.map((r) => r.post_id)).toEqual(["wc_1", "wc_0"]);
  });

  it("returns Academy clarification from a novel sentence", async () => {
    const plan = await planCommandSelection({
      instruction: "Put the academy comics in a stack.",
      creatorId: "cr_dev_ava",
      items: [],
      generate: stubGenerate({
        kind: "clarification",
        prompt: "Which Academy series?",
        candidate_labels: ["Academy Studies", "Hero Academy"]
      })
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.output).toEqual({
      kind: "clarification",
      prompt: "Which Academy series?",
      candidate_labels: ["Academy Studies", "Hero Academy"]
    });
  });

  it("retries once on invalid JSON then accepts a Hero Academy AST", async () => {
    let calls = 0;
    const generate: CommandPlannerGenerateFn = async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: true,
          parsed: { nope: true },
          text: "{}",
          tool_calls: [],
          provider: "stub",
          model: "stub",
          tier: "cheap"
        };
      }
      return stubGenerate({
        kind: "selection_intent",
        query: heroAcademyQuery,
        collection_title: "Hero Academy"
      })({} as never);
    };
    const plan = await planCommandSelection({
      instruction: "Make a Hero Academy collection starting with the cover plate please.",
      creatorId: "cr_dev_ava",
      items: [],
      generate
    });
    expect(calls).toBe(2);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.output.kind).toBe("selection_intent");
    if (plan.output.kind !== "selection_intent") return;
    expect(plan.output.query).toEqual(heroAcademyQuery);
  });

  it("skips when the mock AI provider would have to invent tools", async () => {
    const plan = await planCommandSelection({
      instruction: "Stack my watercolor landscapes.",
      creatorId: "cr_dev_ava",
      items: [],
      generate: (payload) =>
        generateStructured(payload, { enabled: true, provider: "mock" })
    });
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.skipped).toBe(true);
  });

  it("wires Lab 3 interpret for a novel Hero Academy sentence when the planner flag is on", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Group the Hero Academy comic into its own stack, cover then pages.",
      items: [
        item({
          post_id: "ava_ha_cover",
          title: "Hero Academy Cover",
          published_at: "2026-01-01T00:00:00.000Z"
        }),
        item({
          post_id: "ava_ha_p01",
          title: "Hero Academy Page 1",
          published_at: "2026-01-02T00:00:00.000Z"
        })
      ],
      planner: {
        enabled: true,
        generate: stubGenerate({
          kind: "selection_intent",
          query: heroAcademyQuery,
          collection_title: "Hero Academy"
        })
      }
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.scenario_id).toBe("rc-p7-planner");
    expect(result.resolved_post_ids).toEqual(["ava_ha_cover", "ava_ha_p01"]);
    expect(result.write_layer).toBe("collection");
  });

  it("keeps fixture interpret when the planner is on and the sentence is an eval string", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "Organize Hero Academy into a collection, cover first, in page order.",
      items: [
        item({
          post_id: "ava_ha_cover",
          title: "Hero Academy Cover",
          published_at: "2026-01-01T00:00:00.000Z"
        }),
        item({
          post_id: "ava_ha_p01",
          title: "Hero Academy Page 1",
          published_at: "2026-01-02T00:00:00.000Z"
        })
      ],
      planner: {
        enabled: true,
        generate: stubGenerate({
          kind: "refuse",
          message: "should not run"
        })
      }
    });
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.scenario_id).not.toBe("rc-p7-planner");
    expect(result.resolved_post_ids).toEqual(["ava_ha_cover", "ava_ha_p01"]);
  });

  it("keeps the fixture path when the planner is off even if a generate stub exists", async () => {
    const result = await interpretCreatorHarnessInstruction({
      creatorId: "cr_dev_ava",
      instruction: "stack those watercolor landscape pieces, newest on top",
      items: [
        item({
          post_id: "ava_ha_cover",
          title: "Hero Academy Cover",
          published_at: "2026-01-01T00:00:00.000Z"
        })
      ],
      planner: {
        enabled: false,
        generate: stubGenerate({
          kind: "selection_intent",
          query: { tag_ids: ["sl2_tag_watercolor", "sl2_tag_landscape"] }
        })
      }
    });
    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.message).toMatch(/not in the Lab 2 eval fixture/);
    expect(result.message).not.toMatch(/Planner unavailable/);
  });

  it("redacts URLs and emails from planner context before the model sees them", async () => {
    let captured = "";
    const generate: CommandPlannerGenerateFn = async (input) => {
      captured = input.messages.find((m) => m.role === "user")?.content ?? "";
      return stubGenerate({
        kind: "selection_intent",
        query: { title_contains: "Hero Academy" }
      })(input);
    };
    await planCommandSelection({
      instruction: "stack my Hero Academy comic",
      creatorId: "cr_dev_ava",
      items: [
        item({
          post_id: "ava_ha_cover",
          title: "Hero Academy Cover",
          content_url_path: "https://cdn.example/art.png",
          thumb_url_path: "/api/v1/media/abc/thumb",
          distribution_summary: {
            post_id: "ava_ha_cover",
            destinations: [
              {
                destination: "x",
                variant_status: null,
                attempt_status: "posted",
                attempt_id: null,
                external_url: "https://x.com/p/1",
                external_id: null
              }
            ]
          }
        })
      ],
      collections: [{ collection_id: "col_secret", title: "contact patron@example.com" }],
      generate
    });
    expect(captured).toBeTruthy();
    expect(captured).not.toMatch(/https?:\/\//i);
    expect(captured).not.toMatch(/\/api\/v1\/media\//i);
    expect(captured).not.toMatch(/patron@example.com/i);
    const parsed = JSON.parse(captured) as { context: Record<string, unknown> };
    expect(parsed.context).toMatchObject({
      schema_version: "relay-command-planner-v1",
      destinations: expect.arrayContaining(["x", "patreon"])
    });
  });
});

