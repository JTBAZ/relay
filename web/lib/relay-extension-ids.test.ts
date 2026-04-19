import { afterEach, describe, expect, it } from "vitest";
import { isRecognizedRelayExtensionId, parseRelayExtensionIds } from "./relay-extension-ids";

describe("parseRelayExtensionIds", () => {
  const prev = process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS;

  afterEach(() => {
    process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS = prev;
  });

  it("returns empty set when unset", () => {
    delete process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS;
    expect(parseRelayExtensionIds().size).toBe(0);
  });

  it("trims and dedupes", () => {
    process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS = " abc , def , abc ";
    expect(parseRelayExtensionIds()).toEqual(new Set(["abc", "def"]));
  });

  it("isRecognizedRelayExtensionId respects allowlist", () => {
    process.env.NEXT_PUBLIC_RELAY_EXTENSION_IDS = "goodid";
    expect(isRecognizedRelayExtensionId("goodid")).toBe(true);
    expect(isRecognizedRelayExtensionId("bad")).toBe(false);
    expect(isRecognizedRelayExtensionId("")).toBe(false);
  });
});
