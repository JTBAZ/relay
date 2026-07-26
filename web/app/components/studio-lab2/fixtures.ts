export type ActionFamily = 'post' | 'schedule' | 'pin_comment' | 'repost' | 'custom'
export type EventStatus = 'pending' | 'done' | 'overdue'
export type Destination = 'x' | 'patreon' | 'deviantart' | null

export interface ReadyItem {
  id: string
  action: ActionFamily
  title: string
  rationale: string | null
  destination: Destination
  link: string | null
  notify: boolean
  plan_label: string | null
  plan_index?: number
  plan_total?: number
  status: EventStatus
}

export interface ScheduleEvent {
  id: string
  action: ActionFamily
  title: string
  rationale?: string | null
  destination: Destination
  at: string
  link?: string | null
  notify: boolean
  plan_label?: string | null
  plan_index?: number
  plan_total?: number
  status: EventStatus
}

export interface ScheduleData {
  month: string
  timezone: string
  remind_me_global: boolean
  cadence: { posted: number; target: number }
  postbot: { done: number; total: number }
  ready: ReadyItem[]
  events: ScheduleEvent[]
}

// A plan committed from the Goals coach, rendered as a reference card on the rail.
export interface CommittedPlanRow {
  id: string
  title: string
  dateLabel: string          // e.g. "Wed 15"
  time: string               // e.g. "11:00"
  destination: Destination
}

export interface CommittedPlan {
  goalLabel: string
  strategy: string
  rows: CommittedPlanRow[]
}

export const INITIAL_DATA: ScheduleData = {
  month: '2026-07',
  timezone: 'America/New_York',
  remind_me_global: true,
  cadence: { posted: 3, target: 8 },
  postbot: { done: 5, total: 12 },
  ready: [
    {
      id: 'ready_1',
      action: 'post',
      title: 'Drop art assets when ready',
      rationale: 'Kick off the week engagement farm once assets are uploaded.',
      destination: 'x',
      link: null,
      notify: true,
      plan_label: 'Week engagement',
      plan_index: 1,
      plan_total: 5,
      status: 'pending',
    },
    {
      id: 'ready_2',
      action: 'post',
      title: 'Frame: engagement optimization',
      rationale: 'Nudged draft from Insights Action Hub.',
      destination: null,
      link: null,
      notify: false,
      plan_label: null,
      status: 'pending',
    },
  ],
  events: [
    {
      id: 'evt_1',
      action: 'schedule',
      title: 'Publish character drop',
      rationale: 'PostBot suggests your usual 7pm window from posting history.',
      destination: 'x',
      at: '2026-07-14T19:00:00-04:00',
      link: 'https://x.com/artist/status/1234567890',
      notify: true,
      plan_label: 'Week engagement',
      plan_index: 2,
      plan_total: 5,
      status: 'done',
    },
    {
      id: 'evt_2',
      action: 'pin_comment',
      title: 'Pin comment — store CTA',
      rationale: '12h after publish: pin a short follow-up with a clear call to action.',
      destination: 'x',
      at: '2026-07-15T07:00:00-04:00',
      link: 'https://x.com/artist/status/1234567890',
      notify: true,
      plan_label: 'Week engagement',
      plan_index: 3,
      plan_total: 5,
      status: 'pending',
    },
    {
      id: 'evt_3',
      action: 'repost',
      title: 'Repost / quote for reach',
      rationale: 'Day-2 reshare for followers who missed the drop.',
      destination: 'x',
      at: '2026-07-16T18:00:00-04:00',
      link: 'https://x.com/artist/status/1234567890',
      notify: true,
      plan_label: 'Week engagement',
      plan_index: 4,
      plan_total: 5,
      status: 'pending',
    },
    {
      id: 'evt_4',
      action: 'custom',
      title: 'Payday — set aside ad budget',
      rationale: null,
      destination: null,
      at: '2026-07-18T09:00:00-04:00',
      link: null,
      notify: false,
      plan_label: null,
      status: 'pending',
    },
    {
      id: 'evt_cluster_a',
      action: 'post',
      title: 'Teaser on Patreon',
      rationale: 'Early access teaser for Patreon supporters.',
      destination: 'patreon',
      at: '2026-07-20T12:00:00-04:00',
      link: null,
      notify: true,
      plan_label: null,
      status: 'pending',
    },
    {
      id: 'evt_cluster_b',
      action: 'schedule',
      title: 'DA mirror upload',
      rationale: 'Cross-post to DeviantArt gallery.',
      destination: 'deviantart',
      at: '2026-07-20T14:00:00-04:00',
      link: null,
      notify: true,
      plan_label: null,
      status: 'pending',
    },
    {
      id: 'evt_cluster_c',
      action: 'pin_comment',
      title: 'Reply to top comment',
      rationale: 'Engage with top comment to boost algorithm signal.',
      destination: 'x',
      at: '2026-07-20T16:00:00-04:00',
      link: 'https://x.com/artist/status/1234567890',
      notify: true,
      plan_label: null,
      status: 'pending',
    },
    {
      id: 'evt_5',
      action: 'post',
      title: 'Month-end highlight reel',
      rationale: 'Wrap up July with a curated highlights post.',
      destination: 'x',
      at: '2026-07-30T20:00:00-04:00',
      link: null,
      notify: true,
      plan_label: null,
      status: 'pending',
    },
  ],
}

// Action family → color token
export const ACTION_COLORS: Record<ActionFamily, string> = {
  post:        '#9bf0c4',
  schedule:    '#7eb8e8',
  pin_comment: '#f0b86a',
  repost:      '#b89af0',
  custom:      '#888888',
}

export const ACTION_LABELS: Record<ActionFamily, string> = {
  post:        'Post',
  schedule:    'Schedule',
  pin_comment: 'Pin comment',
  repost:      'Repost',
  custom:      'Custom',
}

export const DEST_LABELS: Record<NonNullable<Destination>, string> = {
  x:          'X',
  patreon:    'Patreon',
  deviantart: 'DeviantArt',
}

// Today in the mock = July 17
export const TODAY_DAY = 17


// Gallery / staging fixtures for Lab2 chassis (from v0 /4)
export type GalleryThumbStatus = 'live' | 'draft' | 'scheduled'

export interface GalleryThumb {
  id: string
  label: string
  dest: Destination
  action: ActionFamily
  day: number
  status: GalleryThumbStatus
  hue: string
}

export interface StagedFile {
  id: string
  name: string
  hue: string
  type: 'image' | 'video'
}

export const GALLERY_THUMBS: GalleryThumb[] = [
  { id: 'g1', label: 'Character drop', dest: 'x', action: 'post', day: 14, status: 'live', hue: '#0e1c14' },
  { id: 'g2', label: 'Teaser on Patreon', dest: 'patreon', action: 'schedule', day: 20, status: 'scheduled', hue: '#141019' },
  { id: 'g3', label: 'Pin comment CTA', dest: 'x', action: 'pin_comment', day: 15, status: 'live', hue: '#191410' },
  { id: 'g4', label: 'DA mirror upload', dest: 'deviantart', action: 'schedule', day: 20, status: 'scheduled', hue: '#0e1419' },
  { id: 'g5', label: 'Repost for reach', dest: 'x', action: 'repost', day: 16, status: 'live', hue: '#150e19' },
  { id: 'g6', label: 'Month highlight', dest: 'x', action: 'post', day: 30, status: 'scheduled', hue: '#0e1c14' },
  { id: 'g7', label: 'Patreon process note', dest: 'patreon', action: 'post', day: 22, status: 'draft', hue: '#141019' },
  { id: 'g8', label: 'Studio WIP drop', dest: 'x', action: 'post', day: 24, status: 'draft', hue: '#0e1c14' },
  { id: 'g9', label: 'Engagement farm', dest: 'x', action: 'post', day: 17, status: 'live', hue: '#191410' },
  { id: 'g10', label: 'Reply to top comment', dest: 'x', action: 'pin_comment', day: 20, status: 'live', hue: '#0e1419' },
  { id: 'g11', label: 'Quote repost', dest: 'x', action: 'repost', day: 21, status: 'scheduled', hue: '#150e19' },
  { id: 'g12', label: 'DeviantArt teaser', dest: 'deviantart', action: 'post', day: 25, status: 'draft', hue: '#0e1c14' },
]

export const DEMO_FILES: StagedFile[] = [
  { id: 'sf1', name: 'character_final.png', hue: '#0e1c14', type: 'image' },
  { id: 'sf2', name: 'teaser_loop.mp4', hue: '#141019', type: 'video' },
  { id: 'sf3', name: 'wip_sketch.jpg', hue: '#191410', type: 'image' },
]
