'use client'

import { useState } from 'react'
import { NavBar } from "@/components/action-center/nav-bar"
import { GrowthSection } from "@/components/action-center/growth-section"
import { CommunitySection } from "@/components/action-center/community-section"
import { GallerySection } from "@/components/action-center/gallery-section"

type ActiveSection = 'growth' | 'community' | 'curation'

export default function ActionCenterPage() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('growth')
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <NavBar />

      <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-10">

        {/* ── Page header ── */}
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-hi tracking-tight">
              Action Center
            </h1>
            <p className="text-sm text-text-lo mt-1">
              Your dashboard for growth, community, and gallery
            </p>
          </div>
        </header>

        {/* ── Section tabs — pill style ── */}
        <nav className="flex items-center gap-2" aria-label="Section tabs">
          <button
            onClick={() => setActiveSection('growth')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeSection === 'growth'
                ? 'bg-accent text-primary-foreground'
                : 'bg-surface-2 text-text-mid hover:bg-surface-3'
            }`}
          >
            Growth
          </button>
          <button
            onClick={() => setActiveSection('community')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeSection === 'community'
                ? 'bg-accent text-primary-foreground'
                : 'bg-surface-2 text-text-mid hover:bg-surface-3'
            }`}
          >
            Community
          </button>
          <button
            onClick={() => setActiveSection('curation')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeSection === 'curation'
                ? 'bg-accent text-primary-foreground'
                : 'bg-surface-2 text-text-mid hover:bg-surface-3'
            }`}
          >
            Curation
          </button>
        </nav>

        {/* ── Active Section Content ── */}
        {activeSection === 'growth' && (
          <section className="space-y-6">
            <GrowthSection />
          </section>
        )}

        {activeSection === 'community' && (
          <section className="space-y-6">
            <CommunitySection />
          </section>
        )}

        {activeSection === 'curation' && (
          <section className="space-y-6">
            <GallerySection />
          </section>
        )}

        <div className="h-16" />
      </main>
    </div>
  )
}
