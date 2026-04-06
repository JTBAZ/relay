// Relay Publish Preflight — mock data & types
// Cursor integration will replace stubs with @/lib/relay-api calls

export type Severity = "blocker" | "warning" | "pass" | "info"
export type CheckStatus = "pass" | "fail" | "pending"

export interface PreflightCheck {
  id: string
  category: string
  label: string
  detail: string
  severity: Severity
  status: CheckStatus
  actionLabel?: string
  actionHref?: string
}

export interface PreflightGroup {
  id: string
  name: string
  checks: PreflightCheck[]
}

export interface PreflightRelease {
  title: string
  type: string
  tier: string
  scheduledAt: string | null
  draftId: string
}

// ─── Mock release ────────────────────────────────────────────────────────────

export const MOCK_RELEASE: PreflightRelease = {
  title: "Signal & Noise — Issue 42",
  type: "Long-form Article",
  tier: "Paid",
  scheduledAt: "Apr 14, 2026 · 9:00 AM ET",
  draftId: "drft_7xKp2mNqR9",
}

// ─── Mock preflight checks ───────────────────────────────────────────────────

export const MOCK_GROUPS: PreflightGroup[] = [
  {
    id: "distribution",
    name: "Distribution",
    checks: [
      {
        id: "tier-assignment",
        category: "Distribution",
        label: "Tier assignment",
        detail: "Content is correctly assigned to the Paid tier.",
        severity: "pass",
        status: "pass",
      },
      {
        id: "audience-size",
        category: "Distribution",
        label: "Eligible audience",
        detail: "1,204 paid subscribers will receive this post.",
        severity: "pass",
        status: "pass",
      },
      {
        id: "duplicate-send",
        category: "Distribution",
        label: "Duplicate send detection",
        detail: "A post with an identical subject line was sent 3 days ago. Confirm this is intentional.",
        severity: "warning",
        status: "fail",
        actionLabel: "Review previous post",
        actionHref: "#",
      },
    ],
  },
  {
    id: "content",
    name: "Content",
    checks: [
      {
        id: "title-missing",
        category: "Content",
        label: "Post title",
        detail: "Title is missing. A title is required before publishing.",
        severity: "blocker",
        status: "fail",
        actionLabel: "Add title",
        actionHref: "#",
      },
      {
        id: "body-length",
        category: "Content",
        label: "Body length",
        detail: "Post body is 2,840 words — within the recommended range.",
        severity: "pass",
        status: "pass",
      },
      {
        id: "cover-image",
        category: "Content",
        label: "Cover image",
        detail: "No cover image set. Posts with cover images see 38% higher open rates.",
        severity: "warning",
        status: "fail",
        actionLabel: "Upload image",
        actionHref: "#",
      },
      {
        id: "broken-links",
        category: "Content",
        label: "Link check",
        detail: "1 broken link detected in paragraph 4.",
        severity: "blocker",
        status: "fail",
        actionLabel: "Fix link",
        actionHref: "#",
      },
      {
        id: "alt-text",
        category: "Content",
        label: "Image alt text",
        detail: "2 of 3 embedded images are missing alt text.",
        severity: "warning",
        status: "fail",
        actionLabel: "Add alt text",
        actionHref: "#",
      },
    ],
  },
  {
    id: "monetization",
    name: "Monetization",
    checks: [
      {
        id: "paywall-placement",
        category: "Monetization",
        label: "Paywall placement",
        detail: "Paywall is positioned after the first 300 words — optimal preview length.",
        severity: "pass",
        status: "pass",
      },
      {
        id: "stripe-connected",
        category: "Monetization",
        label: "Stripe account",
        detail: "Stripe account is connected and payouts are active.",
        severity: "pass",
        status: "pass",
      },
    ],
  },
  {
    id: "scheduling",
    name: "Scheduling",
    checks: [
      {
        id: "send-time",
        category: "Scheduling",
        label: "Send time conflict",
        detail: "Another post is scheduled within 2 hours of this one. Consider adjusting the schedule.",
        severity: "warning",
        status: "fail",
        actionLabel: "Edit schedule",
        actionHref: "#",
      },
      {
        id: "timezone",
        category: "Scheduling",
        label: "Timezone verified",
        detail: "Scheduled time is set to your account timezone (US/Eastern).",
        severity: "info",
        status: "pass",
      },
    ],
  },
]

// ─── Derived counts ──────────────────────────────────────────────────────────

export function summarize(groups: PreflightGroup[]) {
  const all = groups.flatMap((g) => g.checks)
  const blockers = all.filter((c) => c.severity === "blocker" && c.status === "fail")
  const warnings = all.filter((c) => c.severity === "warning" && c.status === "fail")
  const passing  = all.filter((c) => c.status === "pass")
  const infos    = all.filter((c) => c.severity === "info")
  const canPublish = blockers.length === 0
  return { blockers, warnings, passing, infos, total: all.length, canPublish }
}
