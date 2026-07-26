/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    fetchTipsWallet: (...args: unknown[]) => fetchTipsWallet(...args),
    RelayApiError: StubRelayApiError
  };
});

import { TipWalletChip } from "../../web/components/patron/TipWalletChip";
import { RelayApiError } from "@/lib/relay-api";

describe("TipWalletChip", () => {
  beforeEach(() => {
    fetchTipsWallet.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders balance when beta wallet is available", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 2,
      purchased_balance: 1,
      next_grant_period: "2026-08",
      beta: true
    });
    render(<TipWalletChip />);
    await waitFor(() => {
      expect(screen.getByTestId("tip-wallet-chip")).toBeTruthy();
    });
    expect(screen.getByTestId("tip-wallet-balance").textContent).toBe("3");
    expect(screen.getByTestId("tip-wallet-chip").getAttribute("title")).toMatch(/2026-08/);
    expect(screen.getByTestId("tip-wallet-chip").getAttribute("href")).toBe("/plans");
  });

  it("hides when Tips beta is off (404)", async () => {
    fetchTipsWallet.mockRejectedValue(new RelayApiError("not found", 404));
    const { container } = render(<TipWalletChip />);
    await waitFor(() => {
      expect(fetchTipsWallet).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-testid='tip-wallet-chip']")).toBeNull();
  });

  it("hides when unauthenticated (401)", async () => {
    fetchTipsWallet.mockRejectedValue(new RelayApiError("auth", 401));
    const { container } = render(<TipWalletChip />);
    await waitFor(() => {
      expect(fetchTipsWallet).toHaveBeenCalled();
    });
    expect(container.querySelector("[data-testid='tip-wallet-chip']")).toBeNull();
  });
});
