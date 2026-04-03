"use client"

import { useState, useRef, useEffect } from "react"
import { Search, X, Eye, EyeOff, Briefcase, FolderOpen, ChevronRight, ShieldAlert, Plus, FolderPlus, Check } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface Collection {
  id: string
  name: string
  count: number
}

export interface SidebarProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  selectedTags: string[]
  onTagToggle: (tag: string) => void
  selectedTiers: string[]
  onTierToggle: (tier: string) => void
  visibility: {
    workspace: boolean
    hidden: boolean
    mature: boolean
  }
  onVisibilityChange: (key: keyof SidebarProps["visibility"], value: boolean) => void
  selectedCollection: string | null
  onCollectionSelect: (collection: string | null) => void
  collections: Collection[]
  onNewCollection: (name: string) => string
}

const TAGS = ["Portrait", "Landscape", "Editorial", "Product", "BTS", "Raw", "Final", "Archive"]
const TIERS = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"]

export function Sidebar({
  searchQuery,
  onSearchChange,
  selectedTags,
  onTagToggle,
  selectedTiers,
  onTierToggle,
  visibility,
  onVisibilityChange,
  selectedCollection,
  onCollectionSelect,
  collections,
  onNewCollection,
}: SidebarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [collectionsOpen, setCollectionsOpen] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const newInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isCreating) newInputRef.current?.focus()
  }, [isCreating])

  const handleCreateConfirm = () => {
    const trimmed = newName.trim()
    if (trimmed) {
      onNewCollection(trimmed)
    }
    setNewName("")
    setIsCreating(false)
  }

  const handleCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreateConfirm()
    if (e.key === "Escape") { setIsCreating(false); setNewName("") }
  }

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-sidebar-border">
        <div
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-input border transition-colors",
            isSearchFocused ? "border-ring" : "border-transparent"
          )}
        >
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
          {searchQuery && (
            <button onClick={() => onSearchChange("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-5">

          {/* Tags */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Tags</h3>
            <div className="flex flex-wrap gap-1">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => onTagToggle(tag)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] rounded border transition-colors",
                    selectedTags.includes(tag)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:border-border"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </section>

          {/* Tier Filters */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Access Tier</h3>
            <div className="flex flex-wrap gap-1">
              {TIERS.map((tier) => (
                <button
                  key={tier}
                  onClick={() => onTierToggle(tier)}
                  className={cn(
                    "px-2 py-0.5 text-[11px] rounded border transition-colors",
                    selectedTiers.includes(tier)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:border-border"
                  )}
                >
                  {tier}
                </button>
              ))}
            </div>
          </section>

          {/* Visibility Toggles */}
          <section>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Visibility</h3>
            <div className="space-y-2">
              <VisibilityToggle
                icon={Briefcase}
                label="Workspace"
                checked={visibility.workspace}
                onChange={(checked) => onVisibilityChange("workspace", checked)}
              />
              <VisibilityToggle
                icon={visibility.hidden ? EyeOff : Eye}
                label="Hidden"
                checked={visibility.hidden}
                onChange={(checked) => onVisibilityChange("hidden", checked)}
              />
              <VisibilityToggle
                icon={ShieldAlert}
                label="Mature"
                checked={visibility.mature}
                onChange={(checked) => onVisibilityChange("mature", checked)}
              />
            </div>
          </section>

          {/* Collections — collapsible */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <button
                onClick={() => setCollectionsOpen(v => !v)}
                className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors group"
              >
                <ChevronRight
                  className={cn(
                    "w-3 h-3 transition-transform",
                    collectionsOpen && "rotate-90"
                  )}
                />
                Collections
              </button>
              <button
                onClick={() => { setCollectionsOpen(true); setIsCreating(true) }}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="New collection"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {collectionsOpen && (
              <div className="space-y-0.5">
                {/* All Assets row */}
                <button
                  onClick={() => onCollectionSelect(null)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors group",
                    selectedCollection === null
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground"
                  )}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs flex-1 truncate">All Assets</span>
                </button>

                {collections.map((collection) => (
                  <button
                    key={collection.id}
                    onClick={() => onCollectionSelect(
                      selectedCollection === collection.id ? null : collection.id
                    )}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors group",
                      selectedCollection === collection.id
                        ? "bg-sidebar-accent text-sidebar-foreground"
                        : "hover:bg-sidebar-accent/50 text-muted-foreground hover:text-sidebar-foreground"
                    )}
                  >
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs flex-1 truncate">{collection.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{collection.count}</span>
                  </button>
                ))}

                {/* Inline new collection input */}
                {isCreating && (
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-muted/60 border border-border">
                    <FolderPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <input
                      ref={newInputRef}
                      type="text"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={handleCreateKeyDown}
                      onBlur={handleCreateConfirm}
                      placeholder="Collection name"
                      className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                    />
                    <button
                      onMouseDown={e => { e.preventDefault(); handleCreateConfirm() }}
                      className="w-4 h-4 flex items-center justify-center text-primary hover:text-primary/80"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

        </div>
      </ScrollArea>

      {/* Sidebar Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{collections.reduce((a, c) => a + c.count, 0).toLocaleString()} across {collections.length} collections</span>
          <span>1.2 TB</span>
        </div>
      </div>
    </aside>
  )
}

function VisibilityToggle({
  icon: Icon,
  label,
  checked,
  onChange,
}: {
  icon: React.ElementType
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer group">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
        <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  )
}
