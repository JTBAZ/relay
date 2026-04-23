import { describe, expect, it } from "vitest";
import { evaluateCommentAutoMod } from "../../src/patron/comment-auto-mod.js";

describe("evaluateCommentAutoMod", () => {
  it("passes a normal short comment with no flags", () => {
    const r = evaluateCommentAutoMod("Loved this piece, the lighting is gorgeous!");
    expect(r.flags).toHaveLength(0);
    expect(r.initialModState).toBe("visible");
  });

  it("hides empty comments via empty_body block flag", () => {
    const r = evaluateCommentAutoMod("   ");
    expect(r.flags.some((f) => f.rule_id === "empty_body" && f.severity === "block")).toBe(true);
    expect(r.initialModState).toBe("hidden");
  });

  it("blocks bodies above the max length", () => {
    const long = "a".repeat(5_000);
    const r = evaluateCommentAutoMod(long);
    expect(r.flags.some((f) => f.rule_id === "body_too_long" && f.severity === "block")).toBe(true);
    expect(r.initialModState).toBe("hidden");
  });

  it("warns on >2 links but does not auto-hide", () => {
    const r = evaluateCommentAutoMod(
      "https://a.example https://b.example https://c.example check these out"
    );
    expect(r.flags.some((f) => f.rule_id === "many_links" && f.severity === "warn")).toBe(true);
    expect(r.initialModState).toBe("visible");
  });

  it("warns on long repeated character runs", () => {
    const r = evaluateCommentAutoMod("aaaaaaaaaaaaa");
    expect(r.flags.some((f) => f.rule_id === "repeated_chars")).toBe(true);
  });

  it("flags shouting (all caps over the threshold)", () => {
    const r = evaluateCommentAutoMod("THIS IS A LOUD ANNOUNCEMENT FOR EVERYONE");
    expect(r.flags.some((f) => f.rule_id === "all_caps_shouting")).toBe(true);
  });

  it("blocks banned tokens (case-insensitive)", () => {
    const r = evaluateCommentAutoMod("BUY-NOW-CHEAP visit my site");
    expect(r.flags.some((f) => f.rule_id === "banned_token" && f.severity === "block")).toBe(true);
    expect(r.initialModState).toBe("hidden");
  });
});
