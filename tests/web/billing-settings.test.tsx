/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorBillingSubscription = vi.fn();
const fetchCreatorPlanAccess = vi.fn();
const createCreatorBillingCheckout = vi.fn();
const createCreatorBillingPortal = vi.fn();
let mockSearch = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mockSearch)
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
    fetchCreatorBillingSubscription: (...args: unknown[]) =>
      fetchCreatorBillingSubscription(...args),
    fetchCreatorPlanAccess: (...args: unknown[]) => fetchCreatorPlanAccess(...args),
    createCreatorBillingCheckout: (...args: unknown[]) => createCreatorBillingCheckout(...args),
    createCreatorBillingPortal: (...args: unknown[]) => createCreatorBillingPortal(...args),
    RelayApiError: StubRelayApiError
  };
});

import BillingSettingsClient from "../../web/app/studio/settings/billing/BillingSettingsClient";
import { RelayApiError } from "@/lib/relay-api";

describe("BillingSettingsClient", () => {
  beforeEach(() => {
    mockSearch = "";
    fetchCreatorBillingSubscription.mockReset();
    fetchCreatorPlanAccess.mockReset();
    createCreatorBillingCheckout.mockReset();
    createCreatorBillingPortal.mockReset();
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
  });

  afterEach(() => {
    cleanup();
  });

  it("shows freemium pitch when plan is null", async () => {
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-no-plan")).toBeTruthy();
    });
    expect(screen.getByText(/Free: sync, backup/i)).toBeTruthy();
    expect(screen.getByTestId("billing-upgrade-studio_core")).toBeTruthy();
  });

  it("shows active plan and manage button", async () => {
    fetchCreatorBillingSubscription.mockResolvedValue({
      scope: "creator",
      plan: "autopost",
      status: "active",
      current_period_end: "2026-08-01T00:00:00.000Z",
      cancel_at_period_end: false
    });
    fetchCreatorPlanAccess.mockResolvedValue({
      effective_plan: "autopost",
      entitlement_source: "stripe",
      entitlement_expires_at: null,
      billing: {
        plan: "autopost",
        status: "active",
        current_period_end: "2026-08-01T00:00:00.000Z",
        cancel_at_period_end: false
      },
      capabilities: {
        studio_core: { allowed: true, required_plan: "studio_core", reason: "included" },
        autopost: { allowed: true, required_plan: "autopost", reason: "included" },
        posting_assistant: { allowed: true, required_plan: "autopost", reason: "included" },
        growth_engine: {
          allowed: false,
          required_plan: "growth_engine",
          reason: "feature_not_shipped"
        }
      }
    });
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-current-plan")).toBeTruthy();
    });
    expect(screen.getByTestId("billing-current-plan").textContent).toMatch(/Better/);
    expect(screen.getByTestId("billing-manage-subscription")).toBeTruthy();
    expect(screen.getByTestId("billing-plan-autopost").textContent).toMatch(/Current/);
  });

  it("shows operator grant without Manage subscription when no Stripe plan", async () => {
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
    fetchCreatorPlanAccess.mockResolvedValue({
      effective_plan: "autopost",
      entitlement_source: "operator_grant",
      entitlement_expires_at: "2026-12-01T00:00:00.000Z",
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
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-grant-source")).toBeTruthy();
    });
    expect(screen.getByTestId("billing-grant-source").textContent).toMatch(/operator grant/i);
    expect(screen.queryByTestId("billing-manage-subscription")).toBeNull();
    expect(screen.queryByTestId("billing-no-plan")).toBeNull();
  });

  it("highlights recommended plan from feature query", async () => {
    mockSearch = "feature=posting_assistant";
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-feature-context")).toBeTruthy();
    });
    expect(screen.getByTestId("billing-feature-context").textContent).toMatch(/Relay Coach/i);
    expect(screen.getByTestId("billing-plan-autopost").getAttribute("data-highlighted")).toBe(
      "true"
    );
  });

  it("shows past_due dunning banner", async () => {
    fetchCreatorBillingSubscription.mockResolvedValue({
      scope: "creator",
      plan: "studio_core",
      status: "past_due",
      current_period_end: "2026-08-01T00:00:00.000Z",
      cancel_at_period_end: false
    });
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-dunning-banner")).toBeTruthy();
    });
    expect(screen.getByText(/Payment failed/i)).toBeTruthy();
  });

  it("upgrade click calls checkout with the right plan", async () => {
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
    createCreatorBillingCheckout.mockResolvedValue({
      checkout_url: "https://checkout.stripe.test/session"
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-upgrade-autopost")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("billing-upgrade-autopost"));
    await waitFor(() => {
      expect(createCreatorBillingCheckout).toHaveBeenCalledWith("autopost");
    });
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/session");
    vi.unstubAllGlobals();
  });

  it("handles billing disabled (404)", async () => {
    fetchCreatorBillingSubscription.mockRejectedValue(
      new RelayApiError("Billing is not enabled.", 404, "NOT_FOUND")
    );
    render(<BillingSettingsClient />);
    await waitFor(() => {
      expect(screen.getByTestId("billing-unavailable")).toBeTruthy();
    });
  });
});
