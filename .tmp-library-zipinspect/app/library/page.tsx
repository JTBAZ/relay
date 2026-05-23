'use client'

import { useCallback, useState } from 'react'
import type { MediaTypeValue } from '@/components/library/MediaTypeMultiSelect'
import type { LibraryMode } from '@/components/library/LibraryPowerPanel'
import GallerySidebar from '@/components/library/GallerySidebar'
import GalleryGrid from '@/components/library/GalleryGrid'
import LibraryTopBar from '@/components/library/LibraryTopBar'
import LibraryPowerPanel from '@/components/library/LibraryPowerPanel'
import CollectionBuilderDrawer from '@/components/library/CollectionBuilderDrawer'
import ImportBin, { type ImportBinItem } from '@/components/library/ImportBin'
import CreatePostModal, { type PostDraft } from '@/components/library/CreatePostModal'
import type { GalleryItem, Collection, FacetsData, PostVisibility } from '@/lib/relay-api'
import type { PostGalleryGroup } from '@/lib/gallery-group'

// ---------------------------------------------------------------------------
// Mock data (replaces real API calls for preview)
// ---------------------------------------------------------------------------

const MOCK_FACETS: FacetsData = {
  tiers: [
    { tier_id: 'free', title: 'Free', amount_cents: 0, post_count: 12 },
    { tier_id: 'supporter', title: 'Supporter', amount_cents: 500, post_count: 24 },
    { tier_id: 'patron', title: 'Patron', amount_cents: 1000, post_count: 38 },
  ],
  tag_ids: ['portrait', 'landscape', 'concept', 'sketch', 'lineart', 'color', 'wip', 'fan-art', 'original', 'study'],
  export_total_bytes: 2_400_000_000,
  export_media_count: 74,
}

const MOCK_COLLECTIONS: Collection[] = [
  { collection_id: 'col-1', title: 'Fan Favorites', post_ids: ['p1', 'p2', 'p3', 'p4'] },
  { collection_id: 'col-2', title: 'Portrait Studies', post_ids: ['p5', 'p6', 'p7'] },
  { collection_id: 'col-3', title: 'Autumn Series', post_ids: ['p8', 'p9'] },
]

const MOCK_ITEMS: GalleryItem[] = Array.from({ length: 24 }, (_, i) => ({
  post_id: `p${i + 1}`,
  title: [
    'Dreamscape', 'Wanderer Study', 'Crimson Dusk', 'Portrait in Blue',
    'Evening Light', 'Storm Coming', 'Wild Garden', 'The Archive',
    'Shadow Play', 'Golden Hour', 'Ember', 'Reverie',
  ][i % 12] + ` No.${i + 1}`,
  tier_ids: i % 3 === 0 ? [] : i % 3 === 1 ? ['supporter'] : ['patron'],
  tag_ids: [['portrait', 'study'], ['landscape', 'color'], ['sketch', 'wip'], ['concept', 'original']][i % 4],
  mime_type: i % 6 === 0 ? 'video/mp4' : 'image/jpeg',
  has_export: false, // no real URLs in preview
  visibility: (i % 7 === 0 ? 'hidden' : 'visible') as PostVisibility,
  shadow_cover: false,
}))

const MOCK_GROUPS: PostGalleryGroup[] = MOCK_ITEMS.map((item, idx) => {
  // For 'Wanderer Study No.2' (p2), add 3 color block media items for carousel testing
  if (item.post_id === 'p2') {
    return {
      post_id: item.post_id,
      items: [
        item,
        {
          ...item,
          post_id: 'p2-media-1',
          mime_type: 'image/jpeg',
          has_export: true,
          pipeline_status: 'complete',
          content_url_path: 'color-1',
        },
        {
          ...item,
          post_id: 'p2-media-2',
          mime_type: 'image/jpeg',
          has_export: true,
          pipeline_status: 'complete',
          content_url_path: 'color-2',
        },
        {
          ...item,
          post_id: 'p2-media-3',
          mime_type: 'image/jpeg',
          has_export: true,
          pipeline_status: 'complete',
          content_url_path: 'color-3',
        },
      ],
    }
  }
  return {
    post_id: item.post_id,
    items: [item],
  }
})

const TIER_TITLE_BY_ID: Record<string, string> = {
  free: 'Free',
  supporter: 'Supporter',
  patron: 'Patron',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LibraryPage() {
  // Filter state
  const [q, setQ] = useState('')
  const [mediaTypes, setMediaTypes] = useState<MediaTypeValue[]>([])
  const [tagPick, setTagPick] = useState<string[]>([])
  const [tierPick, setTierPick] = useState<string[]>([])
  const [visibility, setVisibility] = useState({ hidden: false, mature: false })
  const [showTextOnlyPosts, setShowTextOnlyPosts] = useState(false)
  const [showShadowCovers, setShowShadowCovers] = useState(false)
  const [videoLoop, setVideoLoop] = useState(true)
  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null)

  // Selection state
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectedItems, setSelectedItems] = useState<GalleryItem[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  // Power panel state
  const [powerPanelOpen, setPowerPanelOpen] = useState(false)
  const [powerPanelMode, setPowerPanelMode] = useState<LibraryMode>('media')

  // Collection builder state
  const [showCollectionBuilder, setShowCollectionBuilder] = useState(false)

  // Grid density
  const [gridDensity] = useState<'normal' | 'dense'>('normal')

  // Create post modal
  const [createPostOpen, setCreatePostOpen] = useState(false)
  const [createPostMedia, setCreatePostMedia] = useState<ImportBinItem[]>([])

  const handleToggleSelectGroup = useCallback((items: GalleryItem[]) => {
    if (selectionMode) {
      // In selection mode, just toggle the checkbox and add/remove from selection
      setSelectedKeys(prev => {
        const next = new Set(prev)
        const allSelected = items.every(it => next.has(it.post_id))
        if (allSelected) {
          items.forEach(it => next.delete(it.post_id))
        } else {
          items.forEach(it => next.add(it.post_id))
        }
        return next
      })
      setSelectedItems(prev => {
        const ids = new Set(items.map(it => it.post_id))
        const alreadyIn = items.every(it => prev.some(p => p.post_id === it.post_id))
        if (alreadyIn) return prev.filter(p => !ids.has(p.post_id))
        const filtered = prev.filter(p => !ids.has(p.post_id))
        return [...filtered, ...items]
      })
    } else {
      // Normal mode: toggle checkbox, open power panel
      setSelectedKeys(prev => {
        const next = new Set(prev)
        const allSelected = items.every(it => next.has(it.post_id))
        if (allSelected) {
          items.forEach(it => next.delete(it.post_id))
        } else {
          items.forEach(it => next.add(it.post_id))
        }
        return next
      })
      setSelectedItems(prev => {
        const ids = new Set(items.map(it => it.post_id))
        const alreadyIn = items.every(it => prev.some(p => p.post_id === it.post_id))
        if (alreadyIn) return prev.filter(p => !ids.has(p.post_id))
        const filtered = prev.filter(p => !ids.has(p.post_id))
        return [...filtered, ...items]
      })
      setPowerPanelOpen(true)
    }
  }, [selectionMode])

  const handleToggleCheckbox = useCallback((items: GalleryItem[]) => {
    // Checkbox clicked: toggle selection mode
    setSelectionMode(prev => !prev)
    if (!selectionMode) {
      // Entering selection mode: select this group
      setSelectedKeys(new Set(items.map(it => it.post_id)))
      setSelectedItems(items)
    }
  }, [selectionMode])

  const handleExitSelectionMode = useCallback(() => {
    setSelectionMode(false)
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedKeys(new Set())
    setSelectedItems([])
    setPowerPanelOpen(false)
  }, [])

  const handleAddSelectionToCollection = useCallback((collectionId: string) => {
    // In a real app this would call the API
    console.log('[v0] Adding', selectedKeys.size, 'items to collection', collectionId)
  }, [selectedKeys])

  const handleToggleTag = useCallback((tag: string) => {
    setTagPick(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }, [])

  const handleToggleTier = useCallback((tier: string) => {
    setTierPick(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier])
  }, [])

  const setItemVisibility = useCallback(async (_items: GalleryItem[], _vis: PostVisibility) => {
    // stub — would call API
  }, [])

  const onApplyBulkTagDelta = useCallback(async (_delta: { add: string[]; remove: string[] }) => {
    // stub — would call API
  }, [])

  // Apply client-side filters to mock groups
  const filteredGroups = MOCK_GROUPS.filter(g => {
    const item = g.items[0]
    if (!item) return false
    if (q && !item.title.toLowerCase().includes(q.toLowerCase())) return false
    if (tagPick.length > 0 && !tagPick.some(t => item.tag_ids.includes(t))) return false
    if (tierPick.length > 0 && !tierPick.some(t => item.tier_ids.includes(t))) return false
    if (!visibility.hidden && item.visibility === 'hidden') return false
    return true
  })

  const selectedPostIds = Array.from(selectedKeys)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--lib-bg,#0a0a0a)]">
      {/* Top bar */}
      <LibraryTopBar
        creatorDisplayName="Artist Name"
        patreonName="artistname"
        syncStatus="synced"
        patronCount={312}
      />

      {/* Body: sidebar + grid + power panel */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">

        {/* Sidebar */}
        <GallerySidebar
          creatorId="preview-creator"
          facets={MOCK_FACETS}
          q={q}
          onSetQ={setQ}
          mediaTypes={mediaTypes}
          onSetMediaTypes={setMediaTypes}
          tagPick={tagPick}
          tierPick={tierPick}
          visibility={visibility}
          onSetVisibility={setVisibility}
          showTextOnlyPosts={showTextOnlyPosts}
          onSetShowTextOnlyPosts={setShowTextOnlyPosts}
          showShadowCovers={showShadowCovers}
          onSetShowShadowCovers={setShowShadowCovers}
          videoLoop={videoLoop}
          onSetVideoLoop={setVideoLoop}
          onToggleTag={handleToggleTag}
          onToggleTier={handleToggleTier}
          freePublicTierIds={['free']}
          onToggleFreePublicTierGroup={() => handleToggleTier('free')}
          collections={MOCK_COLLECTIONS}
          activeCollectionId={activeCollectionId}
          onSelectCollection={setActiveCollectionId}
          selectedPostCount={selectedKeys.size}
          onRequestAddSelectionToCollection={handleAddSelectionToCollection}
          assetsInView={filteredGroups.length}
          collectionCount={MOCK_COLLECTIONS.length}
        />

        {/* Gallery grid + import bin */}
        <div className="flex flex-1 flex-col min-h-0 overflow-y-auto">
          <ImportBin
            onAddToNewPost={(items: ImportBinItem[]) => {
              setCreatePostMedia(items)
              setCreatePostOpen(true)
            }}
          />
          <GalleryGrid
            groups={filteredGroups}
            tierTitleById={TIER_TITLE_BY_ID}
            tierFacets={MOCK_FACETS.tiers}
            selectedKeys={selectedKeys}
            gridDensity={gridDensity}
            onToggleSelectGroup={handleToggleSelectGroup}
            onToggleCheckbox={handleToggleCheckbox}
            onExitSelectionMode={handleExitSelectionMode}
            selectionMode={selectionMode}
            onFocusIndex={() => {}}
            creatorId="preview-creator"
          />
        </div>

        {/* Power panel (slide-in from right) */}
        <LibraryPowerPanel
          isOpen={powerPanelOpen}
          onClose={() => setPowerPanelOpen(false)}
          mode={powerPanelMode}
          onModeChange={setPowerPanelMode}
          selectedItems={selectedItems}
          selectedPostMediaItems={selectedItems}
          onSelectMediaItem={() => {}}
          selectedPostIds={selectedPostIds}
          collections={MOCK_COLLECTIONS}
          activeCollectionId={activeCollectionId}
          facets={MOCK_FACETS}
          tierTitleById={TIER_TITLE_BY_ID}
          creatorId="preview-creator"
          onClearSelection={handleClearSelection}
          onListRefresh={() => {}}
          onCollectionsReload={() => {}}
          onSelectCollection={setActiveCollectionId}
          onInspectPost={() => {}}
          onApplyBulkTagDelta={onApplyBulkTagDelta}
          setItemVisibility={setItemVisibility}
        />
      </div>

      {/* Create post modal */}
      <CreatePostModal
        open={createPostOpen}
        initialMedia={createPostMedia}
        onClose={() => setCreatePostOpen(false)}
        onPublish={(_draft: PostDraft) => {
          setCreatePostOpen(false)
        }}
      />

      {/* Collection builder drawer */}
      <CollectionBuilderDrawer
        creatorId="preview-creator"
        open={showCollectionBuilder}
        onClose={() => setShowCollectionBuilder(false)}
        facets={MOCK_FACETS}
        onComplete={() => setShowCollectionBuilder(false)}
      />
    </div>
  )
}
