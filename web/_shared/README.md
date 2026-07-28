# Vendored API modules for Coolify web builds

Coolify `relay-web` uses Nixpacks with `base_directory=/web`, so imports of
`../../src/...` fail in production builds. These files are copies of the
canonical modules under repo-root `src/`.

When changing a shared module, update **both** `src/...` and `web/_shared/...`.

| Vendored path | Canonical |
| --- | --- |
| `patron/notification-digest-preferences.ts` | `src/patron/notification-digest-preferences.ts` |
| `platform-metrics/metric-status-taxonomy.ts` | `src/platform-metrics/metric-status-taxonomy.ts` |
| `security/post-html-sanitize-config.ts` | `src/security/post-html-sanitize-config.ts` |
