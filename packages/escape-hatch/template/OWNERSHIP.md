# Ownership

This generated Escape Hatch site kit is intended to be **creator-owned**.

- You own the application source, data, domain, infrastructure credentials, and billing accounts you configure.
- **Path A (Supabase Auth/Postgres, EH-030)**, when enabled, runs in **your** project — Relay does not hold those credentials.
- **Path B (portable Postgres + app-managed auth, EH-031)**, when enabled, runs on **your** Docker/self-hosted Postgres — Relay does not hold those credentials.
- Relay optional services (if later enabled) are disclosed, revocable, and replaceable; they are not required to build or soft-preview this chassis.
- This kit is **`productionSafe: false`**: identity paths are available when configured; soft persona remains for local preview; no hard paywall; no signed private media delivery claim (EH-033).

Bootstrap, Path A vs Path B, and key/password rotation: `scripts/bootstrap-identity.md` and `OPERATIONS.md`. See `escape-hatch.manifest.json` for chassis/schema versions and adapter states.
