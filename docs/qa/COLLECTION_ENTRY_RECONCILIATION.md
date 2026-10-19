# Checking an uncertain collection-entry save

An entry can be saved before a later store update or notification fails. A failed save response therefore does not always mean the entry is absent.

## Save responses

For `POST /api/v1/patron/collections/:collection_id/entries`:

| Response | Meaning |
| --- | --- |
| 200 | The handler returned the saved or existing entry. |
| 400 | The request failed validation. |
| 404 | The collection was not found within the authenticated patron's creator and ownership scope. |
| 503 from the catalog-load check | The catalog read failed before the entry write was attempted. This classified failure allows a retry with the original key after recovery. |
| 500 with `INTERNAL` | The save could not be confirmed. The entry may already be present. |

Other authentication, permission, and rate-limit responses retain their existing meanings. A server error status alone does not prove that a write never happened.

## Read back before taking further action

1. Keep the original request body and `Idempotency-Key` if one was supplied. Do not switch to a new key to bypass an uncertain result.
2. Using the same authenticated account, request `GET /api/v1/patron/collections/:collection_id`. Match the requested media within that collection using the existing entry identity rules. This read performs no write.
3. If the entry is returned, it is currently saved. Existing entitlement and mature-content filtering still applies; read-back does not grant additional access.
4. If the read fails, its contents remain unknown. Wait for recovery and repeat the read. Read or parse failures in the collection store return a generic 500, without exposing storage details or inventing an empty result.
5. An empty result or 404 describes current readable state within the caller's access. It does not establish whether an earlier request committed, nor does it authorize an automatic resubmission. The entry may have been removed or filtered since that request.

With the same caller, target, body, and original key, retrying an uncertain save replays its original error with `Idempotency-Replayed: true`; it does not call the write again while the snapshot remains available. Reading the saved entry does not turn that replay into a success response. Requests originally sent without a key have no replay protection; adding a key afterward cannot recover it.

## Limits

This procedure checks current collection state. It does not identify the historical outcome of a particular request or repair a failed notification. The existing in-memory retry limits remain: process restart, cache eviction, response expiry, and running-reservation expiry can allow re-execution. There is no new durable or cross-process exactly-once guarantee.

Strict collection-store reads apply to entry saves and authenticated owner detail. Other legacy file-store operations retain their existing behavior.
