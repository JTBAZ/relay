/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PromoPerformancePanel from "../../web/app/studio/promos/PromoPerformancePanel";
import type { PromotionHubSummary } from "../../web/lib/relay-api";

const SUMMARY: PromotionHubSummary = {
  creator_id: "cr_test",
  pieces: [],
  rules: [
    {
      default_id: "rule_1",
      gate_relay_tier_id: "t1",
      inherited_piece_count: 2,
      matching_promo_piece_ids: ["pp_a", "pp_b"]
    }
  ],
  unmatched: {
    missing_post_count: 0,
    public_or_ungated_count: 1,
    no_matching_default_count: 0
  },
  code_usage: []
};

describe("<PromoPerformancePanel />", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows cumulative overview without fabricating attribution metrics", () => {
    render(
      <PromoPerformancePanel
        summary={SUMMARY}
        pieceCount={3}
        activeCodeCount={2}
      />
    );
    expect(screen.getByText("Cumulative pool summary")).toBeTruthy();
    expect(screen.getByText("Promo views")).toBeTruthy();
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText(/1 pool piece/)).toBeTruthy();
    expect(document.querySelector("[data-promos-performance]")).toBeTruthy();
  });
});
