import { describe, expect, it } from "vitest";
import {
  composeFieldMatchesExpected,
  normalizeComposeTextForMatch,
  splitXPostTextForFill,
  textTriggersHashtagTypeahead,
  typeaheadSettleTimeoutMs,
  verifyTimeoutMsForText
} from "../extension/src/content/x-compose-fill-helpers.js";

describe("normalizeComposeTextForMatch", () => {
  it("collapses whitespace", () => {
    expect(normalizeComposeTextForMatch("1\n\n#test")).toBe("1#test");
  });
});

describe("composeFieldMatchesExpected", () => {
  it("matches when whitespace differs", () => {
    expect(composeFieldMatchesExpected("1#test", "1\n\n#test")).toBe(true);
  });

  it("rejects duplicated hashtag tokens", () => {
    expect(composeFieldMatchesExpected("1\n\n#f\n\n#f", "1\n\n#f")).toBe(false);
    expect(composeFieldMatchesExpected("1#f#f", "1\n\n#f")).toBe(false);
  });

  it("accepts exact normalized content", () => {
    expect(composeFieldMatchesExpected("1\n\n#f", "1\n\n#f")).toBe(true);
  });
});

describe("hashtag timing helpers", () => {
  it("detects hashtag text", () => {
    expect(textTriggersHashtagTypeahead("1\n\n#f")).toBe(true);
    expect(textTriggersHashtagTypeahead("hello")).toBe(false);
  });

  it("uses longer timeouts for hashtag drafts", () => {
    expect(verifyTimeoutMsForText("hello")).toBeLessThan(verifyTimeoutMsForText("1\n\n#f"));
    expect(typeaheadSettleTimeoutMs("hello")).toBeLessThan(typeaheadSettleTimeoutMs("1\n\n#f"));
  });
});

describe("splitXPostTextForFill", () => {
  it("splits body and trailing hashtag line", () => {
    expect(splitXPostTextForFill("123\n\n#test")).toEqual({
      body: "123",
      tagLine: "#test"
    });
  });

  it("splits multiple hashtags on the tag line", () => {
    expect(splitXPostTextForFill("123\n\n#test #other")).toEqual({
      body: "123",
      tagLine: "#test #other"
    });
  });

  it("returns full text as body when no separate tag line", () => {
    expect(splitXPostTextForFill("hello world")).toEqual({
      body: "hello world",
      tagLine: null
    });
    expect(splitXPostTextForFill("#test")).toEqual({
      body: "#test",
      tagLine: null
    });
  });

  it("does not split embedded hashtags in body", () => {
    expect(splitXPostTextForFill("Check #test out")).toEqual({
      body: "Check #test out",
      tagLine: null
    });
  });
});
