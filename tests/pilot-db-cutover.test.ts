import { afterEach, describe, expect, it } from "vitest";
import {
  assertPilotUxRequiredDbStores,
  getPilotDbStoreStatus,
  PILOT_UX_REQUIRED_STORE_ENVS,
  PILOT_DB_STORE_MATRIX
} from "../src/pilot/pilot-db-cutover.js";

describe("PILOT-002 pilot Postgres cutover", () => {
  const touched = new Set<string>();

  afterEach(() => {
    for (const name of touched) {
      const prev = process.env[name];
      if (prev === undefined) delete process.env[name];
      else process.env[name] = prev;
    }
    touched.clear();
  });

  function setEnv(name: string, value: string | undefined) {
    if (!touched.has(name)) {
      touched.add(name);
    }
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  it("documents IDENTITY + CANONICAL as minimum pilot UX stores", () => {
    expect(PILOT_UX_REQUIRED_STORE_ENVS).toEqual([
      "RELAY_DB_STORE_IDENTITY",
      "RELAY_DB_STORE_CANONICAL"
    ]);
    const requiredKeys = PILOT_DB_STORE_MATRIX.filter((r) => r.requiredForPilotUx).map(
      (r) => r.key
    );
    expect(requiredKeys).toEqual(["IDENTITY", "CANONICAL"]);
  });

  it("assertPilotUxRequiredDbStores passes when both required flags are on", () => {
    setEnv("RELAY_DB_STORE_IDENTITY", "1");
    setEnv("RELAY_DB_STORE_CANONICAL", "1");
    expect(() => assertPilotUxRequiredDbStores()).not.toThrow();
  });

  it("assertPilotUxRequiredDbStores fails when a required flag is off", () => {
    setEnv("RELAY_DB_STORE_IDENTITY", "1");
    delete process.env.RELAY_DB_STORE_CANONICAL;
    touched.add("RELAY_DB_STORE_CANONICAL");
    expect(() => assertPilotUxRequiredDbStores()).toThrow(/RELAY_DB_STORE_CANONICAL/);
  });

  it("getPilotDbStoreStatus reflects env truthiness", () => {
    setEnv("RELAY_DB_STORE_IDENTITY", "yes");
    setEnv("RELAY_DB_STORE_CANONICAL", "0");
    const status = getPilotDbStoreStatus();
    const identity = status.find((r) => r.key === "IDENTITY");
    const canonical = status.find((r) => r.key === "CANONICAL");
    expect(identity?.enabled).toBe(true);
    expect(canonical?.enabled).toBe(false);
  });
});
