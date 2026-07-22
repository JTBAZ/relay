import { NextResponse } from "next/server";
import {
  assertLocalLibraryTruthMutation,
  excludeAnomalyInKit,
  markLibraryTruthCompleteInKit
} from "@/lib/library-truth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  action?: string;
  anomaly_id?: string;
  reason?: string;
};

/**
 * Library-truth mutations are local-prototype operator only (header + loopback
 * or ESCAPE_HATCH_LIBRARY_TRUTH_ALLOW=1). This is not authentication.
 */
export async function POST(request: Request) {
  const access = assertLocalLibraryTruthMutation(request);
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.error, production_safe: false },
      { status: access.status }
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Expected JSON body." },
      { status: 400 }
    );
  }

  const action = body.action;
  if (action === "exclude") {
    const anomalyId = body.anomaly_id?.trim();
    if (!anomalyId) {
      return NextResponse.json(
        { ok: false, error: "anomaly_id is required." },
        { status: 400 }
      );
    }
    const result = excludeAnomalyInKit(
      anomalyId,
      body.reason ?? "Creator excluded from this build."
    );
    if (result.status !== "ready") {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: 400 }
      );
    }
    return NextResponse.json({
      ok: true,
      state: result.state,
      gate: result.gate,
      report: result.report,
      production_safe: false
    });
  }

  if (action === "complete") {
    const result = markLibraryTruthCompleteInKit();
    if (result.status !== "ready") {
      return NextResponse.json(
        { ok: false, error: result.message },
        { status: 400 }
      );
    }
    if (!result.gate.can_continue || !result.state.library_truth_complete) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Cannot mark complete while blocking issues remain unresolved.",
          gate: result.gate,
          state: result.state,
          report: result.report,
          production_safe: false
        },
        { status: 409 }
      );
    }
    return NextResponse.json({
      ok: true,
      state: result.state,
      gate: result.gate,
      report: result.report,
      production_safe: false
    });
  }

  return NextResponse.json(
    { ok: false, error: "Unknown action. Use exclude or complete." },
    { status: 400 }
  );
}
