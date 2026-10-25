'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import PatreonSyncMenu from '@/app/components/PatreonSyncMenu'
import { GoalsLabLauncher } from '@/app/components/goals-lab/GoalsLabLauncher'
import StudioScheduleRail, { type StudioScheduleRailHandle } from '@/app/components/schedule-rail/StudioScheduleRail'
import type { ImportBinItem } from '@/app/components/LibraryImportBay'
import { useStudioSession } from '@/lib/studio-session-context'
import Lab2ActivePostsLive, { type Lab2EditorSelection } from './Lab2ActivePostsLive'
import Lab2ConversationIntake from './Lab2ConversationIntake'
import './studio-workspace.css'

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
  const { creatorId } = useStudioSession()
  return <StudioLab2Workspace key={creatorId} creatorId={creatorId} />
}

function StudioLab2Workspace({ creatorId }: { creatorId: string }) {
  const router = useRouter()
  const scheduleRail = useRef<StudioScheduleRailHandle>(null)
  const calendar = useRef<HTMLDialogElement>(null)
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  useEffect(() => {
    const dialog = calendar.current
    if (!dialog) return
    if (calendarExpanded) { dialog.close(); dialog.showModal() }
    else if (dialog.matches(':modal')) { dialog.close(); dialog.setAttribute('open', '') }
  }, [calendarExpanded])
  const [activePostsReloadToken, setActivePostsReloadToken] = useState(0)
  const [bayDragging, setBayDragging] = useState(false)
  const [view, setView] = useState('editor')
  const [editorSelection, setEditorSelection] = useState<Lab2EditorSelection>({ context: { selectedPostIds: [], selectedMediaIds: [], loadedPostIds: [] }, selectedItems: [], writeBlocked: false })

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
      className="library-shell studio-lab2-v0 studio-workspace"
      data-bay-dragging={bayDragging ? 'true' : undefined}
    >
      <TopBar
        creatorId={creatorId}
        onOpenAutomations={openAutomations}
        onOpenCrossposter={openCrossposter}
        onAfterPatreonScrape={afterPatreonScrape}
      />

      <a className="studio-skip" href="#studio-editor">Skip to editor</a>
      <nav className="studio-view-switch" aria-label="Studio workspace views">
        {(['gallery', 'editor', 'schedule'] as const).map((value) => <button type="button" key={value} aria-pressed={view === value} onClick={() => { setView(value); if (value === 'gallery') document.querySelector('.studio-gallery')?.scrollIntoView({ block: 'start' }); }}>{value === 'gallery' ? `Gallery${editorSelection.context.selectedPostIds.length ? ` · ${editorSelection.context.selectedPostIds.length} selected` : ''}` : value === 'editor' ? 'Editor' : 'Schedule'}</button>)}
      </nav>
      <main className="studio-workspace-grid" data-view={view}>
        <div className="studio-canvas">
        <div id="studio-editor" tabIndex={-1} className="studio-editor">
          <Lab2ConversationIntake
            key={creatorId}
            creatorId={creatorId}
            selection={editorSelection}
            onChanged={afterPatreonScrape}
            onAutopost={handleImportBayAutopost}
            onCorridorDragChange={setBayDragging}
            onScheduled={(event) => { void scheduleRail.current?.refreshAndHighlight({ focusEventId: event.id, highlightEventIds: [event.id], month: event.at.slice(0, 7) }).catch(() => { /* The rail shows its refresh error and retry control. */ }); setView('schedule') }}
          />
        </div>
        <section className="studio-gallery" aria-label="Gallery">
          <Lab2ActivePostsLive reloadToken={activePostsReloadToken} onEditorContextChange={setEditorSelection} />
          {editorSelection.context.selectedPostIds.length ? <button type="button" className="studio-use-selection" onClick={() => { setView('editor'); document.getElementById('library-editor-message')?.focus() }}>Edit {editorSelection.context.selectedPostIds.length} selected {editorSelection.context.selectedPostIds.length === 1 ? 'post' : 'posts'}</button> : null}
        </section>
        </div>

        <dialog
          ref={calendar}
          open
          aria-label="Schedule calendar"
          className={`studio-schedule ${calendarExpanded ? 'studio-calendar-expanded' : ''}`}
          onCancel={(event) => { event.preventDefault(); setCalendarExpanded(false) }}
          data-lab2-scheduler-column
          data-corridor-armed={bayDragging ? 'true' : undefined}
        >
          <div className="studio-schedule-intro"><div className="flex items-center justify-between gap-2"><h2>Schedule</h2><button type="button" className="studio-calendar-toggle" aria-expanded={calendarExpanded} onClick={() => setCalendarExpanded((value) => !value)}>{calendarExpanded ? 'Close calendar' : 'Expand'}</button></div><p>Prepared work, one month at a time.</p></div>
          <StudioScheduleRail
            ref={scheduleRail}
            embedded
            calendarView={calendarExpanded}
            widthPx={260}
            dropPresentation="ritual"
            corridorArmed={bayDragging}
            onCommitMedia={handleScheduleRailAutopost}
          />
        </dialog>
      </main>
    </div>
  )
}
