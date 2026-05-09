import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { close, isInitialized, type ErrorEvent } from "@sentry/node";
import {
  applyRelaySentryPiiScrub,
  captureRelaySentryException,
  initRelaySentry,
  isRelaySentryEnabled
} from "../src/lib/relay-sentry.js";
import { TEST_RAW_TOKEN_LEAK_MARK } from "../src/lib/pii-scrub.js";

describe("relay-sentry", () => {
  beforeEach(async () => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_SAMPLE_RATE;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    delete process.env.SENTRY_ENVIRONMENT;
    if (isInitialized()) {
      await close(0);
    }
  });

  afterEach(async () => {
    delete process.env.SENTRY_DSN;
    delete process.env.SENTRY_SAMPLE_RATE;
    delete process.env.SENTRY_TRACES_SAMPLE_RATE;
    delete process.env.SENTRY_ENVIRONMENT;
    if (isInitialized()) {
      await close(0);
    }
  });

  it("does not initialize Sentry when SENTRY_DSN is unset", () => {
    delete process.env.SENTRY_DSN;
    initRelaySentry();
    expect(isRelaySentryEnabled()).toBe(false);
    captureRelaySentryException(new Error("no sdk"));
    expect(isRelaySentryEnabled()).toBe(false);
  });

  it("initializes Sentry when SENTRY_DSN is set", () => {
    process.env.SENTRY_DSN = "https://examplePublicKey@o000000.ingest.sentry.io/1";
    initRelaySentry();
    expect(isRelaySentryEnabled()).toBe(true);
  });

  it("P2-obs-008: applyRelaySentryPiiScrub redacts tokens, email, and IP headers in event payload", () => {
    const event = {
      message: `noise Bearer ${TEST_RAW_TOKEN_LEAK_MARK}`,
      user: { id: "u1", email: "patron@example.com", ip_address: "198.51.100.1" },
      request: {
        headers: {
          Authorization: `Bearer ${TEST_RAW_TOKEN_LEAK_MARK}`,
          "X-Forwarded-For": "198.51.100.2"
        }
      },
      extra: {
        access_token: TEST_RAW_TOKEN_LEAK_MARK,
        ok: "visible"
      }
    } as unknown as ErrorEvent;

    applyRelaySentryPiiScrub(event);

    expect(JSON.stringify(event)).not.toContain(TEST_RAW_TOKEN_LEAK_MARK);
    expect(event.message).toContain("Bearer [Redacted]");
    expect(event.user?.email).toBe("[Redacted]");
    expect(event.user?.ip_address).toBe("[Redacted]");
    expect(event.request?.headers?.Authorization).toBe("[Redacted]");
    expect(event.request?.headers?.["X-Forwarded-For"]).toBe("[Redacted]");
    expect(event.extra).toMatchObject({
      access_token: "[Redacted]",
      ok: "visible"
    });
  });
});
