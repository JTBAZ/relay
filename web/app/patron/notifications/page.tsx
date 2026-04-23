import type { Metadata } from "next";
import Link from "next/link";
import { PatronNotificationsClient } from "./PatronNotificationsClient";

export const metadata: Metadata = {
  title: "Relay · Notifications",
  description:
    "Inbox of replies, reactions, follows, and tier changes across the creators you support."
};

/**
 * PE-G Skeletal UI (BO-P3-04) — patron notifications inbox.
 *
 * Wires:
 *   - GET    /api/v1/patron/notifications              (cursor-paged list)
 *   - GET    /api/v1/patron/notifications/unread-count (badge)
 *   - POST   /api/v1/patron/notifications/mark-read    (per-id or all-unread)
 *
 * The `?state=` dev switcher (gated by NEXT_PUBLIC_RELAY_PATRON_FEED_DEV_TOOLS + middleware
 * carve-out) lets design / QA inspect every UI state without seeded data:
 *   mixed | empty | loading | error | all-unread | all-read
 *
 * The bell-badge wiring in the patron-shell header (`relay-shell.tsx`) is intentionally NOT
 * touched in this skeletal pass -- the existing fixture path stays clean. Header integration
 * is a follow-up polish item, same as PE-E's gallery-view live wiring layered on top of the
 * existing fixture-driven post detail surface.
 */
export default function PatronNotificationsPage() {
  return (
    <>
      <NotificationsHeaderLinks />
      <PatronNotificationsClient />
    </>
  );
}

function NotificationsHeaderLinks(): React.ReactElement {
  return (
    <div className="hidden">
      {/* Reserved for future left-rail navigation; the page header lives inside the client. */}
      <Link href="/patron/notifications/preferences">Preferences</Link>
    </div>
  );
}
