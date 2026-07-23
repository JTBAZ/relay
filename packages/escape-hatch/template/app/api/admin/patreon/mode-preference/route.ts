import { NextResponse } from "next/server";
import { assertAdminMutationAccess } from "@/lib/identity/admin-access";
import { loadSite } from "@/lib/load-site";
import {
  isValidOAuthChoiceOption,
  type OAuthChoiceOptionId
} from "@/lib/patreon/oauth-choice";
import {
  buildSwitchOffResult,
  savePatreonModePreference
} from "@/lib/patreon/mode-preference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  preferred_mode?: string;
};

/**
 * Persist non-secret Patreon mode preference / switch-off (EH-043).
 * Never accepts or writes tokens. Runtime mode remains ESCAPE_HATCH_PATREON_MODE.
 */
export async function POST(request: Request) {
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

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON body.", production_safe: false },
      { status: 400 }
    );
  }

  if (body.action === "switch_off_to_creator_oauth") {
    const result = buildSwitchOffResult(site.site_id);
    return NextResponse.json({
      ok: true,
      action: "switch_off_to_creator_oauth",
      preference: result.preference,
      envInstruction: result.envInstruction,
      patronsPreserved: true,
      rebuildRequired: false,
      production_safe: false
    });
  }

  if (body.action === "save") {
    if (!isValidOAuthChoiceOption(body.preferred_mode)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "preferred_mode must be an explicit creator_oauth or relay_managed selection.",
          production_safe: false
        },
        { status: 400 }
      );
    }
    const preferred = body.preferred_mode as OAuthChoiceOptionId;
    const preference = savePatreonModePreference(site.site_id, preferred);
    return NextResponse.json({
      ok: true,
      action: "save",
      preference,
      envInstruction: `Set ESCAPE_HATCH_PATREON_MODE=${preferred} on the host. Preference file is not runtime authority.`,
      production_safe: false
    });
  }

  return NextResponse.json(
    {
      ok: false,
      error: "Unknown action. Use save or switch_off_to_creator_oauth.",
      production_safe: false
    },
    { status: 400 }
  );
}

/** Mutations only — GET must not change preference. */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Method not allowed. Use POST.",
      production_safe: false
    },
    { status: 405 }
  );
}
