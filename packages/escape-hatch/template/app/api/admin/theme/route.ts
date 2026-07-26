import { NextResponse } from "next/server";
import { publishTheme, type PublishThemeInput } from "@/lib/cms/theme";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Publish appearance theme dials into kit data (EH-062). */
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

  const heroRaw = body.hero;
  const ctaRaw = body.community_cta;
  const input: PublishThemeInput = {
    color_scheme:
      body.color_scheme === "dark" ||
      body.color_scheme === "light" ||
      body.color_scheme === "warm"
        ? body.color_scheme
        : undefined,
    paywall_style:
      body.paywall_style === "blur" ||
      body.paywall_style === "hard" ||
      body.paywall_style === "teaser"
        ? body.paywall_style
        : undefined,
    accent_color:
      typeof body.accent_color === "string" ? body.accent_color : undefined,
    type_pairing:
      body.type_pairing === "editorial" ||
      body.type_pairing === "studio" ||
      body.type_pairing === "signal"
        ? body.type_pairing
        : undefined,
    gallery_density:
      body.gallery_density === "comfortable" ||
      body.gallery_density === "compact"
        ? body.gallery_density
        : undefined,
    cover_crop:
      body.cover_crop === "center" ||
      body.cover_crop === "top" ||
      body.cover_crop === "safe"
        ? body.cover_crop
        : undefined,
    logo_path: typeof body.logo_path === "string" ? body.logo_path : undefined,
    paywall_message:
      typeof body.paywall_message === "string"
        ? body.paywall_message
        : undefined,
    hero:
      heroRaw && typeof heroRaw === "object"
        ? {
            title:
              typeof (heroRaw as { title?: unknown }).title === "string"
                ? (heroRaw as { title: string }).title
                : site.theme.hero.title,
            subtitle:
              typeof (heroRaw as { subtitle?: unknown }).subtitle === "string"
                ? (heroRaw as { subtitle: string }).subtitle
                : undefined,
            bio:
              typeof (heroRaw as { bio?: unknown }).bio === "string"
                ? (heroRaw as { bio: string }).bio
                : undefined
          }
        : undefined,
    community_cta:
      ctaRaw === null
        ? null
        : ctaRaw && typeof ctaRaw === "object"
          ? {
              label:
                typeof (ctaRaw as { label?: unknown }).label === "string"
                  ? (ctaRaw as { label: string }).label
                  : "",
              href:
                typeof (ctaRaw as { href?: unknown }).href === "string"
                  ? (ctaRaw as { href: string }).href
                  : ""
            }
          : undefined
  };

  const result = publishTheme(input);
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason, production_safe: false },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    theme: result.theme,
    production_safe: false
  });
}
