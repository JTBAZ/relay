# ESCAPE_HATCH_EH_060_EVIDENCE

**Slice:** EH-060 Posts/media CMS  
**Date:** 2026-07-23  
**productionSafe:** false  
**Builder:** Cursor Grok 4.5 High

## Delivered

1. **Contract** — optional `status`, `feature_order`, `public_cover_media_id`, `body_plain` on `ClonePostEntry` (`src/contracts.ts` + kit copy).
2. **CMS core** — `template/lib/cms/posts.ts`: upsert/delete, local media attach, plain-body sanitize, gallery sort/publish filter, site.json load/save without `chdir`.
3. **Admin APIs** — `POST`/`DELETE` `/api/admin/posts`; multipart `POST` `/api/admin/media/upload` → `data/private-media/`.
4. **Admin UI** — `AdminPostsEditor` on `/admin/posts` (draft/publish, pin, cover, body, local upload).
5. **Visitor** — gallery search + draft filter + `feature_order` sort; locked public cover; post view hides drafts and shows `body_plain` when unlocked.

## Explicit non-claims / deferrals

- R2 multipart upload, schedule publish cron, rich HTML body.
- Full Structure→site.json migration UX.
- `productionSafe` remains false.

## Verification

- Kit unit tests: `escape-hatch-cms-posts.test.ts` + full `packages/escape-hatch` suite.
- Status: `ESCAPE_HATCH_SLICE = EH-060`, next `EH-061`.
