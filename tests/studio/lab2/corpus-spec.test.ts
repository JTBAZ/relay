import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STUDIO_LAB2_CREATOR_ID,
  STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS,
  STUDIO_LAB2_LABEL,
  authorStudioLab2Corpus,
  defaultStudioLab2CorpusPath,
  hashStudioLab2Corpus,
  loadStudioLab2Corpus,
  validateStudioLab2Corpus,
  writeStudioLab2CorpusFixture
} from "../../../src/studio/lab2/corpus-spec.js";
import { parseSequenceToken, resolveNumberedSequence } from "../../../src/studio/command/sequence.js";

describe("Studio Lab 2 corpus spec (RC-P2-T01)", () => {
  it("authors a valid 112-post corpus with a stable hash", () => {
    const authored = authorStudioLab2Corpus();
    expect(validateStudioLab2Corpus(authored)).toEqual([]);
    expect(authored.posts).toHaveLength(112);
    expect(authored.label).toBe(STUDIO_LAB2_LABEL);
    expect(authored.creator.relayCreatorId).toBe(STUDIO_LAB2_CREATOR_ID);
    expect(authored.fixture_hash).toHaveLength(64);
    expect(authored.fixture_hash).toBe(hashStudioLab2Corpus(authored));
    expect(authored.eval.academy_ambiguous_labels).toEqual(["Hero Academy", "Academy Studies"]);
    expect(authored.eval.pagination_requires_second_page).toBe(true);
    expect(authored.eval.hero_academy_ordered_ids).not.toContain("sl2_ha_p08_dup");
    expect(authored.eval.hero_academy_ordered_ids[0]).toBe("sl2_ha_cover");
  });

  it("writes and reloads an on-disk fixture whose hash is stable", () => {
    const dir = join(tmpdir(), `sl2-corpus-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "studio-lab2-corpus.json");
    const { hash } = writeStudioLab2CorpusFixture(path);
    const loaded = loadStudioLab2Corpus(path);
    expect(loaded.fixture_hash).toBe(hash);
    expect(validateStudioLab2Corpus(loaded)).toEqual([]);
    const second = JSON.parse(readFileSync(path, "utf8"));
    expect(hashStudioLab2Corpus(second)).toBe(hash);
  });

  it("rejects a tampered fixture_hash", () => {
    const authored = authorStudioLab2Corpus();
    const tampered = { ...authored, fixture_hash: "0".repeat(64) };
    expect(validateStudioLab2Corpus(tampered).some((e) => e.includes("fixture_hash"))).toBe(true);
  });

  it("parses Hero Academy mixed titles, gap 17, duplicate 8", () => {
    const authored = authorStudioLab2Corpus();
    const ha = authored.posts.filter((p) => p.series_id === authored.eval.hero_academy_series_id);
    expect(parseSequenceToken("Hero Academy Cover").is_cover).toBe(true);
    expect(parseSequenceToken("Hero Academy page 06").number).toBe(6);
    const resolved = resolveNumberedSequence(ha.map((p) => ({ post_id: p.post_id, title: p.title })));
    expect(resolved.gaps).toEqual([17]);
    expect(resolved.duplicates).toEqual([8]);
    const page2 = resolved.members.find((m) => m.post_id === "sl2_ha_p02")!;
    const page10 = resolved.members.find((m) => m.post_id === "sl2_ha_p10")!;
    expect(page10.sort_key).toBeGreaterThan(page2.sort_key);
  });

  it("keeps the committed fixture in lockstep with author()", () => {
    const path = defaultStudioLab2CorpusPath();
    const onDisk = JSON.parse(readFileSync(path, "utf8"));
    const authored = authorStudioLab2Corpus();
    expect(onDisk.fixture_hash).toBe(authored.fixture_hash);
    expect(validateStudioLab2Corpus(onDisk)).toEqual([]);
    expect(onDisk.posts).toHaveLength(112);
  });

  it("baseline Photo Studies members are five similarly named image posts", () => {
    const authored = authorStudioLab2Corpus();
    const members = STUDIO_LAB2_DEFAULT_COLLECTION_POST_IDS.map(
      (id) => authored.posts.find((p) => p.post_id === id)
    );
    expect(members).toHaveLength(5);
    for (const [i, post] of members.entries()) {
      expect(post?.media_type).toBe("photo");
      expect(post?.media[0]?.mime_type.startsWith("image/")).toBe(true);
      expect(post?.title).toBe(`Standalone photo ${i + 1}`);
    }
  });
});
