/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorPlanAccess = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() })
}));

vi.mock("@/app/components/studio/StudioRouteGuard", () => ({
  StudioRouteGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));

vi.mock("@/app/components/autopost-v0/RelayAutopostComposer", () => ({
  RelayAutopostComposer: () => <div data-testid="autopost-composer">composer</div>
}));

vi.mock("@/app/components/automations/AutomationApprovalOverlay", () => ({
  AutomationApprovalOverlay: () => null
}));

vi.mock("@/lib/relay-api", async () => {
  class StubRelayApiError extends Error {
    public override readonly name = "RelayApiError";
    public constructor(
      message: string,
      public readonly status: number,
      public readonly code?: string
    ) {
      super(message);
    }
  }
  return {
    fetchCreatorPlanAccess: (...args: unknown[]) => fetchCreatorPlanAccess(...args),
    RelayApiError: StubRelayApiError,
    isPlanRequiredApiError: (err: unknown) =>
      err instanceof StubRelayApiError && err.status === 402
  };
});

import { AutopostPageClient } from "../../web/app/studio/autopost/autopost-page-client";

describe("Autopost plan gate UI (MB-15A)", () => {
  beforeEach(() => {
    fetchCreatorPlanAccess.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Autopost wall with billing CTA when plan_required", async () => {
    fetchCreatorPlanAccess.mockResolvedValue({
      effective_plan: null,
      entitlement_source: null,
      entitlement_expires_at: null,
      billing: {
        plan: null,
        status: null,
        current_period_end: null,
        cancel_at_period_end: false
      },
      capabilities: {
        studio_core: { allowed: false, required_plan: "studio_core", reason: "plan_required" },
        autopost: { allowed: false, required_plan: "autopost", reason: "plan_required" },
        posting_assistant: {
          allowed: false,
          required_plan: "autopost",
          reason: "plan_required"
        },
        growth_engine: {
          allowed: false,
          required_plan: "growth_engine",
          reason: "feature_not_shipped"
        }
      }
    });

    render(<AutopostPageClient />);
    await waitFor(() => {
      expect(screen.getByTestId("autopost-plan-gate-wall")).toBeTruthy();
    });
    const cta = screen.getByTestId("autopost-plan-gate-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/studio/settings/billing?feature=autopost");
    expect(screen.queryByTestId("autopost-composer")).toBeNull();
  });

  it("renders composer when autopost capability is allowed", async () => {
    fetchCreatorPlanAccess.mockResolvedValue({
      effective_plan: "autopost",
      entitlement_source: "operator_grant",
      entitlement_expires_at: null,
      billing: {
        plan: null,
        status: null,
        current_period_end: null,
        cancel_at_period_end: false
      },
      capabilities: {
        studio_core: { allowed: true, required_plan: "studio_core", reason: "operator_grant" },
        autopost: { allowed: true, required_plan: "autopost", reason: "operator_grant" },
        posting_assistant: {
          allowed: true,
          required_plan: "autopost",
          reason: "operator_grant"
        },
        growth_engine: {
          allowed: false,
          required_plan: "growth_engine",
          reason: "feature_not_shipped"
        }
      }
    });

    render(<AutopostPageClient />);
    await waitFor(() => {
      expect(screen.getByTestId("autopost-composer")).toBeTruthy();
    });
    expect(screen.queryByTestId("autopost-plan-gate-wall")).toBeNull();
  });
});
