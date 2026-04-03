"use client"

import { memo } from "react"
import { Play, Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"

export interface MediaItem {
  id: string
  type: "image" | "video"
  title: string
  thumbnail: string
  duration?: string
  tags: string[]
  tier: string
  isHidden: boolean
  isMature: boolean
  dimensions: string
  fileSize: string
}

interface MediaCardProps {
  item: MediaItem
  isSelected: boolean
  onSelect: (id: string, selected: boolean) => void
  onToggleHidden: (id: string) => void
  onToggleMature: (id: string) => void
}

export const MediaCard = memo(function MediaCard({
  item,
  isSelected,
  onSelect,
  onToggleHidden,
  onToggleMature,
}: MediaCardProps) {
  return (
    <div
      className={cn(
        "group relative bg-card rounded border transition-all cursor-pointer",
        isSelected
          ? "border-primary ring-1 ring-primary/30"
          : "border-border hover:border-muted-foreground/30",
        item.isHidden && "opacity-40"
      )}
      onClick={() => onSelect(item.id, !isSelected)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-muted rounded-t overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, 
              oklch(0.22 0.012 ${160 + parseInt(item.id, 36) % 40}) 0%, 
              oklch(0.18 0.008 ${140 + parseInt(item.id, 36) % 60}) 100%)`,
          }}
        />
        
        {/* Placeholder pattern */}
        <svg
          className="absolute inset-0 w-full h-full opacity-10"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <pattern id={`grid-${item.id}`} width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
          <rect width="100" height="100" fill={`url(#grid-${item.id})`} />
        </svg>

        {/* Hidden overlay */}
        {item.isHidden && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <EyeOff className="w-8 h-8 text-muted-foreground/50" />
          </div>
        )}

        {/* Video indicator */}
        {item.type === "video" && !item.isHidden && (
          <>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-background/80 flex items-center justify-center backdrop-blur-sm">
                <Play className="w-3.5 h-3.5 text-foreground fill-current ml-0.5" />
              </div>
            </div>
            <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-background/80 rounded text-[10px] font-mono text-foreground backdrop-blur-sm">
              {item.duration}
            </div>
          </>
        )}

        {/* 18+ Mature badge */}
        {item.isMature && (
          <div className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-background/70 rounded text-[9px] font-bold text-foreground/70 backdrop-blur-sm">
            18+
          </div>
        )}

        {/* Selection checkbox */}
        <div
          className={cn(
            "absolute top-1.5 left-1.5 transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect(item.id, checked as boolean)}
            className="bg-background/80 backdrop-blur-sm"
          />
        </div>

        {/* Quick actions */}
        <div
          className={cn(
            "absolute top-1.5 right-1.5 flex items-center gap-0.5 transition-opacity",
            "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => onToggleHidden(item.id)}
            className="w-5 h-5 rounded flex items-center justify-center backdrop-blur-sm transition-colors bg-background/80 text-muted-foreground hover:text-foreground"
          >
            {item.isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          </button>
        </div>

      </div>

      {/* Info */}
      <div className="p-2 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-xs font-medium text-foreground truncate flex-1" title={item.title}>
            {item.title}
          </h4>
          <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">
            {item.tier}
          </Badge>
        </div>
        
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{item.dimensions}</span>
          <span>{item.fileSize}</span>
        </div>

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-0.5">
            {item.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-1 py-0.5 text-[9px] bg-muted rounded text-muted-foreground"
              >
                {tag}
              </span>
            ))}
            {item.tags.length > 2 && (
              <span className="px-1 py-0.5 text-[9px] text-muted-foreground">
                +{item.tags.length - 2}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
})
