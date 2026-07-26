import { NextResponse } from "next/server";
import { createSiteAdapters } from "@/lib/adapters";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadEnv } from "@/lib/env";
import {
  assessEmailReadiness,
  createMemoryEmailTransport,
  describeMessageTypes,
  EMAIL_GOLDEN_PATH_RECIPE,
  loadEmailOutbox,
  sendTransactionalEmail
} from "@/lib/email";
import { loadSite } from "@/lib/load-site";
import type { EmailMessageType } from "@/lib/email/types";
import { EMAIL_MESSAGE_TYPES } from "@/lib/email/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Email readiness + message catalog (EH-072). */
export async function GET(request: Request): Promise<NextResponse> {
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

  const env = loadEnv();
  const readiness = assessEmailReadiness({ env });
  const outbox = loadEmailOutbox(site.site_id);

  return NextResponse.json({
    ok: true,
    readiness,
    recipe: EMAIL_GOLDEN_PATH_RECIPE,
    message_types: describeMessageTypes(),
    outbox_entries: outbox.entries.slice(0, 20).map((e) => ({
      message_id: e.message_id,
      message_type: e.message_type,
      subject: e.subject,
      created_at: e.created_at,
      to_redacted: e.to.replace(/^(.).+(@.+)$/, "$1***$2")
    })),
    production_safe: false
  });
}

/**
 * Fixture send via memory outbox (or configured adapter).
 * Default action uses memory transport so CI never needs live Resend.
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", production_safe: false },
      { status: 400 }
    );
  }

  const message_type = String(body.message_type ?? "");
  if (!(EMAIL_MESSAGE_TYPES as readonly string[]).includes(message_type)) {
    return NextResponse.json(
      { ok: false, error: "invalid_message_type", production_safe: false },
      { status: 400 }
    );
  }

  const to =
    typeof body.to === "string" && body.to.includes("@")
      ? body.to
      : "operator@example.art";
  const useFixture =
    body.fixture !== false && body.use_live !== true;

  const payload = {
    message_type: message_type as EmailMessageType,
    to,
    subject:
      typeof body.subject === "string" && body.subject.trim()
        ? body.subject
        : `[EH-072 fixture] ${message_type}`,
    text_body:
      typeof body.text_body === "string" && body.text_body.trim()
        ? body.text_body
        : `Fixture transactional email (${message_type}). productionSafe=false.`,
    html_body: null as string | null,
    link_origin: loadEnv().NEXT_PUBLIC_SITE_URL ?? null
  };

  if (useFixture) {
    const transport = createMemoryEmailTransport({ siteId: site.site_id });
    const result = await sendTransactionalEmail(transport, payload);
    return NextResponse.json(
      { ...result, fixture: true, production_safe: false },
      { status: result.ok ? 200 : 400 }
    );
  }

  const adapters = createSiteAdapters();
  const result = await adapters.email.send(payload);
  return NextResponse.json(
    { ...result, fixture: false, production_safe: false },
    { status: result.ok ? 200 : 400 }
  );
}
