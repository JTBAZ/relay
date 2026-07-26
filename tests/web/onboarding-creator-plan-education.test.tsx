/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorBillingSubscription = vi.fn();
const createCreatorBillingCheckout = vi.fn();

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
    createCreatorBillingCheckout: (...args: unknown[]) => createCreatorBillingCheckout(...args),
    createFanBillingCheckout: vi.fn(),
    fetchTipsWallet: vi.fn(),
    RelayApiError: StubRelayApiError
  };
});

import { StepCreatorPlanChoice } from "../../web/app/components/onboarding/onboarding-plan-step";
import { RelayApiError } from "@/lib/relay-api";

describe("onboarding creator plan education (MB-15C)", () => {
  beforeEach(() => {
    fetchCreatorBillingSubscription.mockReset();
    createCreatorBillingCheckout.mockReset();
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Free + catalog plans and advances on Free click", async () => {
    const onAdvance = vi.fn();
    render(<StepCreatorPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-creator-plan-step")).toBeTruthy();
    });
    expect(screen.getByTestId("onboarding-plan-free")).toBeTruthy();
    expect(screen.getByTestId("onboarding-plan-studio_core")).toBeTruthy();
    expect(screen.getByTestId("onboarding-plan-autopost")).toBeTruthy();
    expect(screen.getByTestId("onboarding-plan-growth_engine").textContent).toMatch(
      /Coming later/i
    );
    fireEvent.click(screen.getByTestId("onboarding-plan-free"));
    expect(onAdvance).toHaveBeenCalled();
    expect(createCreatorBillingCheckout).not.toHaveBeenCalled();
  });

  it("checks out paid plan on card click", async () => {
    createCreatorBillingCheckout.mockResolvedValue({
      checkout_url: "https://checkout.stripe.test/creator"
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const onAdvance = vi.fn();
    render(<StepCreatorPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-plan-autopost")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-plan-autopost"));
    await waitFor(() => {
      expect(createCreatorBillingCheckout).toHaveBeenCalledWith("autopost");
    });
    expect(onAdvance).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith("https://checkout.stripe.test/creator");
    vi.unstubAllGlobals();
  });

  it("still allows free continue when billing is unavailable", async () => {
    fetchCreatorBillingSubscription.mockRejectedValue(
      new RelayApiError("Billing is not enabled.", 404, "NOT_FOUND")
    );
    const onAdvance = vi.fn();
    render(<StepCreatorPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-plan-billing-unavailable")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-plan-free"));
    expect(onAdvance).toHaveBeenCalled();
    expect(createCreatorBillingCheckout).not.toHaveBeenCalled();
  });
});
