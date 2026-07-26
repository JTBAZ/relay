'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PatreonSyncMenu from '@/app/components/PatreonSyncMenu'
import { GoalsLabLauncher } from '@/app/components/goals-lab/GoalsLabLauncher'
import StudioScheduleRail from '@/app/components/schedule-rail/StudioScheduleRail'
import { SCHEDULE_RAIL_LAB2_WIDTH_PX } from '@/app/components/schedule-rail/ScheduleRail'
import { LabStagingDock } from '@/app/components/studio/LabStagingDock'
import type { ImportBinItem } from '@/app/components/LibraryImportBay'
import { useStudioSession } from '@/lib/studio-session-context'
import Lab2ActivePostsLive from './Lab2ActivePostsLive'

const patreonCampaignIdEnv =
  process.env.NEXT_PUBLIC_RELAY_PATREON_CAMPAIGN_ID?.trim() || undefined

const toolBtnClass =
  'flex items-center gap-1.5 rounded-xl border border-[#172018] bg-[#0a0f0b] px-2.5 py-1.5 text-[11px] font-medium text-[#3d5a46] transition-all hover:border-[#243426] hover:text-[#5fb98f]'

function TopBar({
  creatorId,
  onOpenAutomations,
  onOpenCrossposter,
  onAfterPatreonScrape,
}: {
  creatorId: string
  onOpenAutomations: () => void
  onOpenCrossposter: () => void
  onAfterPatreonScrape: () => void
}) {
  return (
    <header className="flex h-11 flex-shrink-0 items-center justify-between border-b border-[#111] bg-[#050706]/95 px-5 backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <Link
          href="/studio"
          className="flex h-6 w-6 items-center justify-center rounded-full border border-[#1f2e22] bg-[#0a0f0b] text-[#5fb98f]"
          aria-label="Relay studio home"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path
              d="M4 7C4 5.343 5.343 4 7 4C8.657 4 10 5.343 10 7C10 8.657 8.657 10 7 10"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <path
              d="M7 10C5.343 10 4 8.657 4 7"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeOpacity="0.35"
            />
          </svg>
        </Link>
        <span className="text-[12.5px] font-semibold tracking-[-0.02em] text-[#d0ddd4]">Relay</span>
        <span className="text-[10px] font-medium text-[#2e3a32]">/ Studio</span>
      </div>

      <nav className="flex items-center gap-1" aria-label="Studio tools">
        <GoalsLabLauncher />
        <button
          type="button"
          className={toolBtnClass}
          aria-label="Automations"
          onClick={onOpenAutomations}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M6.5 1.5L2.5 6.5H5.5L4.5 10.5L9.5 5.5H6.5L6.5 1.5Z"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hidden sm:block" aria-hidden="true">
            Automations
          </span>
        </button>
        <button
          type="button"
          className={toolBtnClass}
          aria-label="Crossposter"
          onClick={onOpenCrossposter}
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path
              d="M2 6h8M6 2l4 4-4 4"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="hidden sm:block" aria-hidden="true">
            Crossposter
          </span>
        </button>
        <div className="[&_button]:rounded-xl [&_button]:border-[#172018] [&_button]:bg-[#0a0f0b] [&_button]:text-[#3d5a46] [&_button:hover]:border-[#243426] [&_button:hover]:text-[#5fb98f]">
          <PatreonSyncMenu
            creatorId={creatorId}
            campaignId={patreonCampaignIdEnv}
            onAfterScrape={onAfterPatreonScrape}
            triggerLabel="Patreon Health"
          />
        </div>
      </nav>
    </header>
  )
}

/**
 * Lab2 chassis: v0 /4 composition with live panels and Bay→Rail drag corridor.
 */
export default function StudioLab2Chassis() {
  const router = useRouter()
  const { creatorId } = useStudioSession()
  const [bayError, setBayError] = useState<string | null>(null)
  const [activePostsReloadToken, setActivePostsReloadToken] = useState(0)
  const [bayDragging, setBayDragging] = useState(false)

  const pushAutopost = useCallback(
    (mediaIds: string[], stage?: 'platforms') => {
      const ids = mediaIds.map((id) => id.trim()).filter(Boolean).join(',')
      if (!ids) return
      const stageQ = stage ? `&stage=${stage}` : ''
      router.push(`/studio/autopost?media_ids=${encodeURIComponent(ids)}${stageQ}`)
    },
    [router]
  )

  const handleImportBayAutopost = useCallback(
    (items: ImportBinItem[]) => {
      pushAutopost(
        items.filter((item) => item.serverStaged).map((item) => item.id)
      )
    },
    [pushAutopost]
  )

  const handleImportBayAddToNewPost = useCallback(
    (items: ImportBinItem[]) => {
      pushAutopost(
        items.filter((item) => item.serverStaged).map((item) => item.id)
      )
    },
    [pushAutopost]
  )

  const handleScheduleRailAutopost = useCallback(
    (mediaIds: string[]) => {
      pushAutopost(mediaIds, 'platforms')
    },
    [pushAutopost]
  )

  const openAutomations = useCallback(() => {
    router.push('/studio/lab2?automations=1')
  }, [router])

  const openCrossposter = useCallback(() => {
    router.push('/studio/autopost')
  }, [router])

  const afterPatreonScrape = useCallback(() => {
    setActivePostsReloadToken((n) => n + 1)
  }, [])

  return (
    <div
      className="studio-lab2-v0 flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050706]"
      data-bay-dragging={bayDragging ? 'true' : undefined}
    >
      <TopBar
        creatorId={creatorId}
        onOpenAutomations={openAutomations}
        onOpenCrossposter={openCrossposter}
        onAfterPatreonScrape={afterPatreonScrape}
      />

      {bayError ? (
        <div
          className="mx-5 mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-[12px] text-[#e8e8e8]"
          role="alert"
        >
          <span className="font-semibold text-red-300">Import Bay</span>
          <span className="mt-0.5 block text-[#9ca3af]">{bayError}</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-1 flex-col">
          <LabStagingDock
            creatorId={creatorId}
            variant="studio"
            onError={setBayError}
            onAutopost={handleImportBayAutopost}
            onAddToNewPost={handleImportBayAddToNewPost}
            onCorridorDragChange={setBayDragging}
          />
          <Lab2ActivePostsLive reloadToken={activePostsReloadToken} />
        </div>

        <div
          className={`relative flex flex-shrink-0 flex-col transition-colors duration-150 ${
            bayDragging ? 'bg-[#070c09]' : 'bg-[#070a08]'
          }`}
          style={{ width: SCHEDULE_RAIL_LAB2_WIDTH_PX }}
          data-lab2-scheduler-column
          data-corridor-armed={bayDragging ? 'true' : undefined}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-px transition-opacity duration-300"
            style={{
              background: bayDragging
                ? 'linear-gradient(to bottom, transparent, #9bf0c438 22%, #9bf0c438 78%, transparent)'
                : 'linear-gradient(to bottom, transparent, #14201a 20%, #14201a 80%, transparent)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10"
            style={{ background: 'linear-gradient(to right, #0000000d, transparent)' }}
          />
          <StudioScheduleRail
            widthPx={SCHEDULE_RAIL_LAB2_WIDTH_PX}
            dropPresentation="ritual"
            corridorArmed={bayDragging}
            onCommitMedia={handleScheduleRailAutopost}
          />
        </div>
      </div>
    </div>
  )
}
