import { describe, expect, it, beforeEach } from "vitest";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import {
  routeCollectionWrite,
  routePostRevision
} from "../../../src/studio/command/write-router.js";
import {
  applyChangeSet,
  canTransitionChangeSetStatus,
  clearChangeSetPreviewStore,
  previewChangeSet
} from "../../../src/studio/command/change-set-types.js";
import { commandCapabilityFacade } from "../../../src/studio/command/capability-facade.js";

describe("write-layer router (RC-P1-T05 / RC-DF-10)", () => {
  it("routes PATREON and SUBSCRIBESTAR title edits to presentation overlay fields", () => {
    const patreon = routePostRevision({
      post_id: "post_imported",
      source: "PATREON",
      fields: { title: "Relay gallery title" }
    });
    expect(patreon).toEqual({
      layer: "presentation",
      post_id: "post_imported",
      patch: { relay_title: "Relay gallery title" }
    });

    const ss = routePostRevision({
      post_id: "post_ss",
      source: "SUBSCRIBESTAR",
      fields: { description: "overlay body" }
    });
    expect(ss.layer).toBe("presentation");
    if (ss.layer === "presentation") {
      expect(ss.patch.relay_description).toBe("overlay body");
    }
  });

  it("routes RELAY native title edits to append-PostVersion intent", () => {
    const native = routePostRevision({
      post_id: "post_relay",
      source: "RELAY",
      fields: { title: "Page 12 revised" }
    });
    expect(native).toEqual({
      layer: "native_version",
      post_id: "post_relay",
      append: { title: "Page 12 revised" }
    });
  });

  it("never routes collection ops through versions or presentation", () => {
    const routed = routeCollectionWrite({
      collection_id: "col_ha",
      title: "Hero Academy",
      post_ids: ["p1", "p2"],
      ordered_post_ids: ["p2", "p1"]
    });
    expect(routed.layer).toBe("collection");
    expect(routed).not.toHaveProperty("append");
    expect(routed).not.toHaveProperty("patch");
  });

  it("fails closed when the caller requests the wrong write layer", () => {
    expect(() =>
      routePostRevision({
        post_id: "post_imported",
        source: "PATREON",
        fields: { title: "nope" },
        requested_layer: "native_version"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_WRONG_WRITE_LAYER" }));

    expect(() =>
      routePostRevision({
        post_id: "post_relay",
        source: "RELAY",
        fields: { title: "nope" },
        requested_layer: "presentation"
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_WRONG_WRITE_LAYER" }));
  });

  it("rejects change-title-everywhere without (and with) a destination list as out of POC", () => {
    expect(() =>
      routePostRevision({
        post_id: "post_imported",
        source: "PATREON",
        fields: { title: "everywhere" },
        everywhere: true
      })
    ).toThrow(expect.objectContaining({ code: "COMMAND_VALIDATION" }));

    try {
      routePostRevision({
        post_id: "post_imported",
        source: "PATREON",
        fields: { title: "everywhere" },
        destinations: ["x", "patreon"]
      });
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_VALIDATION");
      expect((err as CommandContractError).details[0]?.field).toBe("destinations");
    }
  });
});

describe("ChangeSet preview stub (RC-P1-T06)", () => {
  beforeEach(() => {
    clearChangeSetPreviewStore();
  });

  const previewInput = {
    change_set_id: "cs_ha",
    idempotency_key: "idem_ha",
    instruction: "Organize Hero Academy by page.",
    resolved_post_ids: ["post_ha_1", "post_ha_2"],
    ops: [
      {
        op_id: "op_1",
        capability: "create_or_update_collection" as const,
        risk_class: "execute_undo" as const,
        target_ids: ["post_ha_1", "post_ha_2"],
        payload: { title: "Hero Academy" }
      }
    ],
    created_at: "2026-08-27T15:00:00.000Z",
    updated_at: "2026-08-27T15:00:00.000Z"
  };

  it("preview_change_set freezes resolved_post_ids and allows preview_ready", () => {
    expect(canTransitionChangeSetStatus("preview_ready", "apply_requested")).toBe(true);
    const envelope = previewChangeSet(previewInput);
    expect(envelope.status).toBe("preview_ready");
    expect(envelope.resolved_post_ids).toEqual(["post_ha_1", "post_ha_2"]);
  });

  it("apply_change_set returns COMMAND_APPLY_DISABLED while the apply flag is off", () => {
    previewChangeSet(previewInput);
    expect(() =>
      applyChangeSet(
        { change_set_id: "cs_ha", resolved_post_ids: ["post_ha_1", "post_ha_2"] },
        {}
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_APPLY_DISABLED" }));
    expect(() => commandCapabilityFacade.undo_change_set("cs_ha", {})).toThrow(
      expect.objectContaining({ code: "COMMAND_APPLY_DISABLED" })
    );
  });

  it("rejects mutated ids after preview as COMMAND_STALE_SELECTION", () => {
    previewChangeSet(previewInput);
    expect(() =>
      applyChangeSet(
        { change_set_id: "cs_ha", resolved_post_ids: ["post_ha_1", "post_injected"] },
        { RELAY_COMMAND_APPLY_ENABLED: "1" }
      )
    ).toThrow(expect.objectContaining({ code: "COMMAND_STALE_SELECTION" }));
  });

  it("with apply enabled and matching snapshot, advances to apply_requested without writing", () => {
    previewChangeSet(previewInput);
    const applied = applyChangeSet(
      { change_set_id: "cs_ha", resolved_post_ids: ["post_ha_1", "post_ha_2"] },
      { RELAY_COMMAND_APPLY_ENABLED: "true" }
    );
    expect(applied.status).toBe("apply_requested");
  });
});
