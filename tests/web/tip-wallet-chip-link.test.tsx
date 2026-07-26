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

describe("TipWalletChip link (MB-15B)", () => {
  beforeEach(() => {
    fetchTipsWallet.mockReset();
  });
  afterEach(() => {
    cleanup();
  });

  it("links the wallet chip to /plans", async () => {
    fetchTipsWallet.mockResolvedValue({
      granted_balance: 2,
      purchased_balance: 1,
      next_grant_period: "2026-08",
      beta: true,
      plan: "free"
    });
    render(<TipWalletChip />);
    await waitFor(() => {
      expect(screen.getByTestId("tip-wallet-chip")).toBeTruthy();
    });
    const chip = screen.getByTestId("tip-wallet-chip") as HTMLAnchorElement;
    expect(chip.getAttribute("href")).toBe("/plans");
    expect(chip.getAttribute("aria-label")).toMatch(/Open plans/i);
  });
});
