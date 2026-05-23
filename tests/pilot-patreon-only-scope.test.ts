import { afterEach, describe, expect, it } from "vitest";
import { isPilotPatreonOnlyScope as isApiPilotPatreonOnlyScope } from "../src/pilot/pilot-patreon-only-scope.js";
import { isPilotPatreonOnlyScope as isWebPilotPatreonOnlyScope } from "../web/lib/pilot-patreon-only.js";
import { isSubscribeStarCreatorConnectUiEnabled } from "../web/lib/subscribestar-connect-ui.js";

describe("PILOT-001 pilot Patreon-only scope", () => {
  const prevApi = process.env.RELAY_PILOT_PATREON_ONLY;
  const prevWeb = process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY;
  const prevSsConnect = process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT;

  afterEach(() => {
    if (prevApi === undefined) delete process.env.RELAY_PILOT_PATREON_ONLY;
    else process.env.RELAY_PILOT_PATREON_ONLY = prevApi;
    if (prevWeb === undefined) delete process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY;
    else process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY = prevWeb;
    if (prevSsConnect === undefined) delete process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT;
    else process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT = prevSsConnect;
  });

  it("API scope is off by default", () => {
    delete process.env.RELAY_PILOT_PATREON_ONLY;
    expect(isApiPilotPatreonOnlyScope()).toBe(false);
  });

  it("API scope is on when RELAY_PILOT_PATREON_ONLY=1", () => {
    process.env.RELAY_PILOT_PATREON_ONLY = "1";
    expect(isApiPilotPatreonOnlyScope()).toBe(true);
  });

  it("web scope is on when NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY=1", () => {
    process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY = "1";
    expect(isWebPilotPatreonOnlyScope()).toBe(true);
  });

  it("pilot scope suppresses SubscribeStar connect UI even when connect flag is set", () => {
    process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY = "1";
    process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT = "1";
    expect(isSubscribeStarCreatorConnectUiEnabled()).toBe(false);
  });

  it("SubscribeStar connect UI requires explicit connect flag when pilot scope is off", () => {
    delete process.env.NEXT_PUBLIC_RELAY_PILOT_PATREON_ONLY;
    delete process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT;
    expect(isSubscribeStarCreatorConnectUiEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_SUBSCRIBESTAR_CREATOR_CONNECT = "1";
    expect(isSubscribeStarCreatorConnectUiEnabled()).toBe(true);
  });
});
