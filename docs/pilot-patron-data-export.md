# Pilot — “Download my data” (patron)

**Scope:** Pilot placeholder aligned with product/compliance planning (no full legal GDPR program in this doc).

## How a signed-in patron gets their data

1. Use a normal **patron web session** (Bearer token / Relay session cookie, same as other `/api/v1/patron/...` routes).
2. **GET** [`/api/v1/patron/me/export`](../src/server.ts) — response is a **JSON file** download (pretty-printed), not the usual API envelope.

## What is in the JSON

The server builds one bundle via [`buildPatronExportBundle`](../src/patron/data-export-service.ts). In plain terms it includes:

- Your **account** basics (email provider fields we store, Patreon user id if linked, artist workspace id if you are a creator) — **not** passwords or raw OAuth secrets.
- Your **memberships** per creator: profile, follows, tier snapshots.
- **Favorites**, **saved collections**, **comments**, **reactions**, **notifications**, **notification preferences**, and **content reports you filed**.

It does **not** include other people’s private data, OAuth token ciphertext, or internal ops queues. Details and future sizing notes are in the source file header.

## Billing

**No Stripe** data — Relay pilot export is account/patron product data only.

## Limitations (pilot)

- One synchronous download; very large accounts may need a future async/job flow (not in this pilot).
- This path is for **patrons** with a linked **Account** and database-backed identity; if the API returns `503`, identity/export isn’t available in that environment.
