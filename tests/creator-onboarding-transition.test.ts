import { describe, expect, it } from "vitest";
import {
  assertCreatorOnboardingTransition,
  OnboardingTransitionError
} from "../src/creator/onboarding-service.js";

describe("assertCreatorOnboardingTransition", () => {
  it("allows same step", () => {
    expect(() => assertCreatorOnboardingTransition("connected", "connected")).not.toThrow();
  });

  it("allows single forward step", () => {
    expect(() =>
      assertCreatorOnboardingTransition("connected", "import_started")
    ).not.toThrow();
    expect(() =>
      assertCreatorOnboardingTransition("import_started", "organized")
    ).not.toThrow();
    expect(() => assertCreatorOnboardingTransition("organized", "published")).not.toThrow();
  });

  it("rejects skip-ahead with skip_ahead reason", () => {
    expect(() => assertCreatorOnboardingTransition("connected", "organized")).toThrow(
      OnboardingTransitionError
    );
    try {
      assertCreatorOnboardingTransition("connected", "published");
    } catch (e) {
      expect(e).toBeInstanceOf(OnboardingTransitionError);
      expect((e as OnboardingTransitionError).reason).toBe("skip_ahead");
    }
  });

  it("rejects backward transitions", () => {
    expect(() =>
      assertCreatorOnboardingTransition("import_started", "connected")
    ).toThrow(OnboardingTransitionError);
    try {
      assertCreatorOnboardingTransition("published", "organized");
    } catch (e) {
      expect(e).toBeInstanceOf(OnboardingTransitionError);
      expect((e as OnboardingTransitionError).reason).toBe("step_back");
    }
  });
});
