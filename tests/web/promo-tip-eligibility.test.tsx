/** @vitest-environment happy-dom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PromoPieceCard from "../../web/app/studio/promos/PromoPieceCard";
import type { CreatorPromoSlotRow } from "@/lib/relay-api";

vi.mock("@/lib/relay-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/relay-api")>();
  return {
    ...actual,
    RELAY_API_BASE: "http://relay.test"
  };
});

function baseSlot(
  overrides: Partial<CreatorPromoSlotRow> = {}
): CreatorPromoSlotRow {
  return {
    promo_piece_id: "pp1",
    slot_rank: 1,
    target_kind: "post",
    target_id: "post1",
    post_id: "post1",
    title: "Promo piece",
    tip_eligible: true,
    tip_eligibility: { eligible: true, reasons: [] },
    ...overrides
  };
}

describe("PromoPieceCard tip eligibility (MB-7)", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows Tips OK when eligible", () => {
    render(
      <PromoPieceCard
        slot={baseSlot()}
        creatorId="cr1"
        onRemove={() => {}}
        onTipEligibleChange={() => {}}
        hero
      />
    );
    expect(screen.getByTestId("promo-tip-eligibility-badge").textContent).toMatch(/Tips OK/);
  });

  it("shows mature reason copy", () => {
    render(
      <PromoPieceCard
        slot={baseSlot({
          tip_eligible: true,
          tip_eligibility: { eligible: false, reasons: ["mature"] }
        })}
        creatorId="cr1"
        onRemove={() => {}}
        onTipEligibleChange={() => {}}
        hero
      />
    );
    expect(screen.getByTestId("promo-tip-eligibility-reason").textContent).toMatch(
      /Rated 18\+/
    );
    expect(
      (screen.getByTestId("promo-tip-eligible-toggle") as HTMLInputElement).disabled
    ).toBe(true);
  });

  it("shows disabled reason when Tips toggled off", () => {
    render(
      <PromoPieceCard
        slot={baseSlot({
          tip_eligible: false,
          tip_eligibility: { eligible: false, reasons: ["disabled"] }
        })}
        creatorId="cr1"
        onRemove={() => {}}
        onTipEligibleChange={() => {}}
        hero
      />
    );
    expect(screen.getByTestId("promo-tip-eligibility-reason").textContent).toMatch(
      /turned Tips off/i
    );
  });

  it("shows storefront reason copy", () => {
    render(
      <PromoPieceCard
        slot={baseSlot({
          tip_eligibility: { eligible: false, reasons: ["storefront"] }
        })}
        creatorId="cr1"
        onRemove={() => {}}
        hero
      />
    );
    expect(screen.getByTestId("promo-tip-eligibility-reason").textContent).toMatch(
      /storefront/i
    );
  });

  it("invokes onTipEligibleChange when toggled", () => {
    const onTip = vi.fn();
    render(
      <PromoPieceCard
        slot={baseSlot()}
        creatorId="cr1"
        onRemove={() => {}}
        onTipEligibleChange={onTip}
        hero
      />
    );
    fireEvent.click(screen.getByTestId("promo-tip-eligible-toggle"));
    expect(onTip).toHaveBeenCalledWith(false);
  });
});
