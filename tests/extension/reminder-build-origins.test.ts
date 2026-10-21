import { buildSync } from "esbuild";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

function reminderBuild(env: "dev" | "prod") {
  const result = buildSync({
    stdin: { contents: `
      export { RELAY_WEB_HOSTS, isInjectEligibleHost } from "./extension/src/lib/schedule-reminder-types";
      export { isAllowedGoalCycleDeepLink } from "./extension/src/lib/goal-cycle-reminder";
    `, resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs",
    define: { __EXT_ENV__: JSON.stringify(env) }
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0]!.text, { module, exports: module.exports, URL });
  return module.exports as typeof import("../../extension/src/lib/schedule-reminder-types") &
    typeof import("../../extension/src/lib/goal-cycle-reminder");
}

describe.each(["dev", "prod"] as const)("%s reminder build origins", (env) => {
  it("keeps local injection and Relay deep links exclusive to development", () => {
    const reminder = reminderBuild(env);
    expect([...reminder.RELAY_WEB_HOSTS]).toEqual(env === "dev"
      ? ["localhost", "127.0.0.1", "relayapp.me"] : ["relayapp.me"]);
    for (const host of ["localhost", "127.0.0.1"]) {
      expect(reminder.isInjectEligibleHost(host)).toBe(env === "dev");
      expect(reminder.isAllowedGoalCycleDeepLink(`http://${host}:3000/studio`, null)).toBe(env === "dev");
    }
    expect(reminder.isInjectEligibleHost("relayapp.me")).toBe(true);
    expect(reminder.isAllowedGoalCycleDeepLink("https://relayapp.me/studio", null)).toBe(true);
    expect(reminder.isInjectEligibleHost("www.patreon.com")).toBe(true);
    expect(reminder.isAllowedGoalCycleDeepLink("https://www.patreon.com/posts/12", "patreon")).toBe(true);
    expect(reminder.isInjectEligibleHost("relayapp.me.attacker.example")).toBe(false);
    expect(reminder.isAllowedGoalCycleDeepLink("https://attacker.example/studio", null)).toBe(false);
  });
});
