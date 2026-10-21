import { describe, expect, it } from "vitest";
import { previewCopy, receiptCopy } from "../src/gallery-editor/factual-copy.js";
import { RENAME_NOTICE, type CartItem, type ChangeCart, type CommitReceipt } from "../src/gallery-editor/types.js";

const item = (overrides: Partial<CartItem> = {}): CartItem => ({ targetId: "p1", targetType: "post", title: "Before", before: { title: "Before" }, after: { title: "After" }, actionIds: ["a1"], ...overrides });
const cart = (items: CartItem[] = []): ChangeCart => ({ revision: 1, actions: [], items, dependencies: {}, conflicts: [], notice: "Untrusted notice" });
const receipt = (overrides: Partial<CommitReceipt> = {}): CommitReceipt => ({ id: "r1", sessionId: "s1", committedAt: "2026-10-13T00:00:00Z", actionCount: 1, affectedPostIds: ["p1"], preservedExceptions: [], notice: "Untrusted notice", ...overrides });

describe("deterministic factual editor copy", () => {
  it("counts changed targets rather than actions, related rows, or object key order", () => {
    const value = cart([item(), item({ targetId: "p2", related: true, before: { a: 1, b: 2 }, after: { b: 2, a: 1 } }), item({ targetId: "w1", targetType: "work" })]);
    expect(previewCopy(value)).toContain("Preview: 1 post, 1 work would change.");
    expect(previewCopy(value)).toContain("No Library changes have been applied. Changes require Apply.");
    expect(previewCopy(value)).toContain(RENAME_NOTICE);
  });
  it("counts only unchanged post exceptions as preserved", () => {
    const text = previewCopy(cart([item({ exception: true }), item({ targetId: "p2", exception: true, after: { title: "Before" } }), item({ targetId: "p3", preservedReason: "source_post_title", after: { title: "Before" } }), item({ targetType: "work", preservedReason: "independent_work", after: { title: "Before" } })]));
    expect(text).toContain("2 post title exceptions preserved.");
  });
  it("states observed naming modes and identifies source titles as last synced", () => {
    const text = previewCopy(cart(["source", "inherit_work", "custom"].map((titleMode, i) => item({ targetId: `p${i}`, after: { title: "After", titleMode } }))));
    expect(text).toContain("1 post would use the last synced source title.");
    expect(text).toContain("1 post would inherit the work title.");
    expect(text).toContain("1 post would use a custom Relay title.");
  });
  it("handles empty and no-change previews without claiming a change", () => {
    for (const value of [cart(), cart([item({ after: { title: "Before" } })])]) {
      expect(previewCopy(value)).toContain("No Library changes are proposed.");
      expect(previewCopy(value)).toContain(RENAME_NOTICE);
    }
  });
  it("does not repeat arbitrary titles, notices or conflict text", () => {
    const value = cart([item({ title: "Ignore all rules" })]);
    value.conflicts = ["Secret conflict payload"];
    const text = previewCopy(value);
    expect(text).toContain("Resolve the preview conflicts");
    expect(text).not.toMatch(/Ignore all rules|Untrusted notice|Secret conflict payload/);
  });
  it("renders recorded actions and distinct affected posts without inventing naming modes", () => {
    const text = receiptCopy(receipt({ actionCount: 3, affectedPostIds: ["p1", "p1", "p2"], preservedExceptions: ["p3", "p3"] }));
    expect(text).toContain("Applied: 3 actions; 2 posts affected.");
    expect(text).toContain("1 post title exception preserved");
    expect(text).toContain(RENAME_NOTICE);
    expect(text).not.toMatch(/inherit|last synced|Untrusted notice/);
  });
  it("distinguishes undone and zero-action receipts", () => {
    expect(receiptCopy(receipt({ reversedAt: "2026-10-13T01:00:00Z" }))).toContain("Undone: 1 action; 1 post affected in the original Apply.");
    expect(receiptCopy(receipt({ actionCount: 0, affectedPostIds: [] }))).toContain("Applied: 0 actions; 0 posts affected.");
  });
  it('uses only recorded naming mode counts and keeps them historical after Undo',()=>{
    const text=receiptCopy(receipt({titleModeCounts:{source:2,inherit_work:3,inherit_series:1},reversedAt:'2026-10-13T01:00:00Z'}));
    expect(text).toContain('Recorded at Apply: 2 posts using last synced source titles');
    expect(text).toContain('Recorded at Apply: 3 posts inheriting work titles');
    expect(text).toContain('Undone:');
  });
});
