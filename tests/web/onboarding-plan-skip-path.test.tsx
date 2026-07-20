/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchCreatorBillingSubscription = vi.fn();
const fetchTipsWallet = vi.fn();

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
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    createCreatorBillingCheckout: vi.fn(),
    createFanBillingCheckout: vi.fn(),
    RelayApiError: StubRelayApiError
  };
});

import {
  StepCreatorPlanChoice,
  StepSupporterPlanChoice
} from "../../web/app/components/onboarding/onboarding-plan-step";

describe("onboarding plan skip path (MB-15C)", () => {
  beforeEach(() => {
    fetchCreatorBillingSubscription.mockResolvedValue({ plan: null });
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

  it("creator advances on Free card click", async () => {
    const onAdvance = vi.fn();
    render(<StepCreatorPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-plan-free")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-plan-free"));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it("supporter advances on Free card click", async () => {
    const onAdvance = vi.fn();
    render(<StepSupporterPlanChoice onAdvance={onAdvance} />);
    await waitFor(() => {
      expect(screen.getByTestId("onboarding-fan-plan-free")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("onboarding-fan-plan-free"));
    expect(onAdvance).toHaveBeenCalledTimes(1);
  });
});
