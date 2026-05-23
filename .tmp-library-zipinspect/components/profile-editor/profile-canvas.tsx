'use client'

import { HeroSection } from './hero-section'
import { GallerySection } from './gallery-section'
import { SectionWrapper } from './section-wrapper'
import { UpdateCard, OlderUpdatesRow } from './update-card'
import type { ViewMode, SelectedSection, SelectedMedia, CurrentUpdate } from '@/app/designer/page'
import type { ProfileTheme } from '@/lib/profile-theme'

interface ProfileCanvasProps {
  viewMode: ViewMode
  selectedSection: SelectedSection
  setSelectedSection: (id: SelectedSection) => void
  selectedMedia: SelectedMedia
  toggleMediaSelection: (id: string, shiftKey: boolean) => void
  currentUpdate: CurrentUpdate | null
  onReplaceUpdate?: () => void
  theme?: ProfileTheme
  onThemeChange?: (patch: Partial<ProfileTheme>) => void
}

export function ProfileCanvas({
  viewMode,
  selectedSection,
  setSelectedSection,
  selectedMedia,
  toggleMediaSelection,
  currentUpdate,
  onReplaceUpdate,
  theme,
  onThemeChange,
}: ProfileCanvasProps) {
  // Get visible sections sorted by order
  const visibleSections = theme?.sections
    ?.filter(s => s.visible)
    .sort((a, b) => a.order - b.order) ?? []
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <SectionWrapper
        id="hero"
        label="Hero"
        isSelected={selectedSection === 'hero'}
        onSelect={() => setSelectedSection(selectedSection === 'hero' ? null : 'hero')}
      >
        <HeroSection 
          viewMode={viewMode} 
          isSelected={selectedSection === 'hero'}
          heroStyle={theme?.heroStyle}
          heroHeight={theme?.heroHeight}
          showBio={theme?.showBio}
          showSocials={theme?.showSocials}
        />
      </SectionWrapper>

      {/* Current Update — billboard beneath hero */}
      {currentUpdate && (
        <SectionWrapper
          id="update"
          label="Current Update"
          isSelected={selectedSection === 'update'}
          onSelect={() => setSelectedSection(selectedSection === 'update' ? null : 'update')}
        >
          <UpdateCard
            update={currentUpdate}
            isEditing={viewMode === 'creator'}
            onReplace={onReplaceUpdate}
          />
        </SectionWrapper>
      )}

      {/* Older updates row (collapsed) */}
      <OlderUpdatesRow count={5} />

      {/* Dynamic Gallery Sections from Theme */}
      {visibleSections.map(section => (
        <SectionWrapper
          key={section.id}
          id={section.id}
          label={section.title}
          isSelected={selectedSection === section.id}
          onSelect={() => setSelectedSection(selectedSection === section.id ? null : section.id)}
          canReorder
        >
          <GallerySection
            title={section.title}
            layout={section.layout}
            viewMode={viewMode}
            selectedMedia={selectedMedia}
            toggleMediaSelection={toggleMediaSelection}
            mediaIds={section.itemIds}
            showVariantStack={section.id === 'gallery'}
            onLayoutChange={(newLayout) => {
              const updatedSections = (theme?.sections ?? []).map(s =>
                s.id === section.id ? { ...s, layout: newLayout } : s
              )
              onThemeChange?.({ sections: updatedSections })
            }}
          />
        </SectionWrapper>
      ))}
    </div>
  )
}
