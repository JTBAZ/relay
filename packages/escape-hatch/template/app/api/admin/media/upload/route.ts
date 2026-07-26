import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { attachLocalMediaFile } from "@/lib/cms/posts";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Attach uploaded bytes as local private media on a post (EH-060).
 * Multipart form: post_id, file. R2 multipart remains a later slice.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let site;
  try {
    site = loadSite();
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Failed to load site.",
        production_safe: false
      },
      { status: 400 }
    );
  }

  const access = await assertAdminMutationAccess(request, site.site_id);
  if (!access.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: access.error,
        mode: access.mode,
        production_safe: false
      },
      { status: access.status }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_form", production_safe: false },
      { status: 400 }
    );
  }

  const postId = String(form.get("post_id") ?? "").trim();
  const file = form.get("file");
  if (!postId || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "post_id_and_file_required", production_safe: false },
      { status: 400 }
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0) {
    return NextResponse.json(
      { ok: false, error: "empty_file", production_safe: false },
      { status: 400 }
    );
  }
  if (buf.byteLength > 25 * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: "file_too_large", production_safe: false },
      { status: 400 }
    );
  }

  const tmpDir = join(tmpdir(), "eh-cms-upload");
  mkdirSync(tmpDir, { recursive: true });
  const safeName = (file.name || "upload.bin").replace(/[^\w.-]+/g, "_");
  const tmpPath = join(tmpDir, `${Date.now()}_${safeName}`);
  writeFileSync(tmpPath, buf);

  const result = attachLocalMediaFile({
    postId,
    sourceFilePath: tmpPath,
    mimeType: file.type || undefined,
    publicCopy: false
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    media: result.media,
    post: result.post,
    production_safe: false
  });
}
