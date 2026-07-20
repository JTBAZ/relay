/** @vitest-environment happy-dom */

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioPlanGate } from "../../web/app/components/studio/StudioPlanGate";
import type { CreatorCapabilityWire } from "@/lib/relay-api";

describe("StudioPlanGate (MB-15A)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders children when capability is allowed", () => {
    const capability: CreatorCapabilityWire = {
      allowed: true,
      required_plan: "autopost",
      reason: "included"
    };
    render(
      <StudioPlanGate
        capability={capability}
        feature="autopost"
        featureName="Autopost"
        featureBenefit="Pipeline"
      >
        <button type="button">Compose</button>
      </StudioPlanGate>
    );
    expect(screen.getByRole("button", { name: "Compose" })).toBeTruthy();
    expect(screen.queryByTestId("studio-plan-gate-wall")).toBeNull();
  });

  it("shows lock wall + billing deep-link when plan required", () => {
    const capability: CreatorCapabilityWire = {
      allowed: false,
      required_plan: "autopost",
      reason: "plan_required"
    };
    render(
      <StudioPlanGate
        capability={capability}
        feature="autopost"
        featureName="Autopost"
        featureBenefit="Compose cross-post drafts."
        testId="autopost-plan-gate"
      />
    );
    expect(screen.getByTestId("autopost-plan-gate-wall")).toBeTruthy();
    expect(screen.getByTestId("autopost-plan-gate-reason").textContent).toMatch(/requires/i);
    const cta = screen.getByTestId("autopost-plan-gate-cta") as HTMLAnchorElement;
    expect(cta.getAttribute("href")).toBe("/studio/settings/billing?feature=autopost");
  });

  it("shows coming later without checkout for unshipped features", () => {
    const capability: CreatorCapabilityWire = {
      allowed: false,
      required_plan: "growth_engine",
      reason: "feature_not_shipped"
    };
    render(
      <StudioPlanGate
        capability={capability}
        feature="growth_engine"
        featureName="Growth Engine tools"
        featureBenefit="Advanced targeting as they ship."
      />
    );
    expect(screen.getByTestId("studio-plan-gate-coming-later")).toBeTruthy();
    expect(screen.queryByTestId("studio-plan-gate-cta")).toBeNull();
  });

  it("exposes disabled reason for past_due with portal-oriented CTA", async () => {
    const capability: CreatorCapabilityWire = {
      allowed: false,
      required_plan: "autopost",
      reason: "billing_past_due"
    };
    render(
      <StudioPlanGate
        capability={capability}
        feature="posting_assistant"
        featureName="Relay Coach"
        featureBenefit="Timing and copy."
        testId="coach-gate"
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId("coach-gate-reason").textContent).toMatch(/Payment needs attention/i);
    });
    expect(screen.getByTestId("coach-gate-cta").textContent).toMatch(/Update payment/i);
  });
});
