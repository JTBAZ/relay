'use client'

import { MediaCard } from './media-card'
import { VariantStackCard } from './variant-stack-card'
import { Grid2X2, LayoutGrid, Sparkles, BookOpen, List } from 'lucide-react'
import type { ViewMode, SelectedMedia } from '@/app/designer/page'

type GalleryLayout = 'grid' | 'masonry' | 'showcase' | 'editorial' | 'list'

interface GallerySectionProps {
  title: string
  layout: GalleryLayout
  viewMode: ViewMode
  selectedMedia: SelectedMedia
  toggleMediaSelection: (id: string, shiftKey: boolean) => void
  mediaIds: string[]
  showVariantStack?: boolean
  onLayoutChange?: (layout: GalleryLayout) => void
}

// Mock media data
const mockMedia: Record<string, { title: string; tier?: number; aspectRatio: string }> = {
  m1: { title: 'Autumn Series No. 4', aspectRatio: '4/5' },
  m2: { title: 'On Silence', tier: 2, aspectRatio: '3/4' },
  m3: { title: 'Dreamscape VII', aspectRatio: '16/9' },
  m4: { title: 'Portrait Study III', tier: 1, aspectRatio: '3/4' },
  m5: { title: 'Margins Essay', aspectRatio: '1/1' },
  m6: { title: 'Digital Flora', aspectRatio: '4/5' },
  m7: { title: 'Night Walk', tier: 3, aspectRatio: '16/9' },
  m8: { title: 'Process Notes', aspectRatio: '3/4' },
  m9: { title: 'Sketch Collection', aspectRatio: '1/1' },
  m10: { title: 'Chromatic Study', aspectRatio: '4/5' },
  m11: { title: 'Ambient Vol. 2', tier: 2, aspectRatio: '1/1' },
  m12: { title: 'Reflection', aspectRatio: '3/4' },
  m13: { title: 'Self Portrait', aspectRatio: '3/4' },
  m14: { title: 'Morning Light', aspectRatio: '4/5' },
  m15: { title: 'Studio Session', tier: 1, aspectRatio: '16/9' },
  m16: { title: 'Quiet Moment', aspectRatio: '3/4' },
}

export function GallerySection({
  title,
  layout,
  viewMode,
  selectedMedia,
  toggleMediaSelection,
  mediaIds,
  showVariantStack,
  onLayoutChange,
}: GallerySectionProps) {
  const gridClass =
    layout === 'list'
      ? 'flex flex-col gap-2'
      : layout === 'showcase'
      ? 'grid grid-cols-3 gap-4'
      : layout === 'masonry'
      ? 'columns-2 gap-4 space-y-4'
      : layout === 'editorial'
      ? 'grid grid-cols-2 gap-6'
      : 'grid grid-cols-3 gap-4'

  return (
    <div className="bg-surface-1 rounded-2xl p-6 border border-border">
      {/* Section header with layout toggle */}
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-medium text-text-hi">{title}</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onLayoutChange?.('grid')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              layout === 'grid' ? 'bg-surface-3 text-text-hi' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
            }`}
            data-tooltip="Grid view"
          >
            <Grid2X2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onLayoutChange?.('masonry')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              layout === 'masonry' ? 'bg-surface-3 text-text-hi' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
            }`}
            data-tooltip="Masonry view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onLayoutChange?.('showcase')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              layout === 'showcase' ? 'bg-surface-3 text-text-hi' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
            }`}
            data-tooltip="Showcase view"
          >
            <Sparkles className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onLayoutChange?.('editorial')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              layout === 'editorial' ? 'bg-surface-3 text-text-hi' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
            }`}
            data-tooltip="Editorial view"
          >
            <BookOpen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onLayoutChange?.('list')}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              layout === 'list' ? 'bg-surface-3 text-text-hi' : 'text-text-mute hover:text-text-lo hover:bg-surface-2'
            }`}
            data-tooltip="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Media grid or list */}
      {layout === 'list' ? (
        // List view with thumbnails
        <div className="flex flex-col gap-2">
          {mediaIds.map(id => {
            const media = mockMedia[id]
            if (!media) return null
            const isSelected = selectedMedia.has(id)
            const isLocked = !!media.tier && viewMode === 'public'
            return (
              <button
                key={id}
                onClick={(e) => toggleMediaSelection(id, e.shiftKey)}
                className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'border-accent bg-accent/10'
                    : 'border-border bg-surface-2 hover:bg-surface-3'
                }`}
              >
                {/* Thumbnail */}
                <div className="w-12 h-12 flex-shrink-0 rounded bg-gradient-to-br from-surface-3 to-surface-2 border border-border flex items-center justify-center">
                  <span className="text-[10px] text-text-mute font-mono">{id}</span>
                </div>
                {/* Title + meta */}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-medium text-text-hi truncate">{media.title}</p>
                  <p className="text-[11px] text-text-mute">
                    {isLocked && media.tier ? `Tier ${media.tier} • ` : ''}
                    {media.aspectRatio}
                  </p>
                </div>
                {/* Tier badge */}
                {media.tier && (
                  <span className={`text-xs font-medium px-2 py-1 rounded-md flex-shrink-0 ${
                    viewMode === 'public' ? 'bg-select/10 text-select' : 'bg-accent/10 text-accent'
                  }`}>
                    T{media.tier}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ) : (
        // Grid/masonry/showcase/editorial views
        <div className={gridClass}>
          {showVariantStack && (
            <VariantStackCard
              id="stack-autumn"
              title="Autumn Series"
              variantCount={9}
              isSelected={selectedMedia.has('stack-autumn')}
              onClick={(e) => toggleMediaSelection('stack-autumn', e.shiftKey)}
            />
          )}
          {mediaIds.map(id => {
            const media = mockMedia[id]
            if (!media) return null
            return (
              <MediaCard
                key={id}
                id={id}
                title={media.title}
                tier={media.tier}
                aspectRatio={media.aspectRatio}
                isSelected={selectedMedia.has(id)}
                isLocked={!!media.tier && viewMode === 'public'}
                onClick={(e) => toggleMediaSelection(id, e.shiftKey)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
