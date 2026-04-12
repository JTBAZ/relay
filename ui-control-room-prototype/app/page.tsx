"use client"

import { useState, useMemo } from "react"
import { TopBar } from "@/components/control-room/top-bar"
import { Sidebar } from "@/components/control-room/sidebar"
import { MediaGrid } from "@/components/control-room/media-grid"
import type { MediaItem } from "@/components/control-room/media-card"
import type { Collection } from "@/components/control-room/sidebar"

// Seeded random number generator for deterministic data
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function generateMediaItems(count: number): MediaItem[] {
  const titles = [
    "DSC_0001_final_v2", "hero_banner_q1", "product_shot_alpha", "campaign_portrait_01",
    "editorial_spread_pg3", "bts_interview_cut", "brand_refresh_logo", "social_carousel_1",
    "lifestyle_outdoor", "detail_macro_shot", "team_photo_2024", "event_coverage_main",
    "packaging_render_3d", "motion_loop_bg", "testimonial_headshot", "infographic_stats",
    "icon_set_export", "texture_overlay_01", "color_palette_ref", "wireframe_mobile",
  ]
  const tags = ["Portrait", "Landscape", "Editorial", "Product", "BTS", "Raw", "Final", "Archive"]
  const tiers = ["Tier 1", "Tier 2", "Tier 3", "Tier 4"]
  const dimensions = ["1920x1080", "3840x2160", "1080x1920", "2400x1600", "4000x3000", "1200x630"]
  const fileSizes = ["2.4 MB", "8.1 MB", "1.2 MB", "15.3 MB", "4.7 MB", "890 KB"]
  const durations = ["0:32", "1:15", "2:45", "0:58", "3:22", "1:47", "4:10", "2:03"]

  return Array.from({ length: count }, (_, i) => {
    const seed1 = i * 7 + 1
    const seed2 = i * 13 + 2
    const seed3 = i * 19 + 3
    const seed4 = i * 23 + 4
    const seed5 = i * 29 + 5
    const seed6 = i * 31 + 6

    const isVideo = seededRandom(seed1) > 0.7
    const tagCount = Math.floor(seededRandom(seed2) * 3) + 1
    const itemTags: string[] = []
    for (let t = 0; t < tagCount; t++) {
      const tagIndex = Math.floor(seededRandom(seed3 + t * 100) * tags.length)
      const tag = tags[tagIndex]
      if (!itemTags.includes(tag)) itemTags.push(tag)
    }

    return {
      id: `asset-${i.toString().padStart(4, "0")}`,
      type: isVideo ? "video" : "image",
      title: titles[i % titles.length] + (i > 19 ? `_${Math.floor(i / 20)}` : ""),
      thumbnail: `/placeholder-${i % 10}.jpg`,
      duration: isVideo ? durations[Math.floor(seededRandom(seed4) * durations.length)] : undefined,
      tags: itemTags,
      tier: tiers[Math.floor(seededRandom(seed5) * tiers.length)],
      isHidden: seededRandom(seed6) > 0.9,
      isMature: seededRandom(seed6 + 50) > 0.8,
      dimensions: dimensions[Math.floor(seededRandom(seed4 + 25) * dimensions.length)],
      fileSize: fileSizes[Math.floor(seededRandom(seed5 + 25) * fileSizes.length)],
      collectionIds: [],
    }
  })
}

const INITIAL_ITEMS: MediaItem[] = generateMediaItems(500)

const INITIAL_COLLECTIONS: Collection[] = [
  { id: "recent", name: "Recent Uploads", count: 156 },
  { id: "hero", name: "Hero Images", count: 89 },
  { id: "campaign-q1", name: "Campaign Q1", count: 234 },
  { id: "campaign-q2", name: "Campaign Q2", count: 198 },
  { id: "brand-refresh", name: "Brand Refresh", count: 421 },
  { id: "social", name: "Social Media", count: 567 },
  { id: "archive-2024", name: "Archive 2024", count: 1182 },
]

export default function ControlRoomPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedTiers, setSelectedTiers] = useState<string[]>([])
  // All three visibility filters default to ON
  const [visibility, setVisibility] = useState({
    workspace: true,
    hidden: true,
    mature: true,
  })
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [collections, setCollections] = useState<Collection[]>(INITIAL_COLLECTIONS)
  const [items, setItems] = useState<MediaItem[]>(INITIAL_ITEMS)
  const [syncStatus] = useState<"synced" | "syncing" | "error">("synced")

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!item.title.toLowerCase().includes(query) &&
            !item.tags.some(t => t.toLowerCase().includes(query))) {
          return false
        }
      }
      if (selectedTags.length > 0) {
        if (!selectedTags.some(tag => item.tags.includes(tag))) return false
      }
      if (selectedTiers.length > 0) {
        if (!selectedTiers.includes(item.tier)) return false
      }
      if (!visibility.hidden && item.isHidden) return false
      if (!visibility.mature && item.isMature) return false
      if (selectedCollection && selectedCollection !== "all") {
        if (!(item.collectionIds ?? []).includes(selectedCollection)) return false
      }
      return true
    })
  }, [items, searchQuery, selectedTags, selectedTiers, visibility, selectedCollection])

  const handleTagToggle = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }
  const handleTierToggle = (tier: string) => {
    setSelectedTiers(prev => prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier])
  }
  const handleVisibilityChange = (key: keyof typeof visibility, value: boolean) => {
    setVisibility(prev => ({ ...prev, [key]: value }))
  }

  const handleNewCollection = (name: string) => {
    const id = `col-${Date.now()}`
    setCollections(prev => [...prev, { id, name, count: 0 }])
    return id
  }

  const handleAddToCollection = (collectionId: string, selectedIds: Set<string>) => {
    setItems(prev => prev.map(item =>
      selectedIds.has(item.id)
        ? { ...item, collectionIds: [...new Set([...(item.collectionIds ?? []), collectionId])] }
        : item
    ))
    setCollections(prev => prev.map(col =>
      col.id === collectionId
        ? { ...col, count: col.count + selectedIds.size }
        : col
    ))
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <TopBar
        syncStatus={syncStatus}
        creatorName="Studio Archive"
        patronCount={321}
        monthlyRevenue={1235}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          selectedTiers={selectedTiers}
          onTierToggle={handleTierToggle}
          visibility={visibility}
          onVisibilityChange={handleVisibilityChange}
          selectedCollection={selectedCollection}
          onCollectionSelect={setSelectedCollection}
          collections={collections}
          onNewCollection={handleNewCollection}
        />
        <MediaGrid
          items={filteredItems}
          onItemsChange={setItems}
          collections={collections}
          onAddToCollection={handleAddToCollection}
        />
      </div>
    </div>
  )
}
