import { PreflightHeader }  from "@/components/preflight/preflight-header"
import { PreflightSection } from "@/components/preflight/preflight-section"
import { PreflightSidebar } from "@/components/preflight/preflight-sidebar"
import { PreflightFooter }  from "@/components/preflight/preflight-footer"
import { MOCK_GROUPS, MOCK_RELEASE, summarize } from "@/lib/preflight-data"

export default function PublishPreflightPage() {
  const { blockers, warnings, passing, infos, total, canPublish } =
    summarize(MOCK_GROUPS)

  // Sections with issues bubble to top; fully-passing sections collapse by default
  const sortedGroups = [...MOCK_GROUPS].sort((a, b) => {
    const aPriority = a.checks.some(
      (c) => c.severity === "blocker" && c.status === "fail"
    )
      ? 0
      : a.checks.some((c) => c.severity === "warning" && c.status === "fail")
      ? 1
      : 2
    const bPriority = b.checks.some(
      (c) => c.severity === "blocker" && c.status === "fail"
    )
      ? 0
      : b.checks.some((c) => c.severity === "warning" && c.status === "fail")
      ? 1
      : 2
    return aPriority - bPriority
  })

  return (
    <div className="min-h-screen bg-[var(--relay-bg)] font-sans flex flex-col">

      {/* Top nav strip */}
      <header className="flex h-11 items-center justify-between border-b border-[var(--relay-border)] bg-[var(--relay-surface-1)] px-6">
        <div className="flex items-center gap-2">
          {/* Relay wordmark */}
          <svg
            width="60"
            height="16"
            viewBox="0 0 60 16"
            fill="none"
            aria-label="Relay"
            role="img"
          >
            <text
              x="0"
              y="13"
              fontFamily="Geist, sans-serif"
              fontSize="14"
              fontWeight="600"
              fill="var(--relay-gold-500)"
              letterSpacing="-0.5"
            >
              Relay
            </text>
          </svg>
          <span className="text-[var(--relay-border-hi)] text-xs">/</span>
          <span className="text-[11px] text-[var(--relay-fg-subtle)]">Creator Studio</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-[var(--relay-fg-subtle)] font-mono">
            {MOCK_RELEASE.draftId}
          </span>
          <div className="h-6 w-6 rounded-full bg-[var(--relay-surface-2)] border border-[var(--relay-border)] flex items-center justify-center text-[10px] text-[var(--relay-fg-muted)] font-semibold">
            JD
          </div>
        </div>
      </header>

      {/* Page header */}
      <PreflightHeader
        release={MOCK_RELEASE}
        blockerCount={blockers.length}
        warningCount={warnings.length}
        passingCount={passing.length}
        total={total}
      />

      {/* Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-8">
        <div className="flex gap-8 items-start">

          {/* Checklist column */}
          <div className="flex-1 min-w-0 flex flex-col gap-6">
            {/* Section intro */}
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--relay-fg)] mb-1">
                Preflight Checks
              </h2>
              <p className="text-[12px] text-[var(--relay-fg-subtle)] leading-relaxed">
                All blockers must be resolved before publishing. Warnings are advisory
                and won&apos;t prevent distribution.
              </p>
            </div>

            {/* Sections */}
            <div className="flex flex-col gap-5">
              {sortedGroups.map((group) => {
                const hasIssues = group.checks.some((c) => c.status === "fail")
                return (
                  <PreflightSection
                    key={group.id}
                    group={group}
                    defaultOpen={hasIssues}
                  />
                )
              })}
            </div>
          </div>

          {/* Sidebar */}
          <PreflightSidebar
            blockerCount={blockers.length}
            warningCount={warnings.length}
            passingCount={passing.length}
            infoCount={infos.length}
            total={total}
            canPublish={canPublish}
          />
        </div>
      </main>

      {/* Sticky footer CTA */}
      <PreflightFooter
        canPublish={canPublish}
        blockerCount={blockers.length}
        warningCount={warnings.length}
        scheduledAt={MOCK_RELEASE.scheduledAt}
      />
    </div>
  )
}
