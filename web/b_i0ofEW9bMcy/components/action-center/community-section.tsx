"use client"

import { useState } from "react"
import {
  MessageSquare,
  CornerDownRight,
  Eye,
  Flag,
  X,
  ChevronRight,
} from "lucide-react"

// ── Stats ────────────────────────────────────────────────────────────
const stats = [
  { label: "Comments", value: 24, delta: 6, icon: MessageSquare },
  { label: "Replies",  value: 11, delta: 3, icon: CornerDownRight },
  { label: "Views",    value: 8412, delta: 184, icon: Eye },
  { label: "Reports",  value: 2, delta: 0, icon: Flag, urgent: true },
]

// ── Activity feed ────────────────────────────────────────────────────
interface ActivityItem {
  id: number
  type: "comment" | "reply" | "report"
  user: string
  content: string
  target: string
  time: string
  read: boolean
}

const activityFeed: ActivityItem[] = [
  { id: 1, type: "report",  user: "anonymous", content: "Post flagged for review", target: "Autumn Series No. 4", time: "2m",  read: false },
  { id: 2, type: "comment", user: "mara_osei", content: "This piece genuinely stopped me. The light is extraordinary.", target: "Portrait Study III", time: "14m", read: false },
  { id: 3, type: "reply",   user: "james_liu", content: "Replied to your comment", target: "On Silence & Digital Commons", time: "1h",  read: false },
  { id: 4, type: "comment", user: "riley_k",   content: "Any chance of a print run?", target: "Autumn Series No. 4", time: "5h",  read: true },
]

// ── Drawer ────────────────────────────────────────────────────────────
function Drawer({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end" aria-modal="true" role="dialog">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="drawer-open relative z-50 w-[400px] h-full bg-surface-1 border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-base font-semibold text-text-hi">{title}</span>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center text-text-lo hover:text-text-hi transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────
export function CommunitySection() {
  const [openDrawer, setOpenDrawer] = useState<"inbox" | "moderation" | null>(null)
  const unread = activityFeed.filter((a) => !a.read).length

  return (
    <section className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {stats.map((s) => {
          const Icon = s.icon
          const isUrgent = s.urgent
          return (
            <button
              key={s.label}
              onClick={() => setOpenDrawer(isUrgent ? "moderation" : "inbox")}
              className={`flex flex-col items-start p-4 rounded-xl transition-all ${
                isUrgent
                  ? "bg-destructive-soft border border-destructive/30 hover:border-destructive/50"
                  : "bg-surface-1 border border-border hover:border-border-mid"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <Icon className={`w-4 h-4 ${isUrgent ? "text-destructive" : "text-accent"}`} />
                {s.delta > 0 && (
                  <span className="text-xs text-text-lo">+{s.delta}</span>
                )}
              </div>
              <span className={`text-2xl font-semibold tabular-nums ${isUrgent ? "text-destructive" : "text-text-hi"}`}>
                {s.value.toLocaleString()}
              </span>
              <span className="text-xs text-text-lo mt-1">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpenDrawer("inbox")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-primary-foreground text-sm font-medium"
        >
          <MessageSquare className="w-4 h-4" />
          Inbox
          {unread > 0 && (
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary-foreground/20 text-xs">
              {unread}
            </span>
          )}
        </button>
        <button
          onClick={() => setOpenDrawer("moderation")}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-2 text-sm text-text-mid hover:bg-surface-3 transition-colors"
        >
          <Flag className="w-4 h-4 text-destructive" />
          Moderation
        </button>
      </div>

      {/* Drawers */}
      {openDrawer === "inbox" && (
        <Drawer title="Inbox" onClose={() => setOpenDrawer(null)}>
          <div className="divide-y divide-border">
            {activityFeed.map((item) => (
              <div
                key={item.id}
                className={`flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors hover:bg-surface-2 ${!item.read ? "bg-surface-0" : ""}`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  item.type === "report" ? "bg-destructive-soft" : "bg-surface-3"
                }`}>
                  {item.type === "comment" && <MessageSquare className="w-4 h-4 text-text-lo" />}
                  {item.type === "reply" && <CornerDownRight className="w-4 h-4 text-text-lo" />}
                  {item.type === "report" && <Flag className="w-4 h-4 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text-hi">@{item.user}</span>
                    <span className="text-xs text-text-mute">{item.time}</span>
                  </div>
                  <p className="text-sm text-text-mid mt-0.5 line-clamp-1">{item.content}</p>
                  <p className="text-xs text-text-lo mt-1 flex items-center gap-1">
                    <ChevronRight className="w-3 h-3" />
                    {item.target}
                  </p>
                </div>
                {!item.read && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-2" />}
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {openDrawer === "moderation" && (
        <Drawer title="Moderation" onClose={() => setOpenDrawer(null)}>
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-xl bg-surface-0 border border-destructive/30">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-destructive-soft flex items-center justify-center flex-shrink-0">
                  <Flag className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm text-text-hi">Reported comment on &quot;Autumn Series No. 4&quot;</p>
                  <p className="text-xs text-text-lo mt-1">Medium severity</p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm text-text-mid hover:bg-surface-3 transition-colors">
                  Dismiss
                </button>
                <button className="flex-1 px-3 py-2 rounded-lg bg-destructive text-white text-sm font-medium hover:bg-destructive/90 transition-colors">
                  Review
                </button>
              </div>
            </div>
          </div>
        </Drawer>
      )}
    </section>
  )
}
