import { describe, expect, it } from "vitest";
import { CommandContractError } from "../../../src/studio/command/contracts.js";
import {
  assertNumberedSequence,
  parseSequenceToken,
  resolveNumberedSequence
} from "../../../src/studio/command/sequence.js";

describe("numbered sequence extraction (RC-P1-T04)", () => {
  it("parses Page / Part / Pg / P / zero-padded variants to the same integer", () => {
    expect(parseSequenceToken("Hero Academy Page 2").number).toBe(2);
    expect(parseSequenceToken("Hero Academy Page 2").token_kind).toBe("page");
    expect(parseSequenceToken("Part 2").number).toBe(2);
    expect(parseSequenceToken("Part 2").token_kind).toBe("part");
    expect(parseSequenceToken("Pg. 2").number).toBe(2);
    expect(parseSequenceToken("Pg. 2").token_kind).toBe("pg");
    expect(parseSequenceToken("P. 5").number).toBe(5);
    expect(parseSequenceToken("P. 5").token_kind).toBe("p");
    expect(parseSequenceToken("page 03").number).toBe(3);
  });

  it("sorts numerically so Page 10 follows Page 2, not lexicographic order", () => {
    const resolution = resolveNumberedSequence([
      { post_id: "p10", title: "Hero Academy Page 10" },
      { post_id: "p2", title: "Hero Academy Page 2" },
      { post_id: "p1", title: "Hero Academy Page 1" },
      { post_id: "cover", title: "Hero Academy Cover" }
    ]);
    expect(resolution.members.map((m) => m.post_id)).toEqual(["cover", "p1", "p2", "p10"]);
    expect(resolution.members.find((m) => m.post_id === "p2")?.sort_key).toBe(2);
    expect(resolution.members.find((m) => m.post_id === "p10")?.sort_key).toBe(10);
    expect(resolution.members[0]?.is_cover).toBe(true);
    expect(resolution.members[0]?.sort_key).toBe(0);
  });

  it("reports missing page 17 as COMMAND_SEQUENCE_GAP without inventing a post", () => {
    const items = [];
    for (let n = 1; n <= 18; n += 1) {
      if (n === 17) continue;
      items.push({ post_id: `p${n}`, title: `Hero Academy Page ${n}` });
    }
    const resolution = resolveNumberedSequence(items);
    expect(resolution.gaps).toEqual([17]);
    expect(resolution.members.some((m) => m.number === 17)).toBe(false);
    try {
      assertNumberedSequence(resolution);
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_SEQUENCE_GAP");
      expect((err as CommandContractError).details).toEqual(
        expect.arrayContaining([{ field: "number", issue: "17" }])
      );
    }
  });

  it("reports duplicate page 8 as COMMAND_SEQUENCE_DUPLICATE without deleting", () => {
    const resolution = resolveNumberedSequence([
      { post_id: "p8a", title: "Hero Academy Page 8" },
      { post_id: "p8b", title: "Hero Academy page 08" },
      { post_id: "p7", title: "Hero Academy Page 7" }
    ]);
    expect(resolution.duplicates).toEqual([8]);
    expect(resolution.members.filter((m) => m.number === 8)).toHaveLength(2);
    expect(() => assertNumberedSequence(resolution)).toThrow(
      expect.objectContaining({ code: "COMMAND_SEQUENCE_DUPLICATE" })
    );
  });

  it("does not pick when two series labels are present (COMMAND_AMBIGUOUS)", () => {
    try {
      resolveNumberedSequence([
        { post_id: "ha", title: "Hero Academy Page 1" },
        { post_id: "as", title: "Academy Studies Page 1" }
      ]);
      expect.unreachable("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(CommandContractError);
      expect((err as CommandContractError).code).toBe("COMMAND_AMBIGUOUS");
      const issues = (err as CommandContractError).details.map((d) => d.issue);
      expect(issues).toEqual(expect.arrayContaining(["Academy Studies", "Hero Academy"]));
    }
  });

  it("prefers member_label when present and leaves unparsed titles after numbered ones", () => {
    const resolution = resolveNumberedSequence([
      { post_id: "notes", title: "Sketch dump" },
      { post_id: "p4", title: "ignored title", member_label: "Pg. 4" }
    ]);
    expect(resolution.members[0]?.post_id).toBe("p4");
    expect(resolution.members[0]?.sort_key).toBe(4);
    expect(resolution.unparsed_post_ids).toEqual(["notes"]);
    expect(resolution.members[1]?.sort_key).toBe(Number.MAX_SAFE_INTEGER);
  });
});
