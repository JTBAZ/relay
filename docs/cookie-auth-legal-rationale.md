# Cookie-Authenticated Media Acquisition — Legal Rationale

## Why a session cookie is needed

Patreon's OAuth API v2 does not expose post images, file attachments, cover images,
or video files. These fields are only returned when the same API endpoints are called
with the creator's browser session cookie.

Relay asks the creator — and only the creator — to provide their own `session_id`
cookie. The cookie is encrypted at rest (AES-256-GCM) and used exclusively to
request content from Patreon on the creator's behalf.

## Legal basis

| Principle | Explanation |
|---|---|
| **Copyright ownership** | Patreon's Terms of Service confirm that creators retain full ownership of the content they upload. Downloading one's own copyrighted works is not infringement. |
| **GDPR Article 20 — Data portability** | EU/UK data subjects have the right to receive their personal data in a structured, machine-readable format. Post images, metadata, and subscriber information are personal data under GDPR. |
| **User-initiated access** | The creator is authenticated with their own Patreon account. No third-party credentials are used. The creator explicitly opts in by providing their session cookie. |
| **No circumvention of access controls** | The creator already has access to all content returned by the cookie-authenticated requests. The tool does not bypass paywalls, DRM, or other access restrictions that would apply to third parties. |
| **Patreon's "no scraping" clause** | This clause targets unauthorized third-party data harvesting — not a creator's automated retrieval of their own intellectual property. A terms-of-service provision cannot override statutory rights (copyright ownership, GDPR portability). |

## Precedent

Open-source tools that use the same cookie-authenticated approach have operated
publicly for years without legal challenge from Patreon:

- [patreon-dl](https://github.com/patrickkfkan/patreon-dl) — MIT, 400+ stars
- [gallery-dl](https://github.com/mikf/gallery-dl) — GPL-2.0, 12 000+ stars

Both are explicitly designed for downloading content the authenticated user has
access to.

## Posture

Relay positions itself as a **creator content backup and migration assistant**.
It downloads only the authenticated creator's own content, initiated by the
creator, for the purpose of migrating to a creator-owned platform.
