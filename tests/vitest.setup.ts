import { beforeEach } from "vitest";

/**
 * Repo `.env` enables `RELAY_DB_STORE_*` via dotenv during imports; file-backed `createApp`
 * tests expect file stores unless they pass `config.prisma`. Strip store flags before each test.
 */
beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("RELAY_DB_STORE_")) {
      delete process.env[key];
    }
  }
});
