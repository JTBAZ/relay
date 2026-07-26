import { describe, expect, it } from "vitest";
import {
  patronCollectionDetailContentUrl,
  patronCollectionDetailThumbUrl,
  patronCollectionMediaPageLabel,
  patronCollectionPostDetailHref,
  patronCreatorProfileHref,
} from "../../web/lib/relay-api";

describe("patron collection detail helpers", () => {
  it("patronCollectionPostDetailHref encodes handle, post, and media focus", () => {
    const href = patronCollectionPostDetailHref({
      creator_id: "rc/creator",
      creator_handle: "my-studio",
      post_id: "post id",
      media_id: "media+1",
    });
    expect(href).toContain("/my-studio/post/");
    expect(href).toContain(encodeURIComponent("post id"));
    expect(href).toContain(`media_id=${encodeURIComponent("media+1")}`);
  });

  it("patronCollectionDetailThumbUrl absolutizes API paths", () => {
    expect(
      patronCollectionDetailThumbUrl("/api/v1/export/media/c1/m1/thumb")
    ).toMatch(/\/api\/v1\/export\/media\/c1\/m1\/thumb$/);
    expect(patronCollectionDetailThumbUrl("")).toBeNull();
    expect(patronCollectionDetailThumbUrl(undefined)).toBeNull();
  });

  it("patronCollectionDetailContentUrl absolutizes API paths", () => {
    expect(
      patronCollectionDetailContentUrl("/api/v1/export/media/c1/m1/content")
    ).toMatch(/\/api\/v1\/export\/media\/c1\/m1\/content$/);
    expect(patronCollectionDetailContentUrl("")).toBeNull();
    expect(patronCollectionDetailContentUrl(undefined)).toBeNull();
  });

  it("patronCollectionMediaPageLabel formats multi-image positions", () => {
    expect(patronCollectionMediaPageLabel(3, 6)).toBe("3 of 6");
    expect(patronCollectionMediaPageLabel(1, 1)).toBeNull();
    expect(patronCollectionMediaPageLabel(undefined, 6)).toBeNull();
  });

  it("patronCreatorProfileHref encodes creator handle", () => {
    expect(patronCreatorProfileHref("ava studio")).toContain(
      encodeURIComponent("ava studio")
    );
  });
});

describe("patron collection locked access copy", () => {
  it("formats locked tier message and counts locked entries per creator", async () => {
    const {
      patronCollectionLockedTierMessage,
      patronCollectionLockedTierSubscript,
      countLockedCollectionEntriesForCreator,
    } = await import("../../web/lib/patron-collection-locked-access.js");

    expect(patronCollectionLockedTierMessage()).toBe(
      "Your current tier does not include this post."
    );
    expect(patronCollectionLockedTierSubscript()).toBe("Resubscribe to regain access");

    const entries = [
      { creator_id: "c1", viewer_entitlement: { state: "locked" } },
      { creator_id: "c1", viewer_entitlement: { state: "locked" } },
      { creator_id: "c2", viewer_entitlement: { state: "locked" } },
      { creator_id: "c1", viewer_entitlement: { state: "visible" } },
    ];
    expect(countLockedCollectionEntriesForCreator(entries, "c1")).toBe(2);
    expect(countLockedCollectionEntriesForCreator(entries, "c2")).toBe(1);
  });
});

describe("gallery media focus index", () => {
  function resolveInitialStackIndex(
    mediaItems: Array<{ mediaId: string }> | undefined,
    initialMediaId?: string | null
  ): number {
    if (!initialMediaId?.trim() || !mediaItems?.length) {
      return 0;
    }
    const idx = mediaItems.findIndex((item) => item.mediaId === initialMediaId.trim());
    return idx >= 0 ? idx : 0;
  }

  it("initializes stack on matching media id", () => {
    const items = [{ mediaId: "a" }, { mediaId: "b" }, { mediaId: "c" }];
    expect(resolveInitialStackIndex(items, "b")).toBe(1);
  });

  it("falls back to first item when media id is missing", () => {
    const items = [{ mediaId: "a" }, { mediaId: "b" }];
    expect(resolveInitialStackIndex(items, "missing")).toBe(0);
    expect(resolveInitialStackIndex(items, null)).toBe(0);
  });
});
