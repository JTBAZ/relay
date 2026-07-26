/**
 * P5a-ins-006 — Parse Patreon Insights CSV exports and persist `PatreonInsightsImport` + `PatreonInsightsPostMetric`.
 */
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import Busboy from "busboy";
import type { Request } from "express";

export const MAX_INSIGHTS_CSV_BYTES = 12 * 1024 * 1024;

export type ParsedInsightsRow = {
  patreonPostId: string;
  impressions: number | null;
  seen: number | null;
  likes: number | null;
  comments: number | null;
};

export type ParsedInsightsCsv = {
  rows: ParsedInsightsRow[];
  headerRow: string[];
};

export type ParseInsightsCsvError = {
  ok: false;
  code: "BAD_CSV";
  errors: string[];
};

function normalizeHeaderCell(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

/** RFC 4180-ish: quoted fields, doubled quotes, \r\n or \n. */
export function splitCsvRows(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i++) {
    const c = normalized[i]!;
    if (inQuotes) {
      if (c === '"') {
        const next = normalized[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
    } else {
      cur += c;
    }
  }
  row.push(cur);
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }
  return rows;
}

function parseMetricInt(raw: string): number | null {
  const t = raw.trim().replace(/,/g, "");
  if (!t) {
    return null;
  }
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Derive stable `patreon_post_<id>` from a Patreon Insights cell (numeric id, prefixed id, or post URL).
 */
export function normalizePatreonPostIdCell(raw: string): string | null {
  const t = raw.trim();
  if (!t) {
    return null;
  }
  const prefixed = /^patreon_post_(\d+)$/i.exec(t);
  if (prefixed) {
    return `patreon_post_${prefixed[1]}`;
  }
  if (/^\d+$/.test(t)) {
    return `patreon_post_${t}`;
  }
  const slugInUrl = /patreon\.com\/posts\/[^?\s#]+-(\d+)/i.exec(t);
  if (slugInUrl) {
    return `patreon_post_${slugInUrl[1]}`;
  }
  const urlMatch = /posts\/(\d+)/i.exec(t);
  if (urlMatch) {
    return `patreon_post_${urlMatch[1]}`;
  }
  return null;
}

function pickColumnIndex(headerNorm: string[], candidates: string[]): number {
  for (const want of candidates) {
    const idx = headerNorm.indexOf(want);
    if (idx !== -1) {
      return idx;
    }
  }
  return -1;
}

type ColumnIndices = {
  postIdx: number;
  impressionsIdx: number;
  seenIdx: number;
  likesIdx: number;
  commentsIdx: number;
};

/**
 * Validates header row and returns mapped column indices. Requires post key + four metric columns.
 */
export function mapInsightsHeader(headers: string[]): ParseInsightsCsvError | { indices: ColumnIndices } {
  const headerNorm = headers.map(normalizeHeaderCell);
  const postIdx = pickColumnIndex(headerNorm, [
    "post id",
    "post_id",
    "patreon post id",
    "post url",
    "url",
    "post link"
  ]);
  const impressionsIdx = pickColumnIndex(headerNorm, ["impressions", "impression"]);
  const seenIdx = pickColumnIndex(headerNorm, ["seen", "seen by patrons", "seen by"]);
  const likesIdx = pickColumnIndex(headerNorm, ["likes", "like"]);
  const commentsIdx = pickColumnIndex(headerNorm, ["comments", "comment"]);

  const errors: string[] = [];
  if (postIdx === -1) {
    errors.push(
      'Missing post column — expected a header like "Post id", "Post URL", or "URL" with a Patreon post id or link.'
    );
  }
  if (impressionsIdx === -1) {
    errors.push('Missing "Impressions" column.');
  }
  if (seenIdx === -1) {
    errors.push('Missing "Seen" column (or equivalent).');
  }
  if (likesIdx === -1) {
    errors.push('Missing "Likes" column.');
  }
  if (commentsIdx === -1) {
    errors.push('Missing "Comments" column.');
  }
  if (errors.length > 0) {
    return { ok: false, code: "BAD_CSV", errors };
  }
  return {
    indices: {
      postIdx,
      impressionsIdx,
      seenIdx,
      likesIdx,
      commentsIdx
    }
  };
}

export function parseInsightsCsv(text: string): ParsedInsightsCsv | ParseInsightsCsvError {
  const grid = splitCsvRows(text.replace(/^\uFEFF/, ""));
  if (grid.length === 0) {
    return { ok: false, code: "BAD_CSV", errors: ["CSV is empty."] };
  }
  const headerRow = grid[0]!;
  const mapped = mapInsightsHeader(headerRow);
  if (!("indices" in mapped)) {
    return mapped;
  }
  const { indices } = mapped;
  const byPost = new Map<string, ParsedInsightsRow>();

  for (let r = 1; r < grid.length; r++) {
    const line = grid[r]!;
    const postRaw = line[indices.postIdx] ?? "";
    const patreonPostId = normalizePatreonPostIdCell(postRaw);
    if (!patreonPostId) {
      continue;
    }
    const row: ParsedInsightsRow = {
      patreonPostId,
      impressions: parseMetricInt(line[indices.impressionsIdx] ?? ""),
      seen: parseMetricInt(line[indices.seenIdx] ?? ""),
      likes: parseMetricInt(line[indices.likesIdx] ?? ""),
      comments: parseMetricInt(line[indices.commentsIdx] ?? "")
    };
    byPost.set(patreonPostId, row);
  }

  const rows = [...byPost.values()];
  if (rows.length === 0) {
    return {
      ok: false,
      code: "BAD_CSV",
      errors: ["No post rows with valid Patreon post ids — check the post column values."]
    };
  }

  return { rows, headerRow };
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

async function resolvePostIds(
  prisma: PrismaClient,
  creatorId: string,
  patreonPostIds: string[]
): Promise<Map<string, string>> {
  const uniq = [...new Set(patreonPostIds)];
  if (uniq.length === 0) {
    return new Map();
  }
  const or: Prisma.PostWhereInput[] = [];
  for (const pid of uniq) {
    or.push({ id: pid });
    or.push({ providerPostId: pid });
    const m = /^patreon_post_(\d+)$/i.exec(pid);
    if (m) {
      const n = m[1]!;
      or.push({ providerPostId: n });
    }
  }
  const posts = await prisma.post.findMany({
    where: { creatorId, OR: or },
    select: { id: true, providerPostId: true }
  });
  const out = new Map<string, string>();
  for (const p of posts) {
    out.set(p.id, p.id);
    if (p.providerPostId) {
      out.set(p.providerPostId, p.id);
    }
  }
  return out;
}

export type IngestPatreonInsightsResult =
  | {
      ok: true;
      import_id: string;
      file_hash: string;
      rows_written: number;
      already_imported: boolean;
    }
  | ParseInsightsCsvError;

/**
 * Parses CSV bytes, inserts import + metrics idempotently on `(creatorId, file_hash)`.
 */
export async function ingestPatreonInsightsCsv(
  prisma: PrismaClient,
  creatorId: string,
  csvBytes: Buffer,
  options?: { label?: string | null; asOf?: Date | null }
): Promise<IngestPatreonInsightsResult> {
  const text = csvBytes.toString("utf8");
  const parsed = parseInsightsCsv(text);
  if (!("rows" in parsed)) {
    return parsed;
  }

  const fileHash = sha256Hex(csvBytes);
  const existing = await prisma.patreonInsightsImport.findFirst({
    where: { creatorId, fileHash },
    select: { id: true }
  });
  if (existing) {
    const rows_written = await prisma.patreonInsightsPostMetric.count({
      where: { importId: existing.id }
    });
    return {
      ok: true,
      import_id: existing.id,
      file_hash: fileHash,
      rows_written,
      already_imported: true
    };
  }

  const asOf = options?.asOf ?? undefined;
  const label = options?.label?.trim() || null;

  const postLinkMap = await resolvePostIds(
    prisma,
    creatorId,
    parsed.rows.map((r) => r.patreonPostId)
  );

  const metricsData: Omit<Prisma.PatreonInsightsPostMetricCreateManyInput, "importId">[] =
    parsed.rows.map((r) => ({
      creatorId,
      patreonPostId: r.patreonPostId,
      impressions: r.impressions,
      seen: r.seen,
      likes: r.likes,
      comments: r.comments,
      asOf: asOf ?? null,
      postId:
        postLinkMap.get(r.patreonPostId) ??
        postLinkMap.get(r.patreonPostId.replace(/^patreon_post_/, "")) ??
        null
    }));

  let importId: string;

  try {
    importId = await prisma.$transaction(async (tx) => {
      const imp = await tx.patreonInsightsImport.create({
        data: { creatorId, fileHash, label }
      });
      const chunk = 200;
      for (let i = 0; i < metricsData.length; i += chunk) {
        const slice = metricsData.slice(i, i + chunk).map((m) => ({ ...m, importId: imp.id }));
        if (slice.length > 0) {
          await tx.patreonInsightsPostMetric.createMany({ data: slice });
        }
      }
      return imp.id;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.patreonInsightsImport.findFirst({
        where: { creatorId, fileHash },
        select: { id: true }
      });
      if (again) {
        const rows_written = await prisma.patreonInsightsPostMetric.count({
          where: { importId: again.id }
        });
        return {
          ok: true,
          import_id: again.id,
          file_hash: fileHash,
          rows_written,
          already_imported: true
        };
      }
    }
    throw e;
  }

  return {
    ok: true,
    import_id: importId,
    file_hash: fileHash,
    rows_written: metricsData.length,
    already_imported: false
  };
}

export type MultipartInsightsRead =
  | { ok: true; buffer: Buffer; filename?: string; label?: string }
  | { ok: false; code: "NOT_MULTIPART" | "NO_FILE" | "FILE_TOO_LARGE"; message: string };

/**
 * Reads `multipart/form-data` field `file` (optional `label`). Caller should only invoke when Content-Type is multipart.
 */
export function readPatreonInsightsMultipart(req: Request): Promise<MultipartInsightsRead> {
  return new Promise((resolve, reject) => {
    const ct = req.headers["content-type"] ?? "";
    if (!ct.toLowerCase().includes("multipart/form-data")) {
      resolve({
        ok: false,
        code: "NOT_MULTIPART",
        message: "Expected Content-Type multipart/form-data with a CSV file field named file."
      });
      return;
    }

    let label: string | undefined;
    let fileBuffer: Buffer | undefined;
    let filename: string | undefined;
    let settled = false;
    let fileRejected = false;

    const bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_INSIGHTS_CSV_BYTES }
    });

    bb.on("field", (name, val) => {
      if (name === "label" && typeof val === "string") {
        label = val;
      }
    });

    bb.on("file", (name, file, info) => {
      if (name !== "file") {
        file.resume();
        return;
      }
      const chunks: Buffer[] = [];
      file.on("data", (d: Buffer) => {
        chunks.push(d);
      });
      file.on("limit", () => {
        fileRejected = true;
        if (!settled) {
          settled = true;
          resolve({
            ok: false,
            code: "FILE_TOO_LARGE",
            message: `CSV exceeds ${MAX_INSIGHTS_CSV_BYTES} bytes.`
          });
        }
      });
      file.on("error", (err: Error) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });
      file.on("end", () => {
        if (!fileRejected && !settled) {
          fileBuffer = Buffer.concat(chunks);
          filename = info.filename;
        }
      });
    });

    bb.on("error", (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    });

    bb.on("finish", () => {
      if (settled) {
        return;
      }
      settled = true;
      if (!fileBuffer || fileBuffer.length === 0) {
        resolve({
          ok: false,
          code: "NO_FILE",
          message: 'Missing file upload — use form field name "file" for the CSV.'
        });
        return;
      }
      resolve({ ok: true, buffer: fileBuffer, filename, label });
    });

    req.pipe(bb);
  });
}
