import { describe, expect, it, vi, afterEach } from "vitest";
import {
  evaluatePlatformOperatorAccess,
  platformOperatorAccessPolicyFromEnv
} from "../src/platform-metrics/platform-operator-access.js";

describe("platform operator access (PMD-070)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows all requests when enforcement is disabled in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const policy = platformOperatorAccessPolicyFromEnv(process.env);
    const result = await evaluatePlatformOperatorAccess({
      prisma: undefined,
      policy,
      accountId: null
    });
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("enforce_disabled");
  });

  it("defaults enforcement on in production when env unset", () => {
    vi.stubEnv("NODE_ENV", "production");
    const policy = platformOperatorAccessPolicyFromEnv(process.env);
    expect(policy.enforce).toBe(true);
  });

  it("requires authentication when enforcement is enabled", async () => {
    const policy = platformOperatorAccessPolicyFromEnv({
      RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE: "1"
    });
    const result = await evaluatePlatformOperatorAccess({
      prisma: undefined,
      policy,
      accountId: null
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("authentication_required");
  });

  it("allows allowlisted account ids and emails", async () => {
    const policy = platformOperatorAccessPolicyFromEnv({
      RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE: "1",
      RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS: "acc_operator",
      RELAY_PLATFORM_OPERATOR_EMAILS: "ops@relay.test"
    });

    const byAccount = await evaluatePlatformOperatorAccess({
      prisma: undefined,
      policy,
      accountId: "acc_operator"
    });
    expect(byAccount.allowed).toBe(true);
    expect(byAccount.reason).toBe("account_allowlist");

    const byEmail = await evaluatePlatformOperatorAccess({
      prisma: undefined,
      policy,
      accountId: "acc_other",
      emailNorm: "ops@relay.test"
    });
    expect(byEmail.allowed).toBe(true);
    expect(byEmail.reason).toBe("email_allowlist");
  });

  it("rejects non-operator accounts", async () => {
    const policy = platformOperatorAccessPolicyFromEnv({
      RELAY_PLATFORM_OPERATOR_ACCESS_ENFORCE: "1",
      RELAY_PLATFORM_OPERATOR_ACCOUNT_IDS: "acc_operator"
    });
    const result = await evaluatePlatformOperatorAccess({
      prisma: undefined,
      policy,
      accountId: "acc_random",
      emailNorm: "fan@relay.test"
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("not_platform_operator");
  });
});
