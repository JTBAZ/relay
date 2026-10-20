/** Resolve the optional localhost API port for a development extension build. */
export function extensionDevApiPort(env = process.env) {
  const raw = env.RELAY_EXTENSION_DEV_API_PORT?.trim();
  if (!raw) return 8787;
  if (!/^\d+$/.test(raw)) throw new Error("RELAY_EXTENSION_DEV_API_PORT must be an integer from 1 to 65535.");
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("RELAY_EXTENSION_DEV_API_PORT must be an integer from 1 to 65535.");
  }
  return port;
}
