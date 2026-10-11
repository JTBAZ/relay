import { describe, expect, it, vi } from "vitest";
import { loadPostNaming, resolvePostNaming, resolveWorkTitle, type NamingWork } from "../src/gallery-editor/naming.js";
import { mergePostPresentation } from "../src/gallery/effective-presentation.js";
import { loadPostPresentationOverlaysFromDb } from "../src/gallery/post-presentation-load.js";
import { derivePresentationUpsertFragments, presentationPatchTouches } from "../src/gallery/post-presentation-mutate.js";

const work: NamingWork = {
  id: "w", title: "Existing work", titleMode: "inherit_series",
  seriesMember: { partLabel: "Chapter 1", creativeSeries: { id: "s", title: "Series" } }
};
const scopedWork = {
  ...work, titleMode: "inherit_series" as const, creatorId: "creator",
  seriesMember: { ...work.seriesMember!, creatorId: "creator", creativeSeries: { ...work.seriesMember!.creativeSeries, creatorId: "creator" } }
};

describe("naming inheritance", () => {
  it("resolves series, work and post names with route-facing provenance", () => {
    const result = resolvePostNaming({ sourceTitle: "Patreon", presentation: { titleMode: "inherit_work" }, work });
    expect(result).toEqual({
      mode: "inherit_work", sourceTitle: "Patreon", effectiveTitle: "Series — Chapter 1",
      workId: "w", workTitle: "Series — Chapter 1", seriesId: "s", seriesTitle: "Series", partLabel: "Chapter 1", exception: false
    });
    expect(resolveWorkTitle({ ...work, titleMode: "independent" })).toBe("Existing work");
  });

  it("rename inheritance is live while source/custom exceptions stay intact", () => {
    const renamed = { ...work, seriesMember: { ...work.seriesMember!, creativeSeries: { id: "s", title: "Renamed" } } };
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { titleMode: "inherit_work" }, work: renamed }).effectiveTitle).toBe("Renamed — Chapter 1");
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { titleMode: "custom", relayTitle: "  Custom  " }, work: renamed })).toMatchObject({ effectiveTitle: "  Custom  ", exception: true });
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { titleMode: "source", relayTitle: "Old custom" }, work: renamed }).effectiveTitle).toBe("Source");
  });

  it("legacy nonblank overlays and existing independent work titles preserve display", () => {
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { relayTitle: "Relay" } }).effectiveTitle).toBe("Relay");
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { relayTitle: "\u00a0\ufeff" } }).effectiveTitle).toBe("Source");
    expect(resolveWorkTitle({ ...work, titleMode: undefined })).toBe("Existing work");
    expect(resolvePostNaming({ sourceTitle: "Source", presentation: { titleMode: "inherit_work" }, work: null }).effectiveTitle).toBe("Source");
  });

  it("all existing gallery merges use the same inherited title without altering source", () => {
    const base = { title: "Canonical source", media_ids: ["media"] };
    const result = mergePostPresentation(base, { title_mode: "inherit_work", naming_work: work });
    expect(result.title).toBe("Series — Chapter 1");
    expect(result.naming.sourceTitle).toBe("Canonical source");
    expect(base.title).toBe("Canonical source");
  });
});

describe("scoped naming query services", () => {
  it("resolves canonical latest version and work graph inside a transaction-compatible client", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "p", versions: [{ title: "Source" }], presentation: { creatorId: "creator", titleMode: "inherit_work" }, creativeWorkMember: { creatorId: "creator", creativeWork: scopedWork } }
    ]);
    const result = await loadPostNaming({ post: { findMany } } as never, "creator", ["p", "p"]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { creatorId: "creator", id: { in: ["p"] } } }));
    expect(result.p.effectiveTitle).toBe("Series — Chapter 1");
    expect(findMany.mock.calls[0][0].select.versions).toMatchObject({ orderBy: { versionSeq: "desc" }, take: 1 });
  });

  it("loads the hierarchy for gallery/export consumers", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { postId: "p", titleMode: "inherit_work", relayTitle: null, post: { creatorId: "creator", creativeWorkMember: { creatorId: "creator", creativeWork: scopedWork } } }
    ]);
    const overlays = await loadPostPresentationOverlaysFromDb({ postPresentation: { findMany } } as never, "creator");
    expect(findMany.mock.calls[0][0].where).toEqual({ creatorId: "creator" });
    expect(mergePostPresentation({ title: "Source", media_ids: [] }, overlays.p).title).toBe("Series — Chapter 1");
  });

  it("never exposes titles from malformed cross-creator related rows", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "p", versions: [{ title: "Source" }], presentation: { creatorId: "other", titleMode: "custom", relayTitle: "Private" }, creativeWorkMember: { creatorId: "creator", creativeWork: { ...scopedWork, creatorId: "other" } } },
      { id: "q", versions: [{ title: "Source" }], presentation: { creatorId: "creator", titleMode: "inherit_work" }, creativeWorkMember: { creatorId: "creator", creativeWork: { ...scopedWork, seriesMember: { ...scopedWork.seriesMember, creativeSeries: { id: "secret", title: "Private series", creatorId: "other" } } } } }
    ]);
    const result = await loadPostNaming({ post: { findMany } } as never, "creator");
    expect(result.p).toMatchObject({ effectiveTitle: "Source", mode: "source" });
    expect(result.p.workId).toBeUndefined();
    expect(result.q.effectiveTitle).toBe("Existing work");
    expect(result.q.seriesId).toBeUndefined();
  });
});

describe("manual presentation naming parity", () => {
  it("manual titles opt into custom exceptions and clearing restores source", () => {
    const patch = (relay_title: string | null) => derivePresentationUpsertFragments({ relay_title }, presentationPatchTouches({ relay_title }));
    expect(patch("Title")).toMatchObject({ titleMode: "custom", relayTitle: "Title" });
    expect(patch("  ")).toMatchObject({ titleMode: "source", relayTitle: null });
    expect(patch(null)).toMatchObject({ titleMode: "source", relayTitle: null });
  });

  it("explicit modes reject contradictory custom payloads", () => {
    const derive = (body: Record<string, unknown>) => derivePresentationUpsertFragments(body, presentationPatchTouches(body));
    expect(derive({ title_mode: "inherit_work" })).toEqual({ titleMode: "inherit_work" });
    expect(() => derive({ title_mode: "custom", relay_title: "" })).toThrow("VALIDATION:custom_title_required");
    expect(() => derive({ title_mode: "source", relay_title: "Hidden override" })).toThrow("VALIDATION:title_mode_conflict");
    expect(() => derive({ title_mode: "bogus" })).toThrow("VALIDATION:title_mode");
  });
});
