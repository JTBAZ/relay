"use client"

import { X, Tag, Eye, EyeOff, Trash2, FolderPlus, Download, ShieldAlert, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Badge } from "@/components/ui/badge"

const AVAILABLE_TAGS = ["Portrait", "Landscape", "Editorial", "Product", "BTS", "Raw", "Final", "Archive"]

export interface ToastMessage {
  id: number
  label: string
  description: string
}

interface BulkActionBarProps {
  selectedCount: number
  onClearSelection: () => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onSetHidden: (hidden: boolean) => void
  onSetMature: (mature: boolean) => void
  onDelete: () => void
  onAddToCollection: () => void
  onExport: () => void
  onToast: (label: string, description: string) => void
}

export function BulkActionBar({
  selectedCount,
  onClearSelection,
  onAddTag,
  onRemoveTag,
  onSetHidden,
  onSetMature,
  onDelete,
  onAddToCollection,
  onExport,
  onToast,
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  const n = selectedCount
  const plural = n > 1 ? "s" : ""

  const handleAddTag = (tag: string) => {
    onAddTag(tag)
    onToast(`Tag "${tag}" added`, `Applied to ${n} item${plural}`)
  }

  const handleRemoveTag = (tag: string) => {
    onRemoveTag(tag)
    onToast(`Tag "${tag}" removed`, `Updated ${n} item${plural}`)
  }

  const handleSetHidden = (hidden: boolean) => {
    onSetHidden(hidden)
    onToast(hidden ? "Set Hidden" : "Set Visible", `${n} item${plural} updated`)
  }

  const handleSetMature = (mature: boolean) => {
    onSetMature(mature)
    onToast(mature ? "Set Mature" : "Set General", `${n} item${plural} updated`)
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40">
      <div
        className="flex items-center gap-1 px-2 py-1.5 bg-card border rounded-lg shadow-xl backdrop-blur-sm"
        style={{ borderColor: "#00ffb4" }}
      >
        {/* Selection count */}
        <div className="flex items-center gap-2 px-2 border-r border-border mr-1">
          <Badge variant="default" className="text-xs tabular-nums">{selectedCount}</Badge>
          <span className="text-xs text-muted-foreground">selected</span>
          <button
            onClick={onClearSelection}
            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Tags */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              Tags
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="w-40" sideOffset={8}>
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Add Tag
            </div>
            {AVAILABLE_TAGS.map(tag => (
              <button
                key={`add-${tag}`}
                onClick={() => handleAddTag(tag)}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
              >
                {tag}
              </button>
            ))}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Remove Tag
            </div>
            {AVAILABLE_TAGS.map(tag => (
              <button
                key={`remove-${tag}`}
                onClick={() => handleRemoveTag(tag)}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-accent-foreground"
              >
                {tag}
              </button>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Visibility */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5">
              <Eye className="w-3.5 h-3.5" />
              Visibility
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" sideOffset={8}>
            <button
              onClick={() => handleSetHidden(false)}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <Eye className="w-3.5 h-3.5 mr-2" />
              Set Visible
            </button>
            <button
              onClick={() => handleSetHidden(true)}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <EyeOff className="w-3.5 h-3.5 mr-2" />
              Set Hidden
            </button>
            <DropdownMenuSeparator />
            <button
              onClick={() => handleSetMature(true)}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <ShieldAlert className="w-3.5 h-3.5 mr-2" />
              Set Mature
            </button>
            <button
              onClick={() => handleSetMature(false)}
              className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-2" />
              Set General
            </button>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Collection */}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onAddToCollection}>
          <FolderPlus className="w-3.5 h-3.5" />
          Collection
        </Button>

        {/* Export */}
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1.5" onClick={onExport}>
          <Download className="w-3.5 h-3.5" />
          Export
        </Button>

        {/* Delete */}
        <div className="border-l border-border ml-1 pl-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
