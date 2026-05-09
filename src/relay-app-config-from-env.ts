/**
 * @fileoverview Back-compat barrel: re-exports `relayServerConfigFromEnv` under the legacy name `relayAppConfigFromEnv`.
 * @description Prefer importing `relayServerConfigFromEnv` from `./relay-server-env.js` directly (clearer name).
 * @deprecated Call sites should use {@link ./relay-server-env.js} `relayServerConfigFromEnv` — this alias remains for external scripts only.
 * @see {@link ./relay-server-env.js}
 */
export { relayServerConfigFromEnv as relayAppConfigFromEnv } from "./relay-server-env.js";
