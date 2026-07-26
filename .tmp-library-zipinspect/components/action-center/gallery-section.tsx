"use client"

import { useState } from "react"
import {
  BookMarked,
  Pencil,
  Layers,
  Eye,
  Palette,
  Plus,
  Globe,
  Lock,
  ChevronRight,
} from "lucide-react"

// ── Stats ─────────────────────────────────────────────────────────────
const galleryStats = [
  { label: "Posts",       value: 48, icon: BookMarked },
  { label: "Collections", value: 4,  icon: Layers },
  { label: "Published",   value: 41, icon: Globe },
  { label: "Drafts",      value: 7,  icon: Pencil },
]

// ── Tools ─────────────────────────────────────────────────────────────
const galleryTools = [
  { label: "Library",     icon: BookMarked, tooltip: "Browse all posts" },
  { label: "Collections", icon: Layers,     tooltip: "Organize into groups" },
  { label: "Compose",     icon: Pencil,     tooltip: "Create new post" },
  { label: "Designer",    icon: Palette,    tooltip: "Customize gallery look" },
  { label: "Preview",     icon: Eye,        tooltip: "See visitor view" },
]

// ── Collections ───────────────────────────────────────────────────────
const collections = [
  { id: 1, name: "Autumn Series",   posts: 12, visibility: "public" as const },
  { id: 2, name: "Studio Sessions", posts: 8,  visibility: "supporters" as const },
  { id: 3, name: "Essay Archive",   posts: 23, visibility: "public" as const },
  { id: 4, name: "Unreleased Work", posts: 5,  visibility: "studio" as const },
]

// ── Main export ───────────────────────────────────────────────────────
export function GallerySection() {
  const [showNew, setShowNew] = useState(false)

  return (
    <section className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        {galleryStats.map((s) => {
          const Icon = s.icon
          return (
            <div
              key={s.label}
              className="flex items-center gap-4 p-4 rounded-xl bg-surface-1 border border-border"
            >
              <div className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-semibold text-text-hi tabular-nums">{s.value}</p>
                <p className="text-xs text-text-lo">{s.label}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Two columns: Tools + Collections */}
      <div className="grid grid-cols-2 gap-6">
        {/* Tools */}
        <div className="space-y-3">
          <span className="text-sm text-text-lo">Tools</span>
          <div className="flex flex-wrap gap-2">
            {galleryTools.map((tool) => {
              const Icon = tool.icon
              return (
                <a
                  key={tool.label}
                  href="#"
                  data-tooltip={tool.tooltip}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-surface-2 text-sm text-text-mid hover:bg-surface-3 transition-colors"
                >
                  <Icon className="w-4 h-4" />
                  {tool.label}
                </a>
              )
            })}
          </div>
        </div>

        {/* Collections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-lo">Collections</span>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="flex items-center gap-1 text-xs text-accent hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          </div>

          {showNew && (
            <input
              autoFocus
              type="text"
              placeholder="Collection name..."
              className="w-full px-4 py-2.5 rounded-xl bg-surface-2 border border-border-mid text-sm text-text-hi placeholder:text-text-mute focus:outline-none focus:border-accent transition-colors"
              onKeyDown={(e) => { if (e.key === "Escape") setShowNew(false) }}
            />
          )}

          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {collections.map((col) => (
              <div
                key={col.id}
                className="flex items-center gap-3 px-4 py-3 bg-surface-1 hover:bg-surface-2 cursor-pointer transition-colors"
              >
                <span className="flex-1 text-sm font-medium text-text-hi">{col.name}</span>
                <span className="text-xs text-text-lo tabular-nums">{col.posts}</span>
                <span className="flex items-center gap-1 text-xs text-text-mute">
                  {col.visibility === "public" ? (
                    <Globe className="w-3 h-3" />
                  ) : (
                    <Lock className="w-3 h-3" />
                  )}
                </span>
                <ChevronRight className="w-4 h-4 text-text-mute" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
