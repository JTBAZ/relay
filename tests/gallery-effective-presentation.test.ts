import { describe, expect, it } from "vitest";

import {
  effectiveMediaIdsOrder,
  mergePostPresentation
} from "../src/gallery/effective-presentation.js";

describe("effectiveMediaIdsOrder", () => {
  it("returns base copy when overlay empty", () => {
    expect(effectiveMediaIdsOrder(["b", "a"], undefined)).toEqual(["b", "a"]);
    expect(effectiveMediaIdsOrder(["b", "a"], [])).toEqual(["b", "a"]);
  });

  it("orders known ids then appends unseen base ids", () => {
    expect(effectiveMediaIdsOrder(["m1", "m2", "m3"], ["m3", "m1"])).toEqual(["m3", "m1", "m2"]);
  });

  it("drops overlay ids absent from ingest (Patreon-only base) without stripping trailing new assets", () => {
    expect(effectiveMediaIdsOrder(["a", "b"], ["phantom", "b", "a"])).toEqual(["b", "a"]);
  });

  it("dedupes overlay by first occurrence without mutating unseen base remainder order", () => {
    expect(effectiveMediaIdsOrder(["m1", "m2"], ["m1", "m1", "m2"])).toEqual(["m1", "m2"]);
  });
});

describe("mergePostPresentation", () => {
  it("keeps ingest when overlay absent", () => {
    const m = mergePostPresentation(
      { title: "T", description: "D", media_ids: ["a", "b"] },
      undefined
    );
    expect(m.title).toBe("T");
    expect(m.description).toBe("D");
    expect(m.media_ids_ordered).toEqual(["a", "b"]);
    expect("tier_preview_settings" in m).toBe(false);
  });

  it("prefers Relay title/description when provided", () => {
    const m = mergePostPresentation(
      { title: "Ingest title", description: "<p>X</p>", media_ids: ["x"] },
      {
        relay_title: "Relay title",
        relay_description: "Relay desc",
        media_order: ["x"],
        tier_preview_settings: { t1: { mock: true } }
      }
    );
    expect(m.title).toBe("Relay title");
    expect(m.description).toBe("Relay desc");
    expect(m.tier_preview_settings).toEqual({ t1: { mock: true } });
  });

  it("inherits ingest title when overlay relay_title is whitespace-only (Relay cleared)", () => {
    const m = mergePostPresentation(
      { title: "Patreon title", description: undefined, media_ids: ["z"] },
      { relay_title: "   ", media_order: ["z"] }
    );
    expect(m.title).toBe("Patreon title");
  });

  it("overlay-only: omits tier_preview_settings when absent on overlay row", () => {
    const m = mergePostPresentation(
      { title: "T", description: "D", media_ids: ["x"] },
      { relay_title: "R", relay_description: "", media_order: ["x"] }
    );
    expect(m.title).toBe("R");
    expect(m.description).toBe(undefined);
    expect("tier_preview_settings" in m).toBe(false);
  });
});
