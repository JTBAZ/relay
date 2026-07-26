# Sync health — operator copy deck (P5-sync-005)

Short, product-safe strings for Library banners, toasts, and empty states. **API keys** match `data.sync_health.message_key` from `GET /api/v1/patreon/sync-state` (and `error.details` on **423** `SYNC_DEGRADED`). Prefer these over paraphrasing the API in UI code.

| # | Key | Suggested copy (EN) |
|---|-----|----------------------|
| 1 | `sync_health.unknown` | We have not recorded a successful Patreon import yet. Run **Patreon sync** when you are ready. |
| 2 | `sync_health.healthy` | Patreon sync looks healthy. Your last import finished without blocking issues. |
| 3 | `sync_health.post_scrape_failed` | Your last Patreon **post import** failed. Open **Patreon** in the Library menu to see details and try again. |
| 4 | `sync_health.member_sync_failed` | **Member sync** hit an error. Your posts may still look fine; fix members in **Patreon** menu before relying on tier data. |
| 5 | `sync_health.post_scrape_warnings` | Your last import finished with **warnings**. Review **Patreon** sync details before publishing big changes. |
| 6 | `SYNC_DEGRADED` (error code) | Editing is paused until Patreon sync is healthy. Fix sync from the banner or **Patreon** menu, then try again. |
| 7 | `banner.cta.view_details` | View details |
| 8 | `banner.hint.trace_id` | If you contact support, include the **trace id** from the error or response headers. |
| 9 | `studio.oauth.expired` | Patreon access expired — reconnect your creator account (Patreon connect). |
| 10 | `studio.cookie.session` | Patreon session key missing or rejected — re-enter it on Creator Connect if you use cookie-based media access. |

## Related implementation

- DTO keys: [`src/patreon/sync-health-web-dto.ts`](../src/patreon/sync-health-web-dto.ts)
- Web helpers: [`web/lib/relay-api.ts`](../web/lib/relay-api.ts) (`formatSyncHealthRollupBanner`, `formatSyncHealthBanner`, `syncHealthBlocksStudioWrites`)
- **423** studio gate: [`src/patreon/creator-sync-writable.ts`](../src/patreon/creator-sync-writable.ts)

## v0 / CMS

For v0 prompts, paste the **Key** column as the stable identifier and the **Suggested copy** as the default locale string.
