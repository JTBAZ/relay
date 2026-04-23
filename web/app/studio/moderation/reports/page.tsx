import type { Metadata } from "next";
import { ReportsQueueClient } from "./ReportsQueueClient";

export const metadata: Metadata = {
  title: "Relay Studio · Moderation queue",
  description: "Review and resolve patron-submitted reports across your creator scope."
};

/**
 * PE-E (BO-P2-04) — Studio moderation queue page.
 *
 * Backed by:
 *   - GET  /api/v1/creator/moderation/reports?relay_creator_id=&status=&cursor=
 *   - POST /api/v1/creator/moderation/reports/:report_id/resolve
 *
 * Auth + scope: the API enforces owner-only access (Account.primaryRelayCreatorId must match
 * the requested relay_creator_id). The page resolves the caller's primary scope client-side
 * via /api/v1/me/session; if the caller isn't a creator, the queue surfaces a friendly
 * "studio session required" state rather than 403-ing visually.
 *
 * Skeletal-UI scope: list + filter + resolve. Bulk select, target preview cards, and
 * notification of the reporter on resolution are out of scope.
 */
export default function StudioModerationReportsPage() {
  return <ReportsQueueClient />;
}
