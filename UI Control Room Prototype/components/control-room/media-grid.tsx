"use client"

import { useRef, useEffect, useState, useCallback, useMemo } from "react"
import { MediaCard, type MediaItem } from "./media-card"
import { BulkActionBar } from "./bulk-action-bar"
import { GalleryStatsDrawer } from "./gallery-stats-drawer"
import { Grid3X3, LayoutGrid, List, Eye, EyeOff, ShieldAlert, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface MediaGridProps {
  items: MediaItem[]
  onItemsChange: (items: MediaItem[]) => void
}

type ViewMode = "dense" | "normal" | "list"

interface Toast {
  id: number
  label: string
  description: string
}

export function MediaGrid({ items, onItemsChange }: MediaGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>("dense")
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 })
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const statsButtonRef = useRef<HTMLButtonElement>(null)
  const lastSelectedIndex = useRef<number | null>(null)
  const toastCounter = useRef(0)

  // Push a toast that auto-dismisses after 2.5 s
  const pushToast = useCallback((label: string, description: string) => {
    const id = ++toastCounter.current
    setToasts(prev => [...prev, { id, label, description }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2500)
  }, [])

  // Virtualization
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const itemHeight = viewMode === "list" ? 56 : viewMode === "dense" ? 180 : 220
    const columns = viewMode === "list" ? 1 : viewMode === "dense" ? 6 : 4
    const rowHeight = itemHeight + (viewMode === "list" ? 0 : 8)
    const startRow = Math.floor(scrollTop / rowHeight)
    const endRow = Math.ceil((scrollTop + containerHeight) / rowHeight) + 1
    const start = Math.max(0, startRow * columns - columns)
    const end = Math.min(items.length, endRow * columns + columns)
    setVisibleRange({ start, end })
  }, [items.length, viewMode])

  useEffect(() => {
    handleScroll()
    const container = containerRef.current
    if (container) {
      container.addEventListener("scroll", handleScroll)
      return () => container.removeEventListener("scroll", handleScroll)
    }
  }, [handleScroll])

  const handleSelect = useCallback((id: string, selected: boolean, event?: React.MouseEvent) => {
    const itemIndex = items.findIndex(item => item.id === id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (event?.shiftKey && lastSelectedIndex.current !== null) {
        const start = Math.min(lastSelectedIndex.current, itemIndex)
        const end = Math.max(lastSelectedIndex.current, itemIndex)
        for (let i = start; i <= end; i++) next.add(items[i].id)
      } else {
        if (selected) next.add(id)
        else next.delete(id)
      }
      return next
    })
    lastSelectedIndex.current = itemIndex
  }, [items])

  const handleToggleHidden = useCallback((id: string) => {
    onItemsChange(items.map(item => item.id === id ? { ...item, isHidden: !item.isHidden } : item))
  }, [items, onItemsChange])

  const handleToggleMature = useCallback((id: string) => {
    onItemsChange(items.map(item => item.id === id ? { ...item, isMature: !item.isMature } : item))
  }, [items, onItemsChange])

  const handleClearSelection = () => {
    setSelectedIds(new Set())
    lastSelectedIndex.current = null
  }
  const handleAddTag = (tag: string) => {
    onItemsChange(items.map(item =>
      selectedIds.has(item.id) && !item.tags.includes(tag) ? { ...item, tags: [...item.tags, tag] } : item
    ))
  }
  const handleRemoveTag = (tag: string) => {
    onItemsChange(items.map(item =>
      selectedIds.has(item.id) ? { ...item, tags: item.tags.filter(t => t !== tag) } : item
    ))
  }
  const handleSetHidden = (hidden: boolean) => {
    onItemsChange(items.map(item => selectedIds.has(item.id) ? { ...item, isHidden: hidden } : item))
  }
  const handleSetMature = (mature: boolean) => {
    onItemsChange(items.map(item => selectedIds.has(item.id) ? { ...item, isMature: mature } : item))
  }
  const handleDelete = () => {
    onItemsChange(items.filter(item => !selectedIds.has(item.id)))
    handleClearSelection()
  }

  const gridStyles = useMemo(() => {
    const columns = viewMode === "list" ? 1 : viewMode === "dense" ? 6 : 4
    const itemHeight = viewMode === "list" ? 56 : viewMode === "dense" ? 180 : 220
    const gap = viewMode === "list" ? 0 : 8
    const rowHeight = itemHeight + gap
    const totalRows = Math.ceil(items.length / columns)
    const totalHeight = totalRows * rowHeight
    const paddingTop = Math.floor(visibleRange.start / columns) * rowHeight
    const visibleItems = items.slice(visibleRange.start, visibleRange.end)
    return { totalHeight, paddingTop, visibleItems, columns }
  }, [items, visibleRange, viewMode])

  const hasSelection = selectedIds.size > 0

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
      {/* Grid Header */}
      <div className="h-10 px-4 flex items-center justify-between border-b border-border shrink-0 bg-background relative">
        <div className="flex items-center gap-3">
          {/* Asset count — obvious clickable pill */}
          <button
            ref={statsButtonRef}
            onClick={() => setIsStatsOpen(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 -ml-1 rounded-md border text-xs font-medium transition-all",
              isStatsOpen
                ? "bg-muted border-border text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground"
            )}
            suppressHydrationWarning
          >
            <span className="tabular-nums" suppressHydrationWarning>{items.length.toLocaleString()} assets</span>
            <ChevronDown
              className={cn("w-3 h-3 transition-transform", isStatsOpen && "rotate-180")}
            />
          </button>

          {selectedIds.size > 0 && (
            <span className="text-xs text-primary tabular-nums">
              {selectedIds.size} selected
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className={cn("h-7 w-7 p-0", viewMode === "dense" && "bg-muted")} onClick={() => setViewMode("dense")}>
            <Grid3X3 className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className={cn("h-7 w-7 p-0", viewMode === "normal" && "bg-muted")} onClick={() => setViewMode("normal")}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className={cn("h-7 w-7 p-0", viewMode === "list" && "bg-muted")} onClick={() => setViewMode("list")}>
            <List className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Inline stats popover — drops from the header bar */}
        <GalleryStatsDrawer
          isOpen={isStatsOpen}
          onClose={() => setIsStatsOpen(false)}
          items={items}
          anchorRef={statsButtonRef}
        />
      </div>

      {/* Virtualized Grid */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <div style={{ height: gridStyles.totalHeight, paddingTop: gridStyles.paddingTop }}>
          <div
            className={cn(
              "p-4",
              viewMode === "list" ? "space-y-0" : viewMode === "dense" ? "grid grid-cols-6 gap-2" : "grid grid-cols-4 gap-3"
            )}
          >
            {viewMode === "list"
              ? gridStyles.visibleItems.map(item => (
                  <ListItem
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    onSelect={(id, selected) => handleSelect(id, selected)}
                    onToggleHidden={handleToggleHidden}
                    onToggleMature={handleToggleMature}
                  />
                ))
              : gridStyles.visibleItems.map(item => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    isSelected={selectedIds.has(item.id)}
                    onSelect={(id, selected) => handleSelect(id, selected)}
                    onToggleHidden={handleToggleHidden}
                    onToggleMature={handleToggleMature}
                  />
                ))}
          </div>
        </div>
      </div>

      {/* Custom toast stack — floats above action bar, bottom-centre */}
      <div
        className="absolute left-1/2 -translate-x-1/2 z-50 flex flex-col-reverse gap-1.5 pointer-events-none"
        style={{ bottom: hasSelection ? "calc(2.5rem + 2.5rem + 1rem)" : "1.5rem" }}
      >
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card/95 border border-border shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ minWidth: "200px" }}
          >
            <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Check className="w-2.5 h-2.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-medium text-foreground leading-none">{t.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.size}
        onClearSelection={handleClearSelection}
        onAddTag={handleAddTag}
        onRemoveTag={handleRemoveTag}
        onSetHidden={handleSetHidden}
        onSetMature={handleSetMature}
        onDelete={handleDelete}
        onAddToCollection={() => {}}
        onExport={() => {}}
        onToast={pushToast}
      />
    </div>
  )
}

// List view item
function ListItem({
  item,
  isSelected,
  onSelect,
  onToggleHidden,
  onToggleMature,
}: {
  item: MediaItem
  isSelected: boolean
  onSelect: (id: string, selected: boolean) => void
  onToggleHidden: (id: string) => void
  onToggleMature: (id: string) => void
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2 border-b border-border cursor-pointer transition-colors group",
        isSelected ? "bg-primary/10" : "hover:bg-muted/50",
        item.isHidden && "opacity-40"
      )}
      onClick={() => onSelect(item.id, !isSelected)}
    >
      <div className="relative w-10 h-10 rounded bg-muted shrink-0 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg,
              oklch(0.22 0.012 ${160 + parseInt(item.id, 36) % 40}) 0%,
              oklch(0.18 0.008 ${140 + parseInt(item.id, 36) % 60}) 100%)`,
          }}
        />
        {item.isHidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <EyeOff className="w-4 h-4 text-muted-foreground/50" />
          </div>
        )}
        {item.isMature && (
          <div className="absolute bottom-0 right-0 px-0.5 bg-background/70 rounded-tl text-[7px] font-bold text-foreground/70">
            18+
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{item.title}</div>
        <div className="text-[10px] text-muted-foreground">
          {item.type === "video" && `${item.duration} · `}{item.dimensions} · {item.fileSize}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {item.tags.slice(0, 1).map(tag => (
          <span key={tag} className="px-1.5 py-0.5 text-[9px] bg-muted rounded text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>
      <span className="text-[10px] text-muted-foreground">{item.tier}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <button
          onClick={() => onToggleHidden(item.id)}
          className="w-6 h-6 rounded flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground"
        >
          {item.isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onToggleMature(item.id)}
          className={cn(
            "w-6 h-6 rounded flex items-center justify-center transition-colors",
            item.isMature ? "text-muted-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
