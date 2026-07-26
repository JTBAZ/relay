'use client'

import { useState, useCallback } from 'react'
import { EditorSidebar } from '@/components/profile-editor/editor-sidebar'
import { ProfileCanvas } from '@/components/profile-editor/profile-canvas'
import { BatchActionBar } from '@/components/profile-editor/batch-action-bar'
import { UpdateComposer, type UpdateData } from '@/components/profile-editor/update-composer'
import { CustomizerPanel } from '@/components/profile-editor/customizer-panel'
import { type ProfileTheme, DEFAULT_THEME } from '@/lib/profile-theme'

export type ViewMode = 'public' | 'tier' | 'creator'
export type SelectedSection = string | null
export type SelectedMedia = Set<string>
export type CurrentUpdate = UpdateData & { timestamp: string; author: string }

// Default update for demo
const DEFAULT_UPDATE: CurrentUpdate = {
  body: 'Commissions are open for January! Tier 2+ members get priority booking and 15% off. DM me to reserve your slot. Working on a new series inspired by winter forests.',
  tiers: ['public', 'basic'],
  notify: false,
  timestamp: '2 hours ago',
  author: 'Elena Adler',
}

export default function ProfileEditorPage() {
  // View & selection state
  const [viewMode, setViewMode] = useState<ViewMode>('creator')
  const [selectedSection, setSelectedSection] = useState<SelectedSection>(null)
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia>(new Set())
  
  // Modal states
  const [showComposer, setShowComposer] = useState(false)
  const [showCurateGallery, setShowCurateGallery] = useState(false)
  
  // Content state
  const [currentUpdate, setCurrentUpdate] = useState<CurrentUpdate | null>(DEFAULT_UPDATE)
  
  // Theme state — shared between customizer and canvas
  const [theme, setTheme] = useState<ProfileTheme>(DEFAULT_THEME)

  const toggleMediaSelection = useCallback((id: string, shiftKey: boolean) => {
    setSelectedMedia(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        if (!shiftKey) next.clear()
        next.add(id)
      }
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedMedia(new Set())
    setSelectedSection(null)
  }, [])

  const handlePublishUpdate = useCallback((data: UpdateData) => {
    setCurrentUpdate({
      ...data,
      timestamp: 'Just now',
      author: 'Elena Adler',
    })
    setShowComposer(false)
  }, [])

  const handleThemeChange = useCallback((patch: Partial<ProfileTheme>) => {
    setTheme(prev => ({ ...prev, ...patch }))
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Sidebar — narrow toolbox */}
      <EditorSidebar 
        onPostUpdate={() => setShowComposer(true)}
        onCurateGallery={() => setShowCurateGallery(true)}
      />

      {/* Center Canvas — the profile page */}
      <main className="flex-1 overflow-auto bg-surface-canvas">
        <div className="max-w-4xl mx-auto py-8 px-6">
          {/* View mode chips */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              {(['public', 'tier', 'creator'] as ViewMode[]).map(mode => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                    viewMode === mode
                      ? 'bg-accent text-primary-foreground'
                      : 'bg-surface-2 text-text-mid hover:bg-surface-3'
                  }`}
                >
                  {mode === 'tier' ? 'Tier Member' : mode}
                </button>
              ))}
            </div>
            <span className="text-xs text-text-mute">Preview as</span>
          </div>

          {/* The Profile Canvas — receives theme for rendering */}
          <ProfileCanvas
            viewMode={viewMode}
            selectedSection={selectedSection}
            setSelectedSection={setSelectedSection}
            selectedMedia={selectedMedia}
            toggleMediaSelection={toggleMediaSelection}
            currentUpdate={currentUpdate}
            onReplaceUpdate={() => setShowComposer(true)}
            theme={theme}
            onThemeChange={handleThemeChange}
          />
        </div>
      </main>

      {/* Batch Action Bar — appears when media selected */}
      {selectedMedia.size > 0 && (
        <BatchActionBar
          count={selectedMedia.size}
          onClear={clearSelection}
        />
      )}

      {/* Update Composer Modal */}
      {showComposer && (
        <UpdateComposer
          onClose={() => setShowComposer(false)}
          onPublish={handlePublishUpdate}
        />
      )}

      {/* Curate Gallery Modal — customizer panel */}
      {showCurateGallery && (
        <CustomizerPanel
          theme={theme}
          onChange={handleThemeChange}
          onClose={() => setShowCurateGallery(false)}
        />
      )}
    </div>
  )
}
