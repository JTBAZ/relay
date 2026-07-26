import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  ingestPatreonInsightsCsv,
  mapInsightsHeader,
  normalizePatreonPostIdCell,
  parseInsightsCsv,
  sha256Hex
} from "../src/analytics/patreon-insights-csv.js";
import { createApp } from "../src/server.js";

const sampleCsv = `Post id,Impressions,Seen,Likes,Comments
patreon_post_100,10,5,1,0
99999,20,8,2,1
`;

describe("normalizePatreonPostIdCell", () => {
  it("accepts numeric id, prefix, and URL", () => {
    expect(normalizePatreonPostIdCell("123")).toBe("patreon_post_123");
    expect(normalizePatreonPostIdCell("patreon_post_99")).toBe("patreon_post_99");
    expect(normalizePatreonPostIdCell("https://www.patreon.com/posts/some-title-555")).toBe(
      "patreon_post_555"
    );
  });
});

describe("parseInsightsCsv", () => {
  it("parses rows and dedupes by post id", () => {
    const r = parseInsightsCsv(sampleCsv);
    expect("rows" in r).toBe(true);
    if (!("rows" in r)) {
      return;
    }
    expect(r.rows.length).toBe(2);
    const byId = new Map(r.rows.map((x) => [x.patreonPostId, x]));
    expect(byId.get("patreon_post_100")?.impressions).toBe(10);
    expect(byId.get("patreon_post_99999")?.seen).toBe(8);
  });

  it("fails when a required metric column is missing", () => {
    const bad = `Post id,Impressions,Seen,Likes
patreon_post_1,1,1,1
`;
    const r = parseInsightsCsv(bad);
    expect(r).toMatchObject({ ok: false, code: "BAD_CSV" });
  });

  it("dedupes duplicate post rows keeping last", () => {
    const csv = `Post id,Impressions,Seen,Likes,Comments
1,1,1,1,1
1,2,2,2,2
`;
    const r = parseInsightsCsv(csv);
    expect("rows" in r).toBe(true);
    if (!("rows" in r)) {
      return;
    }
    expect(r.rows).toEqual([
      {
        patreonPostId: "patreon_post_1",
        impressions: 2,
        seen: 2,
        likes: 2,
        comments: 2
      }
    ]);
  });
});

describe("ingestPatreonInsightsCsv", () => {
  it("returns idempotent response when same file hash already exists", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "imp_existing" })
      .mockResolvedValueOnce({ id: "imp_existing" });
    const count = vi.fn().mockResolvedValue(3);
    const prisma = { patreonInsightsImport: { findFirst }, patreonInsightsPostMetric: { count } };

    const buf = Buffer.from(sampleCsv);
    const r = await ingestPatreonInsightsCsv(prisma as never, "creator_x", buf);
    expect(r).toMatchObject({
      ok: true,
      already_imported: true,
      import_id: "imp_existing",
      rows_written: 3,
      file_hash: sha256Hex(buf)
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { creatorId: "creator_x", fileHash: sha256Hex(buf) },
      select: { id: true }
    });
  });

  it("inserts import and metrics and links Post when matched", async () => {
    const fileHash = sha256Hex(Buffer.from(sampleCsv));
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "imp_new" });
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const postFindMany = vi
      .fn()
      .mockResolvedValue([{ id: "patreon_post_100", providerPostId: "patreon_post_100" }]);

    const prisma = {
      patreonInsightsImport: { findFirst, create },
      patreonInsightsPostMetric: { createMany, count: vi.fn() },
      post: { findMany: postFindMany },
      $transaction: vi.fn(async (fn: (tx: typeof prisma) => Promise<string>) => {
        const tx = {
          patreonInsightsImport: { create },
          patreonInsightsPostMetric: { createMany }
        };
        return fn(tx as never);
      })
    };

    const r = await ingestPatreonInsightsCsv(prisma as never, "creator_x", Buffer.from(sampleCsv), {
      asOf: new Date("2026-02-01T00:00:00.000Z")
    });
    expect(r).toMatchObject({
      ok: true,
      import_id: "imp_new",
      file_hash: fileHash,
      rows_written: 2,
      already_imported: false
    });
    expect(create).toHaveBeenCalledWith({
      data: { creatorId: "creator_x", fileHash, label: null }
    });
    expect(createMany).toHaveBeenCalled();
    const payload = createMany.mock.calls[0]![0].data as Array<Record<string, unknown>>;
    const row100 = payload.find((p) => p.patreonPostId === "patreon_post_100");
    expect(row100?.postId).toBe("patreon_post_100");
    const row999 = payload.find((p) => p.patreonPostId === "patreon_post_99999");
    expect(row999?.postId).toBeNull();
  });

  it("maps duplicate upload to existing row on P2002", async () => {
    const fileHash = sha256Hex(Buffer.from(sampleCsv));
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "imp_race" });
    const count = vi.fn().mockResolvedValue(2);
    const err = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: [] }
    });
    const prisma = {
      patreonInsightsImport: { findFirst, create: vi.fn().mockRejectedValue(err) },
      patreonInsightsPostMetric: { createMany: vi.fn(), count },
      post: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockRejectedValue(err)
    };

    const r = await ingestPatreonInsightsCsv(prisma as never, "creator_x", Buffer.from(sampleCsv));
    expect(r).toMatchObject({
      ok: true,
      already_imported: true,
      import_id: "imp_race",
      rows_written: 2
    });
  });
});

function bareConfig(tempDir: string) {
  return {
    patreon_client_id: "c",
    patreon_client_secret: "s",
    relay_token_encryption_key: randomBytes(32).toString("base64"),
    credential_store_path: join(tempDir, "patreon.json"),
    cookie_store_path: join(tempDir, "cookies.json"),
    ingest_canonical_path: join(tempDir, "canonical.json"),
    ingest_dlq_path: join(tempDir, "dlq.json"),
    patreon_sync_watermark_path: join(tempDir, "watermarks.json"),
    patreon_sync_health_path: join(tempDir, "patreon_sync_health.json"),
    creator_campaign_display_path: join(tempDir, "creator_campaign_display.json"),
    export_storage_root: join(tempDir, "exports"),
    gallery_post_overrides_path: join(tempDir, "gallery_overrides.json"),
    gallery_saved_filters_path: join(tempDir, "saved_filters.json"),
    analytics_store_path: join(tempDir, "analytics.json"),
    clone_store_path: join(tempDir, "clone_sites.json"),
    identity_store_path: join(tempDir, "identity.json"),
    payment_store_path: join(tempDir, "payments.json"),
    migration_store_path: join(tempDir, "migrations.json"),
    deploy_store_path: join(tempDir, "deploys.json"),
    fetch_impl: vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
  };
}

describe("POST /api/v1/creator/analytics/patreon-insights-csv", () => {
  it("returns 503 when Prisma is not wired on AppConfig", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "relay-insights-csv-"));
    const { app } = createApp(bareConfig(tempDir));

    const res = await request(app).post("/api/v1/creator/analytics/patreon-insights-csv");
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("SERVICE_UNAVAILABLE");
  });
});

describe("mapInsightsHeader", () => {
  it("detects flexible Seen header", () => {
    const headers = ["Post id", "Impressions", "Seen by patrons", "Likes", "Comments"];
    const m = mapInsightsHeader(headers);
    expect("indices" in m).toBe(true);
    if (!("indices" in m)) {
      return;
    }
    expect(m.indices.seenIdx).toBe(2);
  });
});
