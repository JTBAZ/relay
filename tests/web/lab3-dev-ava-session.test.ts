/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it } from "vitest";
import { PILOT_UX_BEARER_SESSION_KEY } from "@/lib/pilot-ux-session";
import { hasRelayClientSession, hasRelaySignedInCookie } from "@/lib/relay-api";
import {
  clearPostLoginReturn,
  rememberPostLoginReturn,
  resolveDevLoginDestination
} from "@/lib/post-login-return";

afterEach(() => {
  document.cookie = "relay_signed_in=; Path=/; Max-Age=0";
  window.sessionStorage.clear();
});

describe("hasRelayClientSession", () => {
  it("is false with neither cookie nor Bearer", () => {
    expect(hasRelaySignedInCookie()).toBe(false);
    expect(hasRelayClientSession()).toBe(false);
  });

  it("treats a pilot UX Bearer as a studio session", () => {
    window.sessionStorage.setItem(PILOT_UX_BEARER_SESSION_KEY, "tok_dev_ava");
    expect(hasRelayClientSession()).toBe(true);
  });
});

describe("resolveDevLoginDestination", () => {
  it("sends creators back to Lab 3 from returnTo", () => {
    expect(
      resolveDevLoginDestination({
        kind: "creator",
        defaultDestination: "/studio",
        returnToFromQuery: "/studio/lab3"
      })
    ).toBe("/studio/lab3");
  });

  it("uses a remembered bounce when query is empty", () => {
    rememberPostLoginReturn("/studio/lab3");
    expect(
      resolveDevLoginDestination({
        kind: "creator",
        defaultDestination: "/studio",
        returnToFromQuery: null
      })
    ).toBe("/studio/lab3");
  });

  it("does not send patrons to a Studio returnTo", () => {
    expect(
      resolveDevLoginDestination({
        kind: "patron",
        defaultDestination: "/feed",
        returnToFromQuery: "/studio/lab3"
      })
    ).toBe("/feed");
  });

  it("clears the remembered bounce", () => {
    rememberPostLoginReturn("/studio/lab3");
    clearPostLoginReturn();
    expect(
      resolveDevLoginDestination({
        kind: "creator",
        defaultDestination: "/studio",
        returnToFromQuery: null
      })
    ).toBe("/studio");
  });
});
