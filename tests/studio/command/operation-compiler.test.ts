import { describe, expect, it } from "vitest";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import {
  ORGANIZE_APPLY_SCHEDULE_BLOCKED,
  collectionMetaFromOps,
  compileStockOperation
} from "../../../src/studio/command/operation-compiler.js";

const frozen = ["post_a", "post_b"] as const;

describe("operation compiler (RC-P8-T01)", () => {
  it("compiles a collection from frozen IDs only", () => {
    const result = compileStockOperation({
      kind: "create_or_update_collection",
      frozen_post_ids: frozen,
      frozen_revision: "rev_1",
      expected_revision: "rev_1",
      collection_title: "Hero Academy"
    });
    expect(result.write_layer).toBe("collection");
    expect(result.resolved_post_ids).toEqual(["post_a", "post_b"]);
    expect(result.ops).toHaveLength(1);
    expect(result.ops[0]?.capability).toBe("create_or_update_collection");
    expect(result.ops[0]?.payload.post_ids).toEqual(["post_a", "post_b"]);
    expect(result.ops[0]?.payload.ordered_post_ids).toEqual(["post_a", "post_b"]);
    expect(collectionMetaFromOps(result.ops).collection_title).toBe("Hero Academy");
  });

  it("routes imported revise to presentation and native revise to native_version", () => {
    const imported = compileStockOperation({
      kind: "revise_post",
      frozen_post_ids: ["post_imported"],
      frozen_revision: "rev_1",
      expected_revision: "rev_1",
      title: "Relay gallery title",
      posts: [{ post_id: "post_imported", source: "PATREON" }]
    });
    expect(imported.write_layer).toBe("presentation");
    expect(imported.ops[0]?.capability).toBe("revise_post");
    expect(imported.ops[0]?.payload.source).toBe("PATREON");

    const native = compileStockOperation({
      kind: "revise_post",
      frozen_post_ids: ["post_relay"],
      frozen_revision: "rev_1",
      expected_revision: "rev_1",
      title: "Page 12 revised",
      posts: [{ post_id: "post_relay", source: "RELAY" }]
    });
    expect(native.write_layer).toBe("native_version");
    expect(native.ops[0]?.payload.source).toBe("RELAY");
  });

  it("rejects mixed title-everywhere as out of POC", () => {
    expect(() =>
      compileStockOperation({
        kind: "revise_post",
        frozen_post_ids: ["post_imported"],
        frozen_revision: "rev_1",
        expected_revision: "rev_1",
        title: "everywhere",
        everywhere: true,
        posts: [{ post_id: "post_imported", source: "PATREON" }]
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
  });

  it("fails closed on stale frozen revision", () => {
    expect(() =>
      compileStockOperation({
        kind: "create_or_update_collection",
        frozen_post_ids: frozen,
        frozen_revision: "rev_1",
        expected_revision: "rev_stale",
        collection_title: "Hero Academy"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_STALE_SELECTION" }));
  });

  it("forbids publish and other never-list kinds", () => {
    expect(() =>
      compileStockOperation({
        kind: "publish_external",
        frozen_post_ids: frozen,
        frozen_revision: "rev_1",
        expected_revision: "rev_1"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_FORBIDDEN" }));
    expect(() =>
      compileStockOperation({
        kind: "set_visibility",
        frozen_post_ids: frozen,
        frozen_revision: "rev_1",
        expected_revision: "rev_1"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_FORBIDDEN" }));
  });

  it("blocks schedule apply until the plan workbench", () => {
    try {
      compileStockOperation({
        kind: "create_release_plan",
        frozen_post_ids: frozen,
        frozen_revision: "rev_1",
        expected_revision: "rev_1"
      });
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_VALIDATION");
      expect((err as CommandContractError).message).toBe(ORGANIZE_APPLY_SCHEDULE_BLOCKED);
    }
  });

  it("rejects posts that are not in the frozen snapshot", () => {
    expect(() =>
      compileStockOperation({
        kind: "revise_post",
        frozen_post_ids: frozen,
        frozen_revision: "rev_1",
        expected_revision: "rev_1",
        title: "nope",
        posts: [
          { post_id: "post_a", source: "PATREON" },
          { post_id: "post_extra", source: "PATREON" }
        ]
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));
  });

  it("compiles override tag add/remove against frozen IDs", () => {
    const added = compileStockOperation({
      kind: "add_post_tags",
      frozen_post_ids: frozen,
      frozen_revision: "rev_1",
      expected_revision: "rev_1",
      tag_ids: ["tag_watercolor"]
    });
    expect(added.ops[0]?.payload.post_ids).toEqual(["post_a", "post_b"]);
    expect(added.ops[0]?.payload.tag_ids).toEqual(["tag_watercolor"]);
  });
});
