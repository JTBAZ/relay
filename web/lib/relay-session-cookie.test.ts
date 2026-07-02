import { describe, expect, it } from "vitest";
import {
  relayPatronAssetAuthHeader,
  relaySessionFromCookieHeader,
} from "./relay-session-cookie";

describe("relaySessionFromCookieHeader", () => {
  it("extracts relay_session from a cookie header", () => {
    expect(
      relaySessionFromCookieHeader(
        "relay_signed_in=1; relay_session=sess_abc-123; relay_active_role=supporter"
      )
    ).toBe("sess_abc-123");
  });

  it("returns null when cookie is missing", () => {
    expect(relaySessionFromCookieHeader("relay_signed_in=1")).toBeNull();
  });
});

describe("relayPatronAssetAuthHeader", () => {
  it("prefers an existing Authorization header", () => {
    expect(
      relayPatronAssetAuthHeader({
        authorizationHeader: "Bearer from-client",
        cookieHeader: "relay_session=sess_x",
      })
    ).toBe("Bearer from-client");
  });

  it("promotes relay_session cookie to Bearer when Authorization is absent", () => {
    expect(
      relayPatronAssetAuthHeader({
        cookieHeader: "relay_session=sess_x",
      })
    ).toBe("Bearer sess_x");
  });
});
