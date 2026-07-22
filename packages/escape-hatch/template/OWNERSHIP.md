# Ownership

This generated Escape Hatch site kit is intended to be **creator-owned**.

- You own the application source, data, domain, infrastructure credentials, and billing accounts you configure.
- **Path A (Supabase Auth/Postgres, EH-030)**, when enabled, runs in **your** project — Relay does not hold those credentials.
- **Path B (portable Postgres + app-managed auth, EH-031)**, when enabled, runs on **your** Docker/self-hosted Postgres — Relay does not hold those credentials.
- **Entitlement evaluation (EH-032)** runs in **your** app server (`lib/entitlements/`) against **your** membership/snapshot rows — grant merge and freshness are creator-owned; Relay does not decide access.
- Relay optional services (if later enabled) are disclosed, revocable, and replaceable; they are not required to build or soft-preview this chassis.
- This kit is **`productionSafe: false`**: identity + entitlement evaluator are available when configured; soft persona remains for local preview; premium **bytes** may still be under `public/media` until EH-033 signed private delivery.

Bootstrap, Path A vs Path B, entitlement freshness, and key/password rotation: `scripts/bootstrap-identity.md` and `OPERATIONS.md`. See `escape-hatch.manifest.json` for chassis/schema versions and adapter states.
