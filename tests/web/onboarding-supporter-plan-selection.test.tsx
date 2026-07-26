/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchTipsWallet = vi.fn();
const createFanBillingCheckout = vi.fn();

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
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    createFanBillingCheckout: (...args: unknown[]) => createFanBillingCheckout(...args),
    fetchCreatorBillingSubscription: vi.fn(),
    createCreatorBillingCheckout: vi.fn(),
    RelayApiError: StubRelayApiError
  };
});

import { StepSupporterPlanChoice } from "../../web/app/components/onboarding/onboarding-plan-step";
import { RelayApiError } from "@/lib/relay-api";

describe("onboarding supporter plan selection (MB-15C)", () => {
  beforeEach(() => {
    fetchTipsWallet.mockReset();
    createFanBillingCheckout.mockReset();
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 0,
      purchased_balance: 0,
      next_grant_period: "2026-08",
      beta: true,
      plan: "free"
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Free / Supporter / Curator from catalog", async () => {
    render(<StepSupporterPlanChoice onAdvance={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-supporter-plan-step")).toBeTruthy();
    });
    expect(screen.getByTestId("onboarding-fan-plan-free")).toBeTruthy();
    expect(screen.getByTestId("onboarding-fan-plan-supporter")).toBeTruthy();
    expect(screen.getByTestId("onboarding-fan-plan-curator")).toBeTruthy();
    expect(screen.getByTestId("onboarding-supporter-plan-step").textContent).toMatch(
      /Your gallery is always free/i
    );
  });

  it("checks out Curator on card click", async () => {
    createFanBillingCheckout.mockResolvedValue({
      checkout_url: "https://checkout.stripe.test/fan"
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const onAdvance = vi.fn();
    render(<StepSupporterPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-fan-plan-curator")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-fan-plan-curator"));
    await waitFor(() => {
      expect(createFanBillingCheckout).toHaveBeenCalledWith("curator");
    });
    expect(onAdvance).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/fan");
    vi.unstubAllGlobals();
  });

  it("allows free continue when tip plans are unavailable", async () => {
    fetchTipsWallet.mockRejectedValue(new RelayApiError("not found", 404, "NOT_FOUND"));
    const onAdvance = vi.fn();
    render(<StepSupporterPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-fan-plan-unavailable")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-fan-plan-free"));
    expect(onAdvance).toHaveBeenCalled();
    expect(createFanBillingCheckout).not.toHaveBeenCalled();
  });
});
